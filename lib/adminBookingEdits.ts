import type { createAdminClient } from '@/lib/supabase/admin'
import { hasBookingConflict } from '@/lib/cleanerMatching'
import { withdrawPendingProposals } from '@/lib/bookingTimeProposals'
import { notifyCustomer } from '@/lib/customerNotifications'
import { notifyBookingEditedByAdmin } from '@/lib/notifications'
import { canSendSms, sendSmsForPayload } from '@/lib/sms'
import { sendPushForPayload } from '@/lib/push'
import { userFacingError } from '@/lib/userFacingError'

type Admin = ReturnType<typeof createAdminClient>

// The Tydio team changing an open booking from /admin/bookings. The time can only move
// before the Tidy Pro sets off; notes and entry instructions can change until it's done.
// The price doesn't change here: extra cost is an upcharge (lib/bookingUpcharges).

export const MIN_DURATION_MINUTES = 15
export const MAX_DURATION_MINUTES = 12 * 60
export const NOTES_MAX_LENGTH = 2000

export type AdminBookingEdit = {
  date: string
  time: string
  durationMinutes: number
  notes: string | null
  entryInstructions: string | null
}

export function parseAdminBookingEdit(fields: {
  date: string
  time: string
  durationMinutes: string
  notes: string
  entryInstructions: string
}): AdminBookingEdit | { error: string } {
  const date = fields.date.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) return { error: 'Choose a date.' }
  const time = fields.time.trim().slice(0, 5)
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { error: 'Choose a start time.' }
  const durationMinutes = Number(fields.durationMinutes)
  if (!Number.isInteger(durationMinutes) || durationMinutes < MIN_DURATION_MINUTES || durationMinutes > MAX_DURATION_MINUTES) {
    return { error: `The length must be between ${MIN_DURATION_MINUTES} minutes and ${MAX_DURATION_MINUTES / 60} hours.` }
  }
  const notes = fields.notes.trim()
  const entryInstructions = fields.entryInstructions.trim()
  if (notes.length > NOTES_MAX_LENGTH || entryInstructions.length > NOTES_MAX_LENGTH) {
    return { error: `Keep notes and entry instructions under ${NOTES_MAX_LENGTH} characters.` }
  }
  return { date, time, durationMinutes, notes: notes || null, entryInstructions: entryInstructions || null }
}

function formatWhen(date: string, time: string): string {
  const day = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
  const [h, m] = time.split(':').map(Number)
  const clock = `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
  return `${day} at ${clock}`
}

function formatLength(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return [h ? `${h} hr${h === 1 ? '' : 's'}` : '', m ? `${m} min` : ''].filter(Boolean).join(' ')
}

// What the customer and Tidy Pro are told changed, e.g. "moved to Tue, Nov 18 at 2:00 PM".
export function describeBookingChanges(
  before: { scheduled_date: string | null; scheduled_time: string | null; estimated_duration_minutes: number | null; notes: string | null; entry_instructions: string | null },
  after: AdminBookingEdit
): string[] {
  const changes: string[] = []
  if (before.scheduled_date !== after.date || (before.scheduled_time ?? '').slice(0, 5) !== after.time) {
    changes.push(`moved to ${formatWhen(after.date, after.time)}`)
  }
  if ((before.estimated_duration_minutes ?? null) !== after.durationMinutes) changes.push(`length changed to ${formatLength(after.durationMinutes)}`)
  if ((before.notes ?? null) !== after.notes) changes.push('notes updated')
  if ((before.entry_instructions ?? null) !== after.entryInstructions) changes.push('entry instructions updated')
  return changes
}

export async function editBookingAsAdmin(
  admin: Admin,
  bookingId: string,
  edit: AdminBookingEdit
): Promise<{ success: true; changes: string[] } | { error: string }> {
  const { data: booking } = await admin
    .from('bookings')
    .select('id, user_id, tidy_pro_id, status, progress_status, cleaner_marked_complete_at, request_group_id, scheduled_date, scheduled_time, estimated_duration_minutes, notes, entry_instructions')
    .eq('id', bookingId)
    .maybeSingle()
  if (!booking) return { error: 'Booking not found.' }
  if (booking.cleaner_marked_complete_at || booking.progress_status === 'done') return { error: 'This booking is already complete.' }
  if (booking.status !== 'scheduled' && booking.status !== 'pending') return { error: 'Only open bookings can be edited.' }
  // Every request in a group shares one time and payment, so it's edited by canceling instead.
  if (booking.status === 'pending' && booking.request_group_id) return { error: 'This request went to several Tidy Pros, so it can’t be edited. Cancel it instead.' }

  const changes = describeBookingChanges(booking, edit)
  if (changes.length === 0) return { success: true, changes }

  const timeChanged =
    booking.scheduled_date !== edit.date ||
    (booking.scheduled_time ?? '').slice(0, 5) !== edit.time ||
    booking.estimated_duration_minutes !== edit.durationMinutes
  if (timeChanged && booking.progress_status != null) return { error: 'The Tidy Pro has already set off, so the time can’t change now.' }
  if (timeChanged && booking.tidy_pro_id && (await hasBookingConflict(admin, booking.tidy_pro_id, edit.date, edit.time, edit.durationMinutes, bookingId))) {
    return { error: 'The Tidy Pro has another booking at that time.' }
  }

  const { data: updated, error } = await admin
    .from('bookings')
    .update({
      scheduled_date: edit.date,
      scheduled_time: edit.time,
      estimated_duration_minutes: edit.durationMinutes,
      notes: edit.notes,
      entry_instructions: edit.entryInstructions,
      user_unread: true,
      tidy_pro_unread: true,
      // Reminders are timed from the start, so a new time gets them again.
      ...(timeChanged ? { reminder_sent_at: null, on_the_way_reminder_sent_at: null, unresponsive_alert_sent_at: null, customer_arrival_check_sent_at: null } : {}),
    })
    .eq('id', bookingId)
    .eq('status', booking.status)
    .select('id')
  if (error) return { error: userFacingError(error) }
  if (!updated?.length) return { error: 'This booking just changed. Please refresh the page and try again.' }

  // A time the Tidy Pro suggested no longer applies.
  if (timeChanged) await withdrawPendingProposals(admin, bookingId)

  const summary = changes.join(', ')
  await notifyCustomer(admin, booking.user_id, notifyBookingEditedByAdmin('USER', summary, bookingId))
  if (booking.tidy_pro_id) {
    const payload = notifyBookingEditedByAdmin('TIDYPRO', summary, bookingId)
    const { data: tidyPro } = await admin.from('tidypro_profiles').select('phone, sms_consent').eq('id', booking.tidy_pro_id).maybeSingle()
    if (canSendSms(tidyPro?.sms_consent ?? null, tidyPro?.phone ?? null)) {
      await sendSmsForPayload(tidyPro!.phone!, payload).catch((err) => console.error('Cleaner SMS failed', err))
    }
    await sendPushForPayload(booking.tidy_pro_id, payload).catch((err) => console.error('Cleaner push failed', err))
  }
  return { success: true, changes }
}
