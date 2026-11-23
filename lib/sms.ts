import type { NotificationPayload } from '@/lib/notifications'
import { twilioClient } from '@/lib/twilio'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/bannedUsers'
import { TYDIO_ADMIN_EMAIL } from '@/lib/email'
import { emailAdminManualText, recipientRoleFromUrl, textBody } from '@/lib/manualTextEmail'
import { rowsWithPhone } from '@/lib/smsPhone'

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
  // A customer's texting number (profiles.sms_phone) counts as theirs too.
  const rows = await rowsWithPhone(admin, normalizePhone(phone))

  let updated = 0
  for (const table of ['profiles', 'tidypro_profiles'] as const) {
    const ids = rows.filter(row => row.table === table).map(row => row.id)
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

// 'twilio' sends texts for real. 'email_admin' (used before Twilio approved our number)
// emails each text to the admin, with the booking and both people's numbers, to send by
// hand (lib/manualTextEmail).
export const SMS_DELIVERY = 'twilio' as 'twilio' | 'email_admin'

// During the beta, the admin gets a copy of every text sent to a customer or Tidy Pro,
// to see exactly what people receive. Set to null to stop the copies.
export const SMS_MONITOR_PHONE: string | null = '+18503452532'

function lastFour(phone: string): string {
  return normalizePhone(phone).slice(-4)
}

export function monitorCopyBody(to: string, text: string, delivered: boolean): string {
  const role = recipientRoleFromUrl(text.match(/https?:\/\/\S+/)?.[0] ?? '')
  const who = role === 'TIDYPRO' ? 'Tidy Pro' : role === 'USER' ? 'Customer' : 'Recipient'
  return `[Copy: ${who} ...${lastFour(to)}${delivered ? '' : ', NOT DELIVERED'}] ${text}`
}

async function sendMonitorCopy(to: string, text: string, delivered: boolean): Promise<void> {
  // Texts to the monitor number itself (the admin's own test accounts) aren't copied.
  if (!SMS_MONITOR_PHONE || normalizePhone(to) === normalizePhone(SMS_MONITOR_PHONE)) return
  await twilioClient()
    .messages.create({ to: SMS_MONITOR_PHONE, from: process.env.TWILIO_PHONE_NUMBER!, body: monitorCopyBody(to, text, delivered) })
    .catch((err) => console.error('[Tydio] SMS monitor copy failed:', err))
}

export async function sendSmsForPayload(to: string, payload: NotificationPayload): Promise<void> {
  if (SMS_DELIVERY === 'email_admin') {
    await emailAdminManualText(createAdminClient(), to, payload)
    return
  }
  const text = textBody(payload)
  try {
    await sendSms(to, text)
  } catch (err) {
    await sendMonitorCopy(to, text, false)
    throw err
  }
  await sendMonitorCopy(to, text, true)
}
