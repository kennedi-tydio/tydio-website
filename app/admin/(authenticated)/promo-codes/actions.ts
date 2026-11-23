'use server'

import { revalidatePath } from 'next/cache'
import { isAdminAuthed } from '@/lib/auth/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { PROMO_MESSAGE_MAX, parsePromoCodeForm, type PromoCode } from '@/lib/promoCodes'
import { PROMO_CODE_COLUMNS } from '@/lib/promoCodesData'
import { promoEmailHtml, promoEmailSubject } from '@/lib/promoCodeEmail'

export type PromoFormState = { error?: string; message?: string; createdId?: string }

export async function createPromoCodeAction(_prev: PromoFormState, formData: FormData): Promise<PromoFormState> {
  if (!(await isAdminAuthed())) return { error: 'Unauthorized' }

  const input = parsePromoCodeForm(formData)
  if ('error' in input) return input

  const { data, error } = await createAdminClient().from('promo_codes').insert({ ...input, active: true }).select('id').single()
  if (error) {
    // The unique index on lower(code).
    if (error.code === '23505') return { error: `${input.code} already exists. Pick another code.` }
    return { error: error.message }
  }

  revalidatePath('/admin/promo-codes')
  return { message: `${input.code} created.`, createdId: data.id }
}

export async function setPromoCodeActiveAction(id: string, active: boolean): Promise<{ error?: string }> {
  if (!(await isAdminAuthed())) return { error: 'Unauthorized' }
  const { error } = await createAdminClient().from('promo_codes').update({ active }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/promo-codes')
  return {}
}

export async function sendPromoCodeAction(_prev: PromoFormState, formData: FormData): Promise<PromoFormState> {
  if (!(await isAdminAuthed())) return { error: 'Unauthorized' }

  const promoId = String(formData.get('promo_code_id') ?? '')
  const ids = [...new Set(formData.getAll('ids').map(String).filter(Boolean))]
  const message = String(formData.get('message') ?? '').trim()
  if (!promoId) return { error: 'Choose a promo code to send.' }
  if (ids.length === 0) return { error: 'Select at least one customer.' }
  if (message.length > PROMO_MESSAGE_MAX) return { error: `Keep the message under ${PROMO_MESSAGE_MAX} characters.` }

  const admin = createAdminClient()
  const { data: promoRow } = await admin.from('promo_codes').select(PROMO_CODE_COLUMNS).eq('id', promoId).maybeSingle()
  const promo = promoRow as PromoCode | null
  if (!promo) return { error: 'That promo code no longer exists.' }
  if (!promo.active) return { error: `${promo.code} is turned off. Turn it on before sending it.` }
  if (promo.expires_at && new Date(promo.expires_at).getTime() <= Date.now()) return { error: `${promo.code} has expired.` }

  // Only customers, whatever ids were posted.
  const { data: people, error } = await admin
    .from('profiles')
    .select('id, email, first_name')
    .in('id', ids)
    .eq('role', 'USER')
    .is('banned_at', null)
  if (error) return { error: error.message }
  if (!people?.length) return { error: 'None of those customers can be emailed.' }

  const subject = promoEmailSubject(promo)
  const sent: string[] = []
  // Small batches, so a big send doesn't open hundreds of connections to Brevo at once.
  for (let i = 0; i < people.length; i += 10) {
    await Promise.all(
      people.slice(i, i + 10).map(async (p) => {
        try {
          await sendEmail({
            to: [{ email: p.email, name: p.first_name ?? undefined }],
            subject,
            htmlContent: promoEmailHtml({
              code: promo.code,
              discount_type: promo.discount_type,
              discount_value: Number(promo.discount_value),
              firstName: p.first_name,
              expiresAt: promo.expires_at,
              maxUsesPerCustomer: promo.max_uses_per_customer,
              message,
            }),
          })
          sent.push(p.id)
        } catch (err) {
          console.error(`[Tydio] Promo email to ${p.id} failed:`, err)
        }
      })
    )
  }

  // Recorded only for emails that went out: a recipients-only code works for exactly these people.
  if (sent.length > 0) {
    const now = new Date().toISOString()
    await admin
      .from('promo_code_recipients')
      .upsert(sent.map((profile_id) => ({ promo_code_id: promo.id, profile_id, emailed_at: now })), { onConflict: 'promo_code_id,profile_id' })
  }

  revalidatePath('/admin/promo-codes')
  const failed = people.length - sent.length
  if (sent.length === 0) return { error: 'No emails could be sent. Check the Brevo settings and try again.' }
  return {
    message:
      `Emailed ${promo.code} to ${sent.length} ${sent.length === 1 ? 'customer' : 'customers'}.` +
      (failed > 0 ? ` ${failed} failed to send.` : ''),
  }
}

export async function setPromoFailureResolvedAction(id: string, resolved: boolean): Promise<{ error?: string }> {
  if (!(await isAdminAuthed())) return { error: 'Unauthorized' }
  const { error } = await createAdminClient()
    .from('promo_code_failures')
    .update({ resolved_at: resolved ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/promo-codes')
  return {}
}
