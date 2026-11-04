import type { createAdminClient } from '@/lib/supabase/admin'
import { DEFAULT_BOOKING_TIME_ZONE, hourInZone, shiftDateISO, todayInZone } from '@/lib/bookingTime'
import { TYDIO_ADMIN_EMAIL, emailShell, escapeHtml, sendEmail } from '@/lib/email'
import { notifyInsuranceExpired, notifyInsuranceExpiringSoon, type NotificationPayload } from '@/lib/notifications'
import { canSendSms, sendSmsForPayload } from '@/lib/sms'
import { sendPushForPayload } from '@/lib/push'

type Admin = ReturnType<typeof createAdminClient>

// The admin enters this from the cleaner's policy when approving it. 3 days ahead the
// cleaner is reminded, and on the date their approval lapses and both of them are told a
// new document is needed.

// Messages wait until morning on the day, rather than going out at midnight.
const NOTIFY_FROM_HOUR = 9

export const REMINDER_DAYS_BEFORE = 3

export function expirationDateError(raw: unknown, now: Date = new Date()): string | null {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return 'Enter the expiration date from the policy.'
  if (raw <= todayInZone(DEFAULT_BOOKING_TIME_ZONE, now)) return 'The expiration date must be in the future.'
  return null
}

export function isInsuranceExpiryDue(expirationDate: string, timeZone: string | null, now: Date = new Date()): boolean {
  const zone = timeZone ?? DEFAULT_BOOKING_TIME_ZONE
  const today = todayInZone(zone, now)
  if (expirationDate > today) return false
  // A date already behind us, say from the job being down, shouldn't wait for morning.
  return expirationDate < today || hourInZone(zone, now) >= NOTIFY_FROM_HOUR
}

// From 3 days before until the day before. On the day itself the expiry notice covers it,
// so a policy approved with only a day or two left still gets its reminder straight away.
export function isInsuranceReminderDue(expirationDate: string, timeZone: string | null, now: Date = new Date()): boolean {
  const zone = timeZone ?? DEFAULT_BOOKING_TIME_ZONE
  const today = todayInZone(zone, now)
  if (expirationDate <= today) return false
  if (shiftDateISO(expirationDate, -REMINDER_DAYS_BEFORE) > today) return false
  return hourInZone(zone, now) >= NOTIFY_FROM_HOUR
}

export function formatExpirationDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

type CleanerContact = { phone: string | null; sms_consent: string | null; email_notifications_enabled: boolean | null }

