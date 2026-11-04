import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { bookingStartInstant, scheduleForViewer } from '@/lib/bookingTime'
import { cityAndState } from '@/lib/address'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import OnTheWayView from './OnTheWayView'
import TaskListView from './TaskListView'
import PastBookingDetailView from './PastBookingDetailView'
import { canLeaveCustomerReview } from '@/lib/cleanerReviewWindow'

export const metadata: Metadata = { title: 'Booking Details — Tydio' }

export default async function ProActiveBookingPage({
  params,
}: {
  params: Promise<{ bookingId: string }>
}) {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const { bookingId } = await params

  const admin = createAdminClient()

  const { data: booking, error } = await admin
    .from('bookings')
    .select(
      'id, user_id, status, progress_status, cleaner_marked_complete_at, scheduled_date, scheduled_time, estimated_duration_minutes, scheduled_location, notes, entry_instructions, pets, will_provide_supplies, cleaner_pay, tip, time_zone'
    )
    .eq('id', bookingId)
    .eq('tidy_pro_id', session.profileId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load booking: ${error.message}`)
  if (!booking) redirect('/pro/dashboard')

  // Finishing a job flips status to 'completed' straight away (see
  // completeBookingPayout), so 'done' alone can't be the test for this.
  const isFinished = booking.status === 'completed' || (booking.status === 'scheduled' && booking.progress_status === 'done')

  const isUpcoming = booking.status === 'scheduled' && booking.progress_status == null

  if (!isFinished && booking.status !== 'scheduled') {
    redirect(`/pro/messages/${bookingId}`)
  }

  const { data: customerProfile } = await admin
    .from('profiles')
    .select('first_name, last_name, phone, photo_url')
    .eq('id', booking.user_id)
    .maybeSingle()

  const { data: me } = await admin.from('tidypro_profiles').select('time_zone').eq('id', session.profileId).maybeSingle()
  const schedule = scheduleForViewer(booking.scheduled_date, booking.scheduled_time, booking.time_zone, me?.time_zone ?? null)

  const customerName = [customerProfile?.first_name, customerProfile?.last_name].filter(Boolean).join(' ') || 'the customer'

  const location = booking.scheduled_location as ScheduledLocation | null
  const addressLine = location?.type === 'address' ? location.line : null
  const addressLabel = location?.type === 'address' ? location.label : location?.type === 'current_location' ? 'Current Location' : null

  const { data: taskRows } = await admin
    .from('booking_tasks')
    .select('id, task_name, task_category, task_icon, is_completed, completion_photo_url')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true })

  const tasks = taskRows ?? []

  if (isUpcoming) {
    return (
      <PastBookingDetailView
        variant="upcoming"
        bookingId={booking.id}
        customerName={customerName}
        scheduledDate={schedule.date}
        scheduledTime={schedule.time}
        startsAtMs={
          booking.scheduled_date && booking.scheduled_time
            ? bookingStartInstant(booking.scheduled_date, booking.scheduled_time, booking.time_zone).getTime()
            : null
        }
        durationMinutes={booking.estimated_duration_minutes ?? 30}
        addressLabel={addressLabel}
        addressArea={addressLine}
        tasks={tasks}
        suppliesProvided={booking.will_provide_supplies ?? false}
        pets={booking.pets}
        notes={booking.notes}
        bookingEarnings={booking.cleaner_pay ?? 0}
        tipAmount={0}
        canLeaveReview={false}
      />
    )
  }

  if (isFinished) {
    const { data: ownReview } = await admin
      .from('cleaner_reviews_of_customers')
      .select('id')
      .eq('booking_id', bookingId)
      .maybeSingle()

    return (
      <PastBookingDetailView
        variant="past"
        bookingId={booking.id}
        customerName={customerName}
        scheduledDate={schedule.date}
        scheduledTime={schedule.time}
        durationMinutes={booking.estimated_duration_minutes ?? 30}
        addressLabel={addressLabel}
        addressArea={cityAndState(addressLine)}
        tasks={tasks}
        suppliesProvided={booking.will_provide_supplies ?? false}
        pets={booking.pets}
        notes={booking.notes}
        bookingEarnings={booking.cleaner_pay ?? 0}
        tipAmount={booking.tip ?? 0}
        canLeaveReview={canLeaveCustomerReview(booking.cleaner_marked_complete_at, ownReview != null)}
      />
    )
  }

  if (booking.progress_status === 'on_the_way') {
    return (
      <OnTheWayView
        bookingId={booking.id}
        customerName={customerName}
        customerPhotoUrl={customerProfile?.photo_url ?? null}
        scheduledDate={schedule.date}
        scheduledTime={schedule.time}
        durationMinutes={booking.estimated_duration_minutes ?? 30}
        addressLabel={addressLabel}
        addressLine={addressLine}
        entryInstructions={booking.entry_instructions}
        tasks={tasks.map((t) => ({ id: t.id, taskName: t.task_name }))}
      />
    )
  }

  // arrived / cleaning
  return (
    <TaskListView
      bookingId={booking.id}
      customerName={customerName}
      addressLabel={addressLabel}
      scheduledDate={schedule.date}
      scheduledTime={schedule.time}
      durationMinutes={booking.estimated_duration_minutes ?? 30}
      pets={booking.pets}
      notes={booking.notes}
      tasks={tasks}
    />
  )
}
