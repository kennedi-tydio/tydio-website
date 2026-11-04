import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUnreadMessageCountForTidyPro } from '@/lib/bookings'
import { REQUEST_FILLED_REASON } from '@/lib/bookingRequestGroups'
import { DEFAULT_BOOKING_TIME_ZONE, scheduleForViewer, todayInZone } from '@/lib/bookingTime'
import { canLeaveCustomerReview, cleanerReviewHoursLeft } from '@/lib/cleanerReviewWindow'
import JobsListView, { type JobRow } from './JobsListView'

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

  return <JobsListView jobs={jobs} unreadMessageCount={unreadMessageCount} />
}
