import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { CLEANER_CANCELLED_REASON, bookingsBeingReplaced, isAwaitingReplacements, isHiddenGroupRequest } from '@/lib/bookingRequestGroups'
import { todayInZone } from '@/lib/bookingTime'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import { getUnreadMessageCountForUser } from '@/lib/bookings'
import BookingsListView, { type BookingRow } from './BookingsListView'
import type { RecurringRow } from './RecurringBookingCard'
import { isRecurrenceFrequency } from '@/lib/recurrence'
import { listSeriesOccurrences } from '@/lib/recurringOccurrences'

export const metadata: Metadata = { title: 'Your Bookings — Tydio' }

export default async function BookingsPage() {
  const session = await getSession()
  if (!session || session.role !== 'USER') redirect('/login')

  const admin = createAdminClient()

  const { data: rows } = await admin
    .from('bookings')
    .select('id, tidy_pro_name, scheduled_date, scheduled_time, estimated_duration_minutes, status, decision_status, scheduled_location, request_group_id, time_zone, recurring_booking_id, suspended_for_upcharge_at, payment_failed_at, suspended_for_payment_at, payment_due_at, cancelled_reason, stripe_refund_id')
    .eq('user_id', session.profileId)
    // A request isn't a booking until the Tidy Pro accepts it — until then it
    // lives in Messages, same as on the Tidy Pro's side.
    .neq('status', 'pending')
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true })

  // Canceled or declined by the Tidy Pro with the payment still held, and no replacements
  // chosen yet: still the customer's to sort out, so it stays upcoming, flagged.
  const droppedIds = (rows ?? []).filter((b) => isAwaitingReplacements(b) && b.stripe_refund_id == null).map((b) => b.id)
  const alreadyReplacing = await bookingsBeingReplaced(admin, droppedIds)

  const bookings: BookingRow[] = (rows ?? []).filter((b) => !isHiddenGroupRequest(b)).map((b) => {
    const location = b.scheduled_location as ScheduledLocation | null
    const address = location?.type === 'address' ? location.label : location?.type === 'current_location' ? 'Current Location' : null

    const today = todayInZone(b.time_zone)
    const dropped = droppedIds.includes(b.id) && !alreadyReplacing.has(b.id) && b.scheduled_date != null && b.scheduled_date >= today
    const isTerminal = b.status === 'completed' || b.status === 'cancelled' || (b.status === 'declined' && !dropped)
    const bucket: BookingRow['bucket'] =
      isTerminal || (b.scheduled_date != null && b.scheduled_date < today)
        ? 'past'
        : b.scheduled_date === today
        ? 'today'
        : 'upcoming'

    return {
      id: b.id,
      cleanerName: b.tidy_pro_name ?? 'your Tidy Pro',
      address,
      scheduledDate: b.scheduled_date,
      scheduledTime: b.scheduled_time,
      durationMinutes: b.estimated_duration_minutes ?? 30,
      bucket,
      today,
      recurring: b.recurring_booking_id != null,
      droppedByTidyPro: dropped ? (b.cancelled_reason === CLEANER_CANCELLED_REASON ? 'cancelled' : 'declined') : null,
      // An upcharge waiting to be paid (see lib/bookingUpcharges).
      // An unpaid upcharge, or a recurring visit whose charge failed (lib/recurringPayments).
      needsAttention:
        b.status === 'scheduled' &&
        (b.suspended_for_upcharge_at != null || (b.payment_due_at != null && (b.payment_failed_at != null || b.suspended_for_payment_at != null))),
    }
  })

  const { data: seriesRows } = await admin
    .from('recurring_bookings')
    .select('id, frequency, tidy_pro_name, tidy_pro_photo_url, scheduled_location, next_date, scheduled_time, time_zone, skipped_dates, last_error')
    .eq('user_id', session.profileId)
    .eq('status', 'active')
    .order('next_date', { ascending: true })

  // Upcoming visits of each series, to cancel one of from its card.
  const occurrencesBySeries = new Map(
    await Promise.all((seriesRows ?? []).map(async (s) => [s.id, await listSeriesOccurrences(admin, s)] as const))
  )

  const recurring: RecurringRow[] = (seriesRows ?? []).flatMap((s) => {
    if (!isRecurrenceFrequency(s.frequency)) return []
    const location = s.scheduled_location as ScheduledLocation | null
    return [{
      occurrences: (occurrencesBySeries.get(s.id) ?? []).map((o) => ({ date: o.date, time: o.time, booked: o.bookingId != null, late: o.late })),
      id: s.id,
      frequency: s.frequency,
      cleanerName: s.tidy_pro_name ?? 'Choose a Tidy Pro',
      cleanerPhotoUrl: s.tidy_pro_photo_url,
      address: location?.type === 'address' ? location.label : location?.type === 'current_location' ? 'Current Location' : null,
      nextDate: s.next_date,
      time: s.scheduled_time.slice(0, 5),
      lastError: s.last_error,
    }]
  })

  const unreadMessageCount = await getUnreadMessageCountForUser(admin, session.profileId)

  return <BookingsListView bookings={bookings} recurring={recurring} unreadMessageCount={unreadMessageCount} />
}
