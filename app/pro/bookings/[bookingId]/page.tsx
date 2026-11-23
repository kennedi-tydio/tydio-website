import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { bookingStartInstant, noAccessReportableAt, scheduleForViewer } from '@/lib/bookingTime'
import { cityAndState } from '@/lib/address'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import OnTheWayView from './OnTheWayView'
import TaskListView from './TaskListView'
import type { TidyTask } from '@/app/dashboard/types'
import { isPetTask } from '@/lib/petTasks'
import { usesLaundromat } from '@/lib/laundry'
import { signedTaskPhotoUrls } from '@/lib/customerTaskPhotos'
import NoAccessView from './NoAccessView'
import SuspendedBookingView from './SuspendedBookingView'
import PastBookingDetailView from './PastBookingDetailView'
import { canLeaveCustomerReview } from '@/lib/cleanerReviewWindow'
import { readSnapshot } from '@/lib/fullServiceBooking'
import { isEntireHomeRoom } from '@/lib/entireHome'
import { loadBookingPhotoPairs } from '@/lib/tidyProPortfolio'
export const metadata: Metadata = { title: 'Booking Details — Tydio' }

export default async function ProActiveBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>
  searchParams: Promise<{ before?: string }>
}) {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const { bookingId } = await params
  // Set when they said yes to before photos on arrival (BeforePhotosPrompt).
  const wantsBeforePhotos = (await searchParams).before === '1'

  const admin = createAdminClient()

  const { data: booking, error } = await admin
    .from('bookings')
    .select(
      'id, user_id, status, progress_status, cleaner_marked_complete_at, scheduled_date, scheduled_time, estimated_duration_minutes, scheduled_location, task_list, full_service, notes, entry_instructions, pets, will_provide_supplies, cleaner_pay, tip, time_zone, arrived_at, no_access_reported_at, suspended_for_upcharge_at, suspended_for_payment_at, recurring_booking_id, task_photos_removed_at'
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
    .select('first_name, last_name, photo_url')
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
    .select('id, task_name, task_category, task_icon, kind, is_completed, completion_photo_url, before_photo_url')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true })

  const tasks = taskRows ?? []
  // Pet enclosure / litter box tasks carry their scope, instructions and
  // checked photos on the booking's task list.
  const snapshot = readSnapshot(booking.full_service)
  const fullService = snapshot ? { selection: { ...snapshot.selection, version: 1 as const, step: 'notes' as const }, lines: snapshot.lines } : null
  const petTasks = ((booking.task_list as TidyTask[] | null) ?? []).filter(isPetTask)
  // Laundromat trips: shown with the stay-for-the-whole-cycle rule while the job is on.
  const laundromatTasks = ((booking.task_list as TidyTask[] | null) ?? []).filter(usesLaundromat)
  const photoUrls = await signedTaskPhotoUrls(admin, petTasks)

  const arrivedAtMs = booking.arrived_at ? new Date(booking.arrived_at).getTime() : null

  // On hold for an upcharge the customer hasn't paid yet (see lib/bookingUpcharges).
  if (booking.suspended_for_upcharge_at && !isFinished) {
    return (
      <SuspendedBookingView
        bookingId={booking.id}
        customerName={customerName}
        scheduledDate={schedule.date}
        scheduledTime={schedule.time}
        inProgress={booking.progress_status != null}
      />
    )
  }

  // A recurring visit still unpaid a day before it starts (see lib/recurringPayments).
  if (booking.suspended_for_payment_at && !isFinished) {
    return (
      <SuspendedBookingView
        bookingId={booking.id}
        customerName={customerName}
        scheduledDate={schedule.date}
        scheduledTime={schedule.time}
        inProgress={booking.progress_status != null}
        reason="payment"
      />
    )
  }

  if (isUpcoming) {
    return (
      <PastBookingDetailView
        variant="upcoming"
        bookingId={booking.id}
        customerName={customerName}
        fullService={fullService}
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
        petTasks={petTasks}
        photoUrls={photoUrls}
        suppliesProvided={booking.will_provide_supplies ?? false}
        pets={booking.pets}
        notes={booking.notes}
        bookingEarnings={booking.cleaner_pay ?? 0}
        tipAmount={0}
        canLeaveReview={false}
        isRecurring={booking.recurring_booking_id != null}
      />
    )
  }

  if (isFinished) {
    const { data: ownReview } = await admin
      .from('cleaner_reviews_of_customers')
      .select('id')
      .eq('booking_id', bookingId)
      .maybeSingle()

    // Before/after pairs they can still add to their profile, until the
    // booking's photos are removed. The page works without them.
    const profilePhotoPairs = booking.task_photos_removed_at
      ? []
      : await loadBookingPhotoPairs(admin, booking.id).catch((err) => {
          console.error(err)
          return []
        })

    return (
      <PastBookingDetailView
        variant="past"
        bookingId={booking.id}
        customerName={customerName}
        fullService={fullService}
        scheduledDate={schedule.date}
        scheduledTime={schedule.time}
        durationMinutes={booking.estimated_duration_minutes ?? 30}
        addressLabel={addressLabel}
        addressArea={cityAndState(addressLine)}
        tasks={tasks}
        petTasks={petTasks}
        photoUrls={photoUrls}
        suppliesProvided={booking.will_provide_supplies ?? false}
        pets={booking.pets}
        notes={booking.notes}
        bookingEarnings={booking.cleaner_pay ?? 0}
        tipAmount={booking.tip ?? 0}
        canLeaveReview={canLeaveCustomerReview(booking.cleaner_marked_complete_at, ownReview != null)}
        profilePhotoPairs={profilePhotoPairs}
      />
    )
  }

  if (booking.progress_status === 'on_the_way') {
    return (
      <OnTheWayView
        bookingId={booking.id}
        fullService={fullService != null}
        customerName={customerName}
        customerPhotoUrl={customerProfile?.photo_url ?? null}
        scheduledDate={schedule.date}
        scheduledTime={schedule.time}
        durationMinutes={booking.estimated_duration_minutes ?? 30}
        addressLabel={addressLabel}
        addressLine={addressLine}
        entryInstructions={booking.entry_instructions}
        tasks={tasks.map((t) => ({ id: t.id, taskName: t.task_name }))}
        laundromatTasks={laundromatTasks}
      />
    )
  }

  // Arrived without starting the job: they pressed "Unable to access location".
  if (booking.progress_status === 'arrived') {
    return (
      <NoAccessView
        bookingId={booking.id}
        fullService={fullService != null}
        customerName={customerProfile?.first_name ?? customerName}
        entryInstructions={booking.entry_instructions}
        addressLine={addressLine}
        reportableAtMs={
          noAccessReportableAt(booking.scheduled_date, booking.scheduled_time, booking.no_access_reported_at ?? booking.arrived_at, booking.time_zone)?.getTime() ?? null
        }
        arrivedAtMs={arrivedAtMs}
      />
    )
  }

  // cleaning
  const { data: cleaningPhotoRows } = fullService
    ? await admin.from('booking_cleaning_photos').select('id, kind, photo_url').eq('booking_id', booking.id).order('created_at', { ascending: true })
    : { data: [] }
  // Entire home tasks take up to 3 before and 3 after photos each.
  const { data: taskPhotoRows } = tasks.some((t) => isEntireHomeRoom(t.task_category))
    ? await admin
        .from('booking_task_photos')
        .select('id, booking_task_id, kind, photo_url')
        .eq('booking_id', booking.id)
        .order('created_at', { ascending: true })
    : { data: [] }
  return (
    <TaskListView
      cleaningPhotos={(cleaningPhotoRows ?? []).map((r) => ({ id: r.id, kind: r.kind as 'before' | 'after', photoUrl: r.photo_url }))}
      taskPhotos={(taskPhotoRows ?? []).map((r) => ({ id: r.id, taskId: r.booking_task_id, kind: r.kind as 'before' | 'after', photoUrl: r.photo_url }))}
      bookingId={booking.id}
      customerName={customerName}
      fullService={fullService}
      addressLabel={addressLabel}
      addressLine={addressLine}
      scheduledDate={schedule.date}
      scheduledTime={schedule.time}
      durationMinutes={booking.estimated_duration_minutes ?? 30}
      pets={booking.pets}
      notes={booking.notes}
      suppliesProvided={booking.will_provide_supplies ?? false}
      tasks={tasks}
      petTasks={petTasks}
      laundromatTasks={laundromatTasks}
      photoUrls={photoUrls}
      wantsBeforePhotos={wantsBeforePhotos}
      arrivedAtMs={arrivedAtMs}
    />
  )
}
