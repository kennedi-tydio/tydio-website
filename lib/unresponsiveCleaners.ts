import type { createAdminClient } from '@/lib/supabase/admin'
import { bookingStartInstant } from '@/lib/bookingTime'
import { emailShell, escapeHtml, sendEmail } from '@/lib/email'
import { loadBookingIncident, sendAdminEscalation } from '@/lib/bookingIncidentEmail'
import { notifyOnTheWayReminder } from '@/lib/notifications'
import { canSendSms, sendSmsForPayload } from '@/lib/sms'
import { sendPushForPayload } from '@/lib/push'

type Admin = ReturnType<typeof createAdminClient>

// A cleaner shows they're heading to a booking by tapping "I'm on the way". If they
// haven't by the start time, they're reminded by text, push, and email. If they still
// haven't 15 minutes later, the admin gets an urgent email with everything needed to
// reach the cleaner and the customer. "Anytime" bookings have no start time, so they're
// never checked.

export const ALERT_AFTER_MINUTES = 15

// Bookings further past their start than this are left alone, so a job that's been down
// for a while, or an old booking nobody closed out, doesn't set off a pile of alerts.
export const GIVE_UP_AFTER_MINUTES = 3 * 60

export type UnresponsiveStep = 'remind' | 'alert' | null

export function unresponsiveStepDue(
  booking: { scheduled_date: string | null; scheduled_time: string | null; time_zone: string | null; on_the_way_reminder_sent_at: string | null; unresponsive_alert_sent_at: string | null },
  now: Date = new Date()
): UnresponsiveStep {
  if (!booking.scheduled_date || !booking.scheduled_time) return null
  const start = bookingStartInstant(booking.scheduled_date, booking.scheduled_time, booking.time_zone ?? undefined)
  const minutesLate = (now.getTime() - start.getTime()) / 60000
  if (minutesLate < 0 || minutesLate > GIVE_UP_AFTER_MINUTES) return null
  if (minutesLate >= ALERT_AFTER_MINUTES) return booking.unresponsive_alert_sent_at ? null : 'alert'
  return booking.on_the_way_reminder_sent_at ? null : 'remind'
}

async function remindCleaner(admin: Admin, booking: { id: string; tidy_pro_id: string }): Promise<void> {
  const payload = notifyOnTheWayReminder(booking.id)
  const [{ data: tidyPro }, { data: profile }] = await Promise.all([
    admin.from('tidypro_profiles').select('phone, sms_consent').eq('id', booking.tidy_pro_id).maybeSingle(),
    admin.from('profiles').select('email, first_name').eq('id', booking.tidy_pro_id).maybeSingle(),
  ])

  if (canSendSms(tidyPro?.sms_consent ?? null, tidyPro?.phone ?? null)) {
    await sendSmsForPayload(tidyPro!.phone!, payload).catch((err) => console.error('On the way reminder SMS failed', err))
  }
  await sendPushForPayload(booking.tidy_pro_id, payload).catch((err) => console.error('On the way reminder push failed', err))

  // Sent even if they've turned booking emails off: the customer is waiting on them.
  if (profile?.email) {
    await sendEmail({
      to: [{ email: profile.email, name: profile.first_name ?? undefined }],
      subject: payload.title,
      htmlContent: emailShell(`
        <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">${escapeHtml(payload.title)}</h2>
        <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.6;">${escapeHtml(payload.body)}</p>
        <a href="${escapeHtml(payload.url)}" style="display:inline-block;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">I'm on the way</a>
      `),
    }).catch((err) => console.error('On the way reminder email failed', err))
  }
}

async function alertAdmin(admin: Admin, bookingId: string): Promise<void> {
  const incident = await loadBookingIncident(admin, bookingId)
  if (!incident) return

  await sendAdminEscalation(incident, {
    subject: 'URGENT: CLEANER UNRESPONSIVE',
    heading: 'Cleaner unresponsive',
    intro: `This cleaner, <strong>${escapeHtml(incident.cleanerName)}</strong>, is unresponsive. It's ${ALERT_AFTER_MINUTES} minutes past the booking's start time and they still haven't tapped "I'm on the way". They were reminded at the start time.`,
    sections: [incident.sections.cleaner, incident.sections.booking, incident.sections.customer, incident.sections.payment],
  })
}

// Run every minute. Each step is claimed with a conditional update before anyone is told,
// so however often this runs, nobody hears the same thing twice. Each booking is handled
// on its own, so one failure doesn't hold up the rest.
export async function checkUnresponsiveCleaners(
  admin: Admin,
  now: Date = new Date()
): Promise<{ reminded: number; alerted: number; failed: number }> {
  const { data: candidates } = await admin
    .from('bookings')
    .select('id, tidy_pro_id, scheduled_date, scheduled_time, time_zone, on_the_way_reminder_sent_at, unresponsive_alert_sent_at')
    .eq('status', 'scheduled')
    .is('progress_status', null)
    .is('unresponsive_alert_sent_at', null)
    .not('tidy_pro_id', 'is', null)
    // A day either side, since the booking's date is in the customer's zone, not the server's.
    .gte('scheduled_date', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
    .lte('scheduled_date', new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10))

  let reminded = 0
  let alerted = 0
  let failed = 0

  for (const booking of candidates ?? []) {
    const step = unresponsiveStepDue(booking, now)
    if (!step || !booking.tidy_pro_id) continue

    const column = step === 'remind' ? 'on_the_way_reminder_sent_at' : 'unresponsive_alert_sent_at'
    try {
      const { data: claimed, error } = await admin
        .from('bookings')
        .update({ [column]: now.toISOString() } as never)
        .eq('id', booking.id)
        .eq('status', 'scheduled')
        .is('progress_status', null)
        .is(column, null)
        .select('id')
      if (error) throw new Error(error.message)
      if (!claimed || claimed.length === 0) continue

      if (step === 'remind') {
        await remindCleaner(admin, { id: booking.id, tidy_pro_id: booking.tidy_pro_id })
        reminded++
      } else {
        try {
          await alertAdmin(admin, booking.id)
        } catch (err) {
          // Unclaim, so the next run tries the admin again rather than staying silent.
          await admin.from('bookings').update({ unresponsive_alert_sent_at: null }).eq('id', booking.id)
          throw err
        }
        alerted++
      }
    } catch (err) {
      console.error('Unresponsive cleaner check failed', booking.id, step, err)
      failed++
    }
  }

  return { reminded, alerted, failed }
}