async function notifyCleaner(admin: Admin, proId: string, payload: NotificationPayload, tidyPro: CleanerContact): Promise<void> {
  if (canSendSms(tidyPro.sms_consent, tidyPro.phone)) {
    await sendSmsForPayload(tidyPro.phone!, payload).catch((err) => console.error('Insurance SMS failed', err))
  }
  await sendPushForPayload(proId, payload).catch((err) => console.error('Insurance push failed', err))
  if (tidyPro.email_notifications_enabled === false) return

  const { data: profile } = await admin.from('profiles').select('email, first_name').eq('id', proId).maybeSingle()
  if (!profile?.email) return
  await sendEmail({
    to: [{ email: profile.email, name: profile.first_name ?? undefined }],
    subject: payload.title,
    htmlContent: emailShell(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">${escapeHtml(payload.title)}</h2>
      <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.6;">${escapeHtml(payload.body)}</p>
      <a href="${escapeHtml(payload.url)}" style="display:inline-block;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">Upload insurance</a>
    `),
  }).catch((err) => console.error('Insurance email failed', err))
}

async function notifyCleanerAndAdmin(admin: Admin, proId: string, date: string, tidyPro: CleanerContact): Promise<void> {
  const payload: NotificationPayload = notifyInsuranceExpired()

  if (canSendSms(tidyPro.sms_consent, tidyPro.phone)) {
    await sendSmsForPayload(tidyPro.phone!, payload).catch((err) => console.error('Insurance expiry SMS failed', err))
  }
  await sendPushForPayload(proId, payload).catch((err) => console.error('Insurance expiry push failed', err))

  const { data: profile } = await admin.from('profiles').select('email, first_name, last_name').eq('id', proId).maybeSingle()
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'A cleaner'

  // The admin is told either way, below.
  if (profile?.email && tidyPro.email_notifications_enabled !== false) {
    await sendEmail({
      to: [{ email: profile.email, name: profile.first_name ?? undefined }],
      subject: payload.title,
      htmlContent: emailShell(`
        <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">${escapeHtml(payload.title)}</h2>
        <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.6;">${escapeHtml(payload.body)}</p>
        <a href="${escapeHtml(payload.url)}" style="display:inline-block;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">Upload insurance</a>
      `),
    }).catch((err) => console.error('Insurance expiry email failed', err))
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  await sendEmail({
    to: [{ email: TYDIO_ADMIN_EMAIL }],
    subject: `${name}'s insurance has expired`,
    htmlContent: emailShell(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">Insurance expired</h2>
      <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.6;">
        ${escapeHtml(name)}${profile?.email ? ` (${escapeHtml(profile.email)})` : ''}'s insurance expired on ${escapeHtml(formatExpirationDate(date))}. They've been asked to upload an updated policy, and their Insured Cleaner badge has been removed until you approve one.
      </p>
      <a href="${siteUrl}/admin/insurance?status=expired" style="display:inline-block;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">View in admin</a>
    `),
  }).catch((err) => console.error('Insurance expiry admin email failed', err))
}

// Run on a schedule. Each step is recorded with a conditional update before anyone is
// told, so however often this runs, nobody hears the same thing twice. Each cleaner is
// handled on their own, so one failure doesn't hold up the rest.
export async function expireDueInsurance(
  admin: Admin,
  now: Date = new Date()
): Promise<{ reminded: number; expired: number; failed: number }> {
  const { data: approved } = await admin
    .from('tidypro_profiles')
    .select('id, insurance_policy_expiration_date, insurance_expiry_reminder_sent_at, time_zone, phone, sms_consent, email_notifications_enabled')
    .eq('insurance_status', 'approved')
    .not('insurance_policy_expiration_date', 'is', null)

  let reminded = 0
  let expired = 0
  let failed = 0

  for (const tidyPro of approved ?? []) {
    const date = tidyPro.insurance_policy_expiration_date
    if (!date) continue

    if (!tidyPro.insurance_expiry_reminder_sent_at && isInsuranceReminderDue(date, tidyPro.time_zone, now)) {
      try {
        const { data: marked, error } = await admin
          .from('tidypro_profiles')
          .update({ insurance_expiry_reminder_sent_at: now.toISOString() })
          .eq('id', tidyPro.id)
          .eq('insurance_status', 'approved')
          .is('insurance_expiry_reminder_sent_at', null)
          .select('id')
        if (error) throw new Error(error.message)
        if (marked && marked.length > 0) {
          await notifyCleaner(admin, tidyPro.id, notifyInsuranceExpiringSoon(formatExpirationDate(date)), tidyPro)
          reminded++
        }
      } catch (err) {
        console.error('Failed to send insurance reminder', tidyPro.id, err)
        failed++
      }
      continue
    }

    if (!isInsuranceExpiryDue(date, tidyPro.time_zone, now)) continue

    try {
      const { data: updated, error } = await admin
        .from('tidypro_profiles')
        .update({ insurance_status: 'expired', is_insured: false })
        .eq('id', tidyPro.id)
        .eq('insurance_status', 'approved')
        .select('id')
      if (error) throw new Error(error.message)
      if (!updated || updated.length === 0) continue

      await notifyCleanerAndAdmin(admin, tidyPro.id, date, tidyPro)
      expired++
    } catch (err) {
      console.error('Failed to expire insurance', tidyPro.id, err)
      failed++
    }
  }

  return { reminded, expired, failed }
}
