import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUnreadMessageCountForTidyPro } from '@/lib/bookings'
import { REQUEST_FILLED_REASON } from '@/lib/bookingRequestGroups'
import { DEFAULT_BOOKING_TIME_ZONE, scheduleForViewer, todayInZone } from '@/lib/bookingTime'
import { canLeaveCustomerReview, cleanerReviewHoursLeft } from '@/lib/cleanerReviewWindow'
import JobsListView, { type JobRow } from './JobsListView'
import type { ProRecurringRow } from './ProRecurringCard'

import { isRecurrenceFrequency, occurrenceLabel, recurrenceScheduleLabel, type RecurrenceFrequency } from '@/lib/recurrence'
import { listSeriesOccurrences } from '@/lib/recurringOccurrences'

export const metadata: Metadata = { title: 'Your Jobs — Tydio' }

export default async function JobsPage() {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const admin = createAdminClient()

  const { data: rows } = await admin
    .from('bookings')
    .select('id, user_id, scheduled_date, scheduled_time, estimated_duration_minutes, status, cleaner_marked_complete_at, cancelled_reason, time_zone')
    .eq('tidy_pro_id', session.profileId)
    .not('status', 'eq', 'pending')
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true })

  const completedIds = (rows ?? []).filter((r) => r.status === 'completed').map((r) => r.id)
  const { data: ownReviews } = completedIds.length
    ? await admin.from('cleaner_reviews_of_customers').select('booking_id').in('booking_id', completedIds)
    : { data: [] }
  const reviewedBookingIds = new Set((ownReviews ?? []).map((r) => r.booking_id))

  const customerIds = [...new Set((rows ?? []).map((r) => r.user_id))]
  const { data: customers } = customerIds.length
    ? await admin.from('profiles').select('id, first_name, last_name, street_address').in('id', customerIds)
    : { data: [] }
  const customerById = new Map((customers ?? []).map((c) => [c.id, c]))

  const unreadMessageCount = await getUnreadMessageCountForTidyPro(admin, session.profileId)

  const { data: me } = await admin.from('tidypro_profiles').select('time_zone').eq('id', session.profileId).maybeSingle()
  const myTimeZone = me?.time_zone ?? null
  const today = todayInZone(myTimeZone ?? DEFAULT_BOOKING_TIME_ZONE)

  const jobs: JobRow[] = (rows ?? []).filter((b) => b.cancelled_reason !== REQUEST_FILLED_REASON).map((b) => {
    const customer = customerById.get(b.user_id)
    const schedule = scheduleForViewer(b.scheduled_date, b.scheduled_time, b.time_zone, myTimeZone)
    const isTerminal = b.status === 'completed' || b.status === 'cancelled' || b.status === 'declined'
    const bucket: JobRow['bucket'] =
      isTerminal || (schedule.date != null && schedule.date < today)
        ? 'past'
        : schedule.date === today
        ? 'today'
        : 'upcoming'

    const isCompleted = b.status === 'completed'
    const reviewLabel = !isCompleted
      ? null
      : canLeaveCustomerReview(b.cleaner_marked_complete_at, reviewedBookingIds.has(b.id))
      ? `Leave a review · ${cleanerReviewHoursLeft(b.cleaner_marked_complete_at)}h left`
      : 'View reviews'

    return {
      id: b.id,
      // Accepted and finished jobs open their booking summary (or live task
      // list once started); cancelled / declined ones only have the thread.
      href: isCompleted || b.status === 'scheduled' ? `/pro/bookings/${b.id}` : `/pro/messages/${b.id}`,
      reviewLabel,
      customerName: customer ? [customer.first_name, customer.last_name].filter(Boolean).join(' ') || 'Customer' : 'Customer',
      address: customer?.street_address ?? null,
      scheduledDate: schedule.date,
      scheduledTime: schedule.time,
      durationMinutes: b.estimated_duration_minutes ?? 30,
      bucket,
      today,
    }
  })

  // Recurring bookings they've accepted, to cancel the series or one visit from here.
  const { data: seriesRows } = await admin
    .from('recurring_bookings')
    .select('id, user_id, frequency, next_date, scheduled_time, time_zone, skipped_dates, scheduled_location')
    .eq('tidy_pro_id', session.profileId)
    .eq('status', 'active')
    .not('tidy_pro_accepted_at', 'is', null)
    .order('next_date', { ascending: true })

  const seriesCustomerIds = [...new Set((seriesRows ?? []).map((s) => s.user_id).filter((id) => !customerById.has(id)))]
  const { data: seriesCustomers } = seriesCustomerIds.length
    ? await admin.from('profiles').select('id, first_name, last_name, street_address').in('id', seriesCustomerIds)
    : { data: [] }
  for (const c of seriesCustomers ?? []) customerById.set(c.id, c)

  const recurring: ProRecurringRow[] = await Promise.all(
    (seriesRows ?? []).filter((s) => isRecurrenceFrequency(s.frequency)).map(async (s) => {
      const customer = customerById.get(s.user_id)
      const occurrences = await listSeriesOccurrences(admin, s, { tidyProId: session.profileId })
      // Shown in the Tidy Pro's own zone; the date sent back stays the series' own.
      const first = scheduleForViewer(s.next_date, s.scheduled_time, s.time_zone, myTimeZone)
      return {
        id: s.id,
        customerName: customer ? [customer.first_name, customer.last_name].filter(Boolean).join(' ') || 'Customer' : 'Customer',
        schedule: recurrenceScheduleLabel(s.frequency as RecurrenceFrequency, first.date, first.time),
        address: customer?.street_address ?? null,
        occurrences: occurrences.map((o) => {
          const seen = scheduleForViewer(o.date, o.time, s.time_zone, myTimeZone)
          return {
            date: o.date,
            time: o.time,
            booked: o.bookingId != null,
            late: o.late,
            label: seen.date && seen.time ? occurrenceLabel(seen.date, seen.time.slice(0, 5)) : undefined,
          }
        }),
      }
    })
  )

  return <JobsListView jobs={jobs} recurring={recurring} unreadMessageCount={unreadMessageCount} />
}
