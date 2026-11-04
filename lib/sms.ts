import type { NotificationPayload } from '@/lib/notifications'
import { twilioClient } from '@/lib/twilio'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/bannedUsers'
import { TYDIO_ADMIN_EMAIL } from '@/lib/email'

type Admin = ReturnType<typeof createAdminClient>

// Twilio's error for a number that has replied STOP to us.
const UNSUBSCRIBED_RECIPIENT = 21610

export const HELP_REPLY = `Tydio: booking alerts and updates. Msg frequency varies. Msg & data rates may apply. For help, email ${TYDIO_ADMIN_EMAIL}. Reply STOP to opt out.`

export function canSendSms(consent: string | null, phone: string | null): boolean {
  return consent === 'opted_in' && !!phone
}

// The keywords Twilio's own opt-out handling acts on. It matches the whole message,
// ignoring case and surrounding spaces, so "stop" counts but "please stop" doesn't.
const KEYWORDS: Record<string, 'STOP' | 'START' | 'HELP'> = {
  STOP: 'STOP', STOPALL: 'STOP', UNSUBSCRIBE: 'STOP', CANCEL: 'STOP', END: 'STOP', QUIT: 'STOP', REVOKE: 'STOP', OPTOUT: 'STOP',
  START: 'START', YES: 'START', UNSTOP: 'START',
  HELP: 'HELP', INFO: 'HELP',
}

export function smsKeyword(body: string | null | undefined): 'STOP' | 'START' | 'HELP' | null {
  return KEYWORDS[(body ?? '').trim().toUpperCase()] ?? null
}

// Phones are saved as typed, so they're matched on the last four digits in the
// query and compared in full after normalizing. A number can belong to both a
// customer and a Tidy Pro account, and a STOP covers every account using it.
export async function setSmsConsentForPhone(admin: Admin, phone: string, consent: 'opted_in' | 'declined'): Promise<number> {
  const target = normalizePhone(phone)
  if (target.length < 4) return 0

  let updated = 0
  for (const table of ['profiles', 'tidypro_profiles'] as const) {
    const { data } = await admin.from(table).select('id, phone').ilike('phone', `%${target.slice(-4)}`)
    const ids = (data ?? []).filter(row => row.phone && normalizePhone(row.phone) === target).map(row => row.id)
    if (ids.length === 0) continue
    const { error } = await admin.from(table).update({ sms_consent: consent }).in('id', ids)
    if (error) throw new Error(error.message)
    updated += ids.length
  }
  return updated
}

export async function sendSms(to: string, body: string): Promise<void> {
  const client = twilioClient()

  try {
    await client.messages.create({ to, from: process.env.TWILIO_PHONE_NUMBER!, body })
  } catch (err) {
    // Catches anyone who replied STOP before the inbound webhook existed, or
    // whose STOP the webhook missed, so we stop trying them.
    if ((err as { code?: number }).code === UNSUBSCRIBED_RECIPIENT) {
      await setSmsConsentForPhone(createAdminClient(), to, 'declined').catch(e =>
        console.error('[Tydio] Recording SMS opt-out failed:', e)
      )
    }
    throw new Error(`SMS send failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function sendSmsForPayload(to: string, payload: NotificationPayload): Promise<void> {
  await sendSms(to, `Tydio: ${payload.body} ${payload.url}`)
}
