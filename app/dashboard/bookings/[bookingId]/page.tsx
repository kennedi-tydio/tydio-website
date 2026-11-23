import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import { grossUpForStripeFee, lateCancelRefund, netOfStripeFee, stripePercentageForCardCountry } from '@/lib/pricingRules'
import { isAwaitingReplacements } from '@/lib/bookingRequestGroups'
import { hasBookingStarted, isLateCancellation, noShowReportableAt } from '@/lib/bookingTime'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import { cancelBookingRequestAction } from '@/app/dashboard/messages/[bookingId]/actions'
import { completeBookingPayout } from '@/lib/bookings'
import CurrentBookingView from './CurrentBookingView'
import UpcomingBookingDetailView from './UpcomingBookingDetailView'
import PastBookingDetailView from './PastBookingDetailView'
import type { OrderLine } from './BookingSummary'
import UpchargeDueView from './UpchargeDueView'
import VisitPaymentDueView from './VisitPaymentDueView'
import { isUnpaidVisit } from '@/lib/recurringPayments'
import { getPaidUpcharges, getPendingUpcharge, upchargeCustomerCharge } from '@/lib/bookingUpcharges'
import { chargeableCards } from '@/lib/stripe/chargeableCards'
import { getPendingTaskAddition, taskAdditionBlockedReason } from '@/lib/bookingTaskAdditions'
import { bookedTaskName } from '@/lib/laundry'
import { isEntireHomeRoom } from '@/lib/entireHome'

export const metadata: Metadata = { title: 'Booking Details — Tydio' }

