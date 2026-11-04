import type { createAdminClient } from '@/lib/supabase/admin'
import { emailShell, escapeHtml, sendEmail } from '@/lib/email'
import { APPEAL_MAX_LENGTH, BanAppealError, appealCutoff, appealDeadline } from '@/lib/appealWindow'
import { banAndDeleteNow } from '@/lib/banAccount'
import { BackgroundCheckStateError, emailAdminDecision, passBackgroundCheck } from '@/lib/backgroundCheck'

type Admin = ReturnType<typeof createAdminClient>

// What happens after an admin denies a background check (denyCleaner in
// lib/backgroundCheck): the cleaner's appeal, the admin's decision on it, and the
// ban once the 7-day window closes without an accepted appeal.

type DenialRow = { pro_id: string; denied_at: string | null; denial_reason: string | null; appeal_submitted_at: string | null }

// For the public appeal page. Only one appeal per denial, within the window.
export async function submitBackgroundCheckAppeal(admin: Admin, token: string, message: string): Promise<void> {
  const text = message.trim()
  if (!text) throw new BanAppealError('Please tell us why the decision should be changed.')
  if (text.length > APPEAL_MAX_LENGTH) throw new BanAppealError(`Please keep your appeal under ${APPEAL_MAX_LENGTH} characters.`)

  const { data: denial } = await admin
    .from('background_checks')
    .select('pro_id, denied_at, appeal_submitted_at')
    .eq('appeal_token', token)
    .maybeSingle()
  if (!denial?.denied_at) throw new BanAppealError('This appeal link is invalid.')
  if (denial.appeal_submitted_at) throw new BanAppealError('You have already sent an appeal. We will email you once it has been reviewed.')
  if (new Date() >= appealDeadline(denial.denied_at)) throw new BanAppealError('The time to appeal this decision has passed.')

  const { error } = await admin
    .from('background_checks')
    .update({ appeal_message: text, appeal_submitted_at: new Date().toISOString() })
    .eq('pro_id', denial.pro_id)
    .is('appeal_submitted_at', null)
  if (error) throw new Error(error.message)
}

async function pendingDenialAppeal(admin: Admin, proId: string): Promise<DenialRow> {
  const { data: denial } = await admin
    .from('background_checks')
    .select('pro_id, denied_at, denial_reason, appeal_submitted_at')
    .eq('pro_id', proId)
    .maybeSingle()
  if (!denial?.denied_at || !denial.appeal_submitted_at) throw new BanAppealError('This appeal has already been decided.')
  return denial
}

// Reverses the denial: the check passes and the cleaner is approved, with the usual
// approval emails.
export async function acceptBackgroundCheckAppeal(admin: Admin, proId: string): Promise<void> {
  await pendingDenialAppeal(admin, proId)
  await passBackgroundCheck(admin, proId)
  await admin
    .from('background_checks')
    .update({ denied_at: null, denial_reason: null, appeal_token: null, appeal_message: null, appeal_submitted_at: null })
    .eq('pro_id', proId)
}

export async function denyBackgroundCheckAppeal(admin: Admin, proId: string): Promise<{ deleted: boolean; deleteError?: string }> {
  const denial = await pendingDenialAppeal(admin, proId)
  return banDeniedCleaner(admin, denial)
}

// Bans the cleaner and deletes their account, once their appeal is denied or the
// window closes. The ban keeps the fee details for reference on the Banned list.
async function banDeniedCleaner(admin: Admin, denial: DenialRow): Promise<{ deleted: boolean; deleteError?: string }> {
  const [{ data: profile }, { data: check }] = await Promise.all([
    admin.from('profiles').select('email, first_name, last_name').eq('id', denial.pro_id).maybeSingle(),
    admin.from('background_checks').select('fee_amount_cents, stripe_payment_intent_id').eq('pro_id', denial.pro_id).maybeSingle(),
  ])
  if (!profile) throw new BackgroundCheckStateError('This cleaner no longer has an account.')

  const result = await banAndDeleteNow(admin, denial.pro_id, denial.denial_reason, {
    fee_amount_cents: check?.fee_amount_cents ?? null,
    stripe_payment_intent_id: check?.stripe_payment_intent_id ?? null,
  })
  // If the delete was held up, the row is still there: stop this denial being picked up again.
  if (!result.deleted) await admin.from('background_checks').update({ denied_at: null }).eq('pro_id', denial.pro_id)

  await sendEmail({
    to: [{ email: profile.email, name: profile.first_name ?? undefined }],
    subject: 'Your Tydio account has been closed',
    htmlContent: emailShell(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">Hi ${escapeHtml(profile.first_name ?? 'there')},</h2>
      <p style="margin:0 0 12px;font-size:15px;color:#475569;line-height:1.6;">
        ${denial.appeal_submitted_at ? 'We reviewed your appeal, and the' : 'The'} decision on your background check stands.
        Your Tydio account has been closed and its data ${result.deleted ? 'has been' : 'will be'} permanently deleted.
      </p>
    `),
  }).catch((err) => console.error('Background check ban email failed', err))
  await emailAdminDecision(profile, 'banned', denial.denial_reason)

  return result
}

// Hourly (see 042_bans_and_background_check_appeals). Bans every cleaner whose
// denial is BAN_APPEAL_DAYS old without an accepted appeal, including any whose
// appeal is still waiting on a decision.
export async function expireBackgroundCheckDenials(admin: Admin, now = new Date()): Promise<{ banned: number; failed: number }> {
  const cutoff = appealCutoff(now)
  const { data: due, error } = await admin
    .from('background_checks')
    .select('pro_id, denied_at, denial_reason, appeal_submitted_at')
    .lt('denied_at', cutoff)
  if (error) throw new Error(error.message)

  let banned = 0
  let failed = 0
  for (const denial of due ?? []) {
    try {
      await banDeniedCleaner(admin, denial)
      banned++
    } catch (err) {
      failed++
      console.error(`[Tydio] Banning denied cleaner ${denial.pro_id} failed:`, err)
    }
  }
  return { banned, failed }
}