function slotLabel(date: string, time: string): string {
  const [h, m] = time.split(':').map(Number)
  const day = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
  return `${day} at ${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function isWithinReviewPromptWindow(completedAt: string | null): boolean {
  if (!completedAt) return false
  return Date.now() - new Date(completedAt).getTime() < 24 * 60 * 60 * 1000
}

export default async function CurrentBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>
  // A new date and time for an unpaid recurring visit, from the reschedule page.
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const session = await getSession()
  if (!session || session.role !== 'USER') redirect('/login')

  const { bookingId } = await params

  const admin = createAdminClient()

  const { data: booking, error } = await admin
    .from('bookings')
    .select(
      'id, tidy_pro_id, tidy_pro_name, tidy_pro_photo_url, status, tip, decision_status, progress_status, notes, pets, will_provide_supplies, scheduled_date, scheduled_time, estimated_duration_minutes, scheduled_location, total_customer_charge, cleaner_marked_complete_at, stripe_payment_intent_id, stripe_refund_id, request_group_id, cancelled_reason, time_zone, suspended_for_upcharge_at, amount_due, payment_due_at, payment_failed_at, payment_error, suspended_for_payment_at, recurring_booking_id, task_list'
    )
    .eq('id', bookingId)
    .eq('user_id', session.profileId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load booking: ${error.message}`)
  if (!booking) redirect('/dashboard/messages')

  // A still-pending request (awaiting the Tidy Pro's accept/decline) belongs
  // on the request-summary thread, not this detail page.
  if (booking.decision_status !== 'accepted') {
    redirect(`/dashboard/messages/${bookingId}`)
  }

  // Its cleaner canceled, and the customer can still choose others from the thread.
  if (isAwaitingReplacements(booking) && !booking.stripe_refund_id) {
    redirect(`/dashboard/messages/${bookingId}`)
  }

  // Self-heal: progress_status is the real completion signal, but there's no
  // cleaner-side UI yet to drive it through markBookingDoneAction (which
  // processes the payout as a side effect of setting it). If something else
  // set progress_status to 'done' without that action running — admin
  // tooling, a direct edit, a future UI path we haven't wired up yet — catch
  // it here before rendering. Also doubles as a retry for an already-
  // completed booking whose transfer failed the first time (e.g. Stripe test
  // mode holding a fresh charge as pending balance) — completeBookingPayout
  // is a no-op if there's genuinely nothing to do. Best-effort: a payout
  // hiccup must never break the customer's page.
  if (booking.progress_status === 'done') {
    const wasScheduled = booking.status === 'scheduled'
    const result = await completeBookingPayout(admin, bookingId).catch((err) => ({
      error: err instanceof Error ? err.message : 'Unknown error',
    }))
    if ('error' in result) console.error(`completeBookingPayout(${bookingId}):`, result.error)
    if (wasScheduled) {
      booking.status = 'completed'
      booking.cleaner_marked_complete_at = new Date().toISOString()
    }
  }

  const isInProgress = booking.status === 'scheduled' && booking.progress_status != null

  // The card's fee rate, so the tip preview and the order summary's fee line
  // match what this customer's card was really charged. Skipped while a
  // booking is in progress — that page polls, and needs neither.
  let cardFeePercentage: number | undefined
  if (!isInProgress && booking.stripe_payment_intent_id) {
    const intent = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id, { expand: ['payment_method'] }).catch(() => null)
    const paymentMethod = intent?.payment_method
    if (paymentMethod && typeof paymentMethod === 'object') cardFeePercentage = stripePercentageForCardCountry(paymentMethod.card?.country)
  }

  const location = booking.scheduled_location as ScheduledLocation | null
  const addressLabel =
    location?.type === 'address' ? location.label : location?.type === 'current_location' ? 'Current Location' : null
  const addressLine = location?.type === 'address' ? location.line : null

  const [{ data: tasks }, { data: existingReview }] = await Promise.all([
    admin
      .from('booking_tasks')
      .select('id, task_name, task_category, is_completed, completion_photo_url')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true }),
    admin.from('reviews').select('id').eq('booking_id', bookingId).maybeSingle(),
  ])

  const alreadyReviewed = !!existingReview
  // Entire home tasks can have up to 3 after photos; the rest are 1 per task.
  const { data: afterPhotoRows } = (tasks ?? []).some((t) => isEntireHomeRoom(t.task_category))
    ? await admin
        .from('booking_task_photos')
        .select('booking_task_id, photo_url')
        .eq('booking_id', bookingId)
        .eq('kind', 'after')
        .order('created_at', { ascending: true })
    : { data: [] }
  const taskRows = (tasks ?? []).map((t) => {
    const urls = (afterPhotoRows ?? []).filter((r) => r.booking_task_id === t.id).map((r) => r.photo_url)
    return urls.length > 0 ? { ...t, after_photo_urls: urls } : t
  })
  const totalPrice = booking.total_customer_charge ?? 0
  // A paid upcharge is part of the total (see lib/bookingUpcharges), shown as its own line.
  const paidUpcharges = await getPaidUpcharges(admin, booking.id)
  const upchargeAmount = Math.round(paidUpcharges.reduce((sum, u) => sum + u.amount * 100, 0)) / 100
  const upchargeCharges = paidUpcharges.reduce((sum, u) => sum + u.charge, 0)
  // Tasks the customer added (lib/bookingTaskAdditions) are shown apart from extra charges.
  const addedTasksAmount = Math.round(paidUpcharges.filter((u) => u.taskAdditionId).reduce((sum, u) => sum + u.amount * 100, 0)) / 100
  const extraChargeAmount = Math.round((upchargeAmount - addedTasksAmount) * 100) / 100
  // The total is stored with Stripe's fee already added on top (see
  // grossUpForStripeFee), so split it back out for the order summary.
  const bookingPrice = netOfStripeFee(Math.max(0, totalPrice - upchargeCharges), cardFeePercentage)
  const orderLines: OrderLine[] = [
    { label: 'Booking', amount: bookingPrice },
    ...(addedTasksAmount > 0 ? [{ label: 'Added tasks', amount: addedTasksAmount }] : []),
    ...(extraChargeAmount > 0 ? [{ label: 'Extra charge', amount: extraChargeAmount }] : []),
    { label: 'Processing fee', amount: Math.round((totalPrice - bookingPrice - upchargeAmount) * 100) / 100 },
  ]

  // Shown on the cancel button, so the customer knows before they tap it. A recurring
  // visit not paid yet costs nothing to cancel.
  const lateCancelRefundAmount =
    booking.stripe_payment_intent_id && isLateCancellation(booking.scheduled_date, booking.scheduled_time, new Date(), booking.time_zone)
      ? lateCancelRefund(totalPrice)
      : null

  // Its recurring series, while still active: Cancel then asks this visit or the whole series.
  const { data: activeSeries } = booking.recurring_booking_id
    ? await admin.from('recurring_bookings').select('id').eq('id', booking.recurring_booking_id).eq('status', 'active').maybeSingle()
    : { data: null }
  const activeSeriesId = activeSeries?.id ?? null
  const noShowReportableAtMs = noShowReportableAt(booking.scheduled_date, booking.scheduled_time, booking.time_zone)?.getTime() ?? null

  const pastBookingProps = {
    cardFeePercentage,
    bookingId: booking.id,
    cleanerName: booking.tidy_pro_name ?? 'your Tidy Pro',
    scheduledDate: booking.scheduled_date,
    scheduledTime: booking.scheduled_time,
    durationMinutes: booking.estimated_duration_minutes ?? 30,
    addressLabel,
    addressLine,
    tasks: taskRows,
    suppliesProvided: booking.will_provide_supplies ?? false,
    pets: booking.pets,
    notes: booking.notes,
    orderLines,
    totalPrice,
    alreadyReviewed,
    canSendTip: booking.status === 'completed' && alreadyReviewed && !((booking.tip ?? 0) > 0),
  }

  if (booking.status === 'cancelled' || booking.status === 'declined') {
    return <PastBookingDetailView {...pastBookingProps} status={booking.status} />
  }

  // Suspended until the customer pays an upcharge: "Needs attention" until they do.
  const pendingUpcharge = booking.status === 'scheduled' && booking.suspended_for_upcharge_at ? await getPendingUpcharge(admin, booking.id) : null
  if (pendingUpcharge) {
    const { cards, defaultCardId } = await chargeableCards(admin, session.profileId, (percentage) => upchargeCustomerCharge(pendingUpcharge.amount, percentage))
    const canCancel = booking.progress_status == null || booking.progress_status === 'on_the_way'

    return (
      <UpchargeDueView
        bookingId={booking.id}
        upcharge={pendingUpcharge}
        cards={cards}
        defaultCardId={defaultCardId}
        cleanerName={booking.tidy_pro_name ?? 'your Tidy Pro'}
        scheduledDate={booking.scheduled_date}
        scheduledTime={booking.scheduled_time}
        durationMinutes={booking.estimated_duration_minutes ?? 30}
        addressLabel={addressLabel}
        addressLine={addressLine}
        tasks={taskRows}
        suppliesProvided={booking.will_provide_supplies ?? false}
        pets={booking.pets}
        notes={booking.notes}
        orderLines={orderLines}
        totalPrice={totalPrice}
        cancel={canCancel ? { lateCancelRefund: lateCancelRefundAmount, action: cancelBookingRequestAction } : null}
      />
    )
  }

  // A recurring visit whose card charge failed (see lib/recurringPayments).
  if (
    booking.status === 'scheduled' &&
    booking.progress_status == null &&
    isUnpaidVisit(booking) &&
    booking.amount_due != null &&
    (booking.payment_failed_at || booking.suspended_for_payment_at)
  ) {
    const amountDue = Number(booking.amount_due)
    const cards = await chargeableCards(admin, session.profileId, (percentage) => grossUpForStripeFee(amountDue, percentage))
    const { date: newDate, time: newTime } = await searchParams
    const newSlot =
      booking.suspended_for_payment_at && typeof newDate === 'string' && typeof newTime === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(newDate) && /^\d{2}:\d{2}$/.test(newTime)
        ? { date: newDate, time: newTime, label: slotLabel(newDate, newTime) }
        : null

    return (
      <VisitPaymentDueView
        bookingId={booking.id}
        amountDue={amountDue}
        cards={cards.cards}
        defaultCardId={cards.defaultCardId}
        suspended={booking.suspended_for_payment_at != null}
        paymentError={booking.payment_error}
        newSlot={newSlot}
        cleanerName={booking.tidy_pro_name ?? 'your Tidy Pro'}
        scheduledDate={booking.scheduled_date}
        scheduledTime={booking.scheduled_time}
        durationMinutes={booking.estimated_duration_minutes ?? 30}
        addressLabel={addressLabel}
        addressLine={addressLine}
        tasks={taskRows}
        suppliesProvided={booking.will_provide_supplies ?? false}
        pets={booking.pets}
        notes={booking.notes}
        orderLines={orderLines}
        totalPrice={totalPrice}
        cancelAction={cancelBookingRequestAction}
      />
    )
  }

  if (booking.status === 'scheduled' && booking.progress_status == null) {
    const pendingAddition = await getPendingTaskAddition(admin, booking.id)
    const addBlocked = taskAdditionBlockedReason(booking)
    return (
      <UpcomingBookingDetailView
        taskAddition={{
          canAdd: !pendingAddition && addBlocked == null,
          blockedReason: pendingAddition ? null : addBlocked,
          pending: pendingAddition
            ? { id: pendingAddition.id, tasks: pendingAddition.tasks, taskNames: pendingAddition.tasks.map((t) => bookedTaskName(t)), charge: pendingAddition.charge, applyToSeries: pendingAddition.applyToSeries }
            : null,
        }}
        bookingId={booking.id}
        recurringSeriesId={activeSeriesId}
        started={hasBookingStarted(booking.scheduled_date, booking.scheduled_time, new Date(), booking.time_zone)}
        cleanerName={booking.tidy_pro_name ?? 'your Tidy Pro'}
        scheduledDate={booking.scheduled_date}
        scheduledTime={booking.scheduled_time}
        durationMinutes={booking.estimated_duration_minutes ?? 30}
        addressLabel={addressLabel}
        addressLine={addressLine}
        tasks={taskRows}
        suppliesProvided={booking.will_provide_supplies ?? false}
        pets={booking.pets}
        notes={booking.notes}
        orderLines={orderLines}
        totalPrice={totalPrice}
        lateCancelRefund={lateCancelRefundAmount}
        noShowReportableAtMs={noShowReportableAtMs}
        cancelBookingRequestAction={cancelBookingRequestAction}
        chargeDateLabel={
          isUnpaidVisit(booking) && booking.payment_due_at
            ? new Date(booking.payment_due_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: booking.time_zone ?? undefined })
            : null
        }
      />
    )
  }

  if (isInProgress) {
    return (
      <CurrentBookingView
        bookingId={booking.id}
        cleanerName={booking.tidy_pro_name ?? 'your Tidy Pro'}
        cleanerPhotoUrl={booking.tidy_pro_photo_url}
        progressStatus={booking.progress_status as 'on_the_way' | 'arrived' | 'cleaning'}
        isDone={false}
        tasks={taskRows}
        totalPrice={totalPrice}
        alreadyReviewed={alreadyReviewed}
        lateCancelRefund={lateCancelRefundAmount}
        noShowReportableAtMs={noShowReportableAtMs}
        addressLine={addressLine}
      />
    )
  }

  if (booking.status === 'completed') {
    // The celebratory "all done" review prompt only shows for 24 hours after
    // completion (or until reviewed) — matching the same window the dashboard
    // uses to decide whether to surface a review prompt at all. Outside that
    // window, browsing a completed booking shows the plain past-booking
    // summary instead, with review still available via "Leave a review".
    const withinWindow = isWithinReviewPromptWindow(booking.cleaner_marked_complete_at)

    if (!alreadyReviewed && withinWindow) {
      return (
        <CurrentBookingView
          cardFeePercentage={cardFeePercentage}
          bookingId={booking.id}
          cleanerName={booking.tidy_pro_name ?? 'your Tidy Pro'}
          cleanerPhotoUrl={booking.tidy_pro_photo_url}
          progressStatus="done"
          isDone
          tasks={taskRows}
          totalPrice={totalPrice}
          alreadyReviewed={alreadyReviewed}
        />
      )
    }

    return <PastBookingDetailView {...pastBookingProps} status="completed" />
  }

  redirect(`/dashboard/messages/${bookingId}`)
}
