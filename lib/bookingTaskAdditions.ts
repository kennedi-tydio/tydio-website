import type { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import { getOrCreateStripeCustomerId } from '@/lib/stripe/customer'
import { stripePercentageForPaymentMethod } from '@/lib/stripe/cardFees'
import { cardFailureMessage } from '@/lib/stripe/paymentFailure'
import { cleanerPayoutForServicePrice, grossUpForStripeFee, stripePercentageForCardCountry } from '@/lib/pricingRules'
import { DEFAULT_BOOKING_TIME_ZONE, LATE_CANCEL_WINDOW_HOURS, hasBookingStarted, isValidTimeZone } from '@/lib/bookingTime'
import { hasBookingConflict } from '@/lib/cleanerMatching'
import { overlapsTimeOff, parseTimeOff } from '@/lib/timeOff'
import { SERVICES_NOT_OFFERED_MESSAGE, providesServices, requiredServicesForTasks } from '@/lib/tidyProServices'
import { bookedTaskName, dropUnmatchedLaundryLinks, needsWasherDryer } from '@/lib/laundry'
import { isPetTask } from '@/lib/petTasks'
import { customerNeedsPets } from '@/lib/customerPetsData'
import { PETS_REQUIRED_MESSAGE } from '@/lib/customerPets'
import { bookingBlockedBySuspension } from '@/lib/accountSuspension'
import { addToBookingTotals } from '@/lib/bookingUpcharges'
import { restoreBookingTasks } from '@/lib/bookingRequestGroups'
import { notifyCustomer } from '@/lib/customerNotifications'
import { canSendSms, sendSmsForPayload } from '@/lib/sms'
import { sendPushForPayload } from '@/lib/push'
import {
  notifyTaskAdditionAccepted,
  notifyTaskAdditionRefunded,
  notifyTaskAdditionRequested,
  notifyTaskAdditionWithdrawn,
  type NotificationPayload,
} from '@/lib/notifications'
import { userFacingError } from '@/lib/userFacingError'
import {
  UnpriceableTaskError,
  priceTaskListForState,
  resolveLocationSquareFootage,
  resolveStatePricing,
  visitDurationMinutes,
} from '@/app/dashboard/taskPricing'
import type { SquareFootage } from '@/lib/squareFootage'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import type { TidyTask } from '@/app/dashboard/types'

type Admin = ReturnType<typeof createAdminClient>

// A customer adding tasks from their dashboard to an accepted booking. Allowed until
// TASK_ADDITION_CUTOFF_HOURS before it starts. They pay for the added tasks up front,
// and it goes to the Tidy Pro as an "Additional task(s)" request:
//
//   - Accepted: the tasks join the booking (its task list, checklist and length), and
//     the payment is recorded as a paid upcharge (booking_upcharges.task_addition_id),
//     so refunds and the payout work on the booking's whole total.
//   - Declined, or not answered before the booking starts: refunded in full, and the
//     tasks go back on the dashboard.
//   - The booking canceled while it's out: the same.
//
// For a recurring visit the customer can also add the tasks to every future visit
// (apply_to_series). Those visits then include the tasks in their own price, charged
// 3 days before each like the rest of the visit; only this visit's add-on is a separate
// charge. See supabase/migrations/078_booking_task_additions.sql.

export const TASK_ADDITION_CUTOFF_HOURS = LATE_CANCEL_WINDOW_HOURS
// Stripe won't charge less than this.
const MIN_ADDITION_CHARGE = 0.5

export type TaskAdditionStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled' | 'removed'

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function zoneOf(booking: { time_zone: string | null }): string {
  return isValidTimeZone(booking.time_zone) ? booking.time_zone : DEFAULT_BOOKING_TIME_ZONE
}

type AddableBooking = {
  status: string | null
  tidy_pro_id: string | null
  progress_status: string | null
  scheduled_date: string | null
  scheduled_time: string | null
  time_zone: string | null
  suspended_for_upcharge_at?: string | null
  suspended_for_payment_at?: string | null
  payment_failed_at?: string | null
  task_list?: unknown
}

// A washing or drying task where "I have a washer and dryer" isn't checked (no, or never
// answered): the Tidy Pro may be at a laundromat, so nothing else can be added.
function hasNoWasherDryer(task: TidyTask): boolean {
  return needsWasherDryer(task.laundryService) && task.hasWasherDryer !== true
}

export const LAUNDROMAT_NO_ADD_MESSAGE =
  'Tasks can’t be added to a booking with a laundromat trip, because your Tidy Pro stays at the laundromat with your laundry. Book the other tasks separately.'

// Why tasks can't be added to this booking right now, or null if they can: only an
// accepted booking that hasn't started, isn't on hold, and is more than 2 hours away.
export function taskAdditionBlockedReason(booking: AddableBooking, now: Date = new Date()): string | null {
  if (booking.status !== 'scheduled' || !booking.tidy_pro_id) return 'Tasks can only be added to an accepted booking.'
  if (booking.progress_status != null) return 'This booking has already started.'
  if (!booking.scheduled_date || !booking.scheduled_time) return 'This booking has no start time, so tasks can’t be added to it.'
  // Haul-away laundry: the Tidy Pro is at the laundromat for the whole visit.
  if (Array.isArray(booking.task_list) && (booking.task_list as TidyTask[]).some(hasNoWasherDryer)) return LAUNDROMAT_NO_ADD_MESSAGE
  if (booking.suspended_for_upcharge_at || booking.suspended_for_payment_at || booking.payment_failed_at) {
    return 'This booking needs your attention first. Please sort out its payment, then add tasks.'
  }
  const cutoff = new Date(now.getTime() + TASK_ADDITION_CUTOFF_HOURS * 60 * 60 * 1000)
  if (hasBookingStarted(booking.scheduled_date, booking.scheduled_time.slice(0, 5), cutoff, zoneOf(booking))) {
    return `Tasks can’t be added within ${TASK_ADDITION_CUTOFF_HOURS} hours of a booking’s start.`
  }
  return null
}

// The dashboard tasks being added, ready to join the booking: selected, not already on
// it, and any laundry link to a task left behind dropped.
export function tasksToAdd(dashboardTasks: TidyTask[], taskIds: string[], bookingTasks: TidyTask[]): TidyTask[] {
  const onBooking = new Set(bookingTasks.map((t) => t.id))
  const wanted = new Set(taskIds)
  const picked = dashboardTasks.filter((t) => wanted.has(t.id) && !onBooking.has(t.id)).map((t) => ({ ...t, completed: true }))
  // Links are kept only to a partner on the booking or added with it.
  const combined = dropUnmatchedLaundryLinks([...bookingTasks, ...picked])
  return combined.slice(bookingTasks.length)
}

type PricingContext = { state: string; medianFourHourPrice: number; squareFootage: SquareFootage | null }

type QuotableBooking = AddableBooking & {
  id: string
  user_id: string
  task_list: unknown
  pricing_breakdown: unknown
  scheduled_location: unknown
  estimated_duration_minutes: number | null
}

// Priced the way the booking was: its state's rate and home size at the time, so the
// added tasks cost what they would have if booked with it.
async function pricingContextFor(admin: Admin, booking: QuotableBooking): Promise<PricingContext | null> {
  const breakdown = booking.pricing_breakdown as { state?: string; median_four_hour_price?: number; square_footage?: SquareFootage | null } | null
  if (breakdown?.state && typeof breakdown.median_four_hour_price === 'number') {
    return { state: breakdown.state, medianFourHourPrice: breakdown.median_four_hour_price, squareFootage: breakdown.square_footage ?? null }
  }
  const { data: profile } = await admin.from('profiles').select('service_area_id, city, state').eq('id', booking.user_id).maybeSingle()
  const statePricing = await resolveStatePricing(admin, profile?.service_area_id ?? null, profile ?? undefined)
  if (!statePricing.configured) return null
  const squareFootage = await resolveLocationSquareFootage(admin, booking.user_id, booking.scheduled_location as ScheduledLocation | null)
  return { state: statePricing.state, medianFourHourPrice: statePricing.medianFourHourPrice, squareFootage }
}

export type TaskAdditionQuote = {
  tasks: TidyTask[]
  // Before the card fee.
  amount: number
  cleanerPay: number
  newDurationMinutes: number
  addedMinutes: number
}

// What the added tasks add to the booking's price, and how long the visit becomes
// with them. The difference between the booking priced with and without them, not
// their price on their own: laundry on the booking covers household tasks' time, so
// a task done while it runs costs only its surcharges and multiplier (or more
// laundry covers time already booked). The Tidy Pro's flat surcharges are already
// paid with the booking.
export function priceTaskAddition(bookingTasks: TidyTask[], added: TidyTask[], pricing: PricingContext, currentDuration: number | null): TaskAdditionQuote {
  const price = (tasks: TidyTask[]) =>
    tasks.length === 0 ? 0 : priceTaskListForState(tasks, pricing.state, pricing.medianFourHourPrice, pricing.squareFootage).total_customer_charge
  const amount = round2(Math.max(0, price(dropUnmatchedLaundryLinks([...bookingTasks, ...added])) - price(bookingTasks)))
  const newDurationMinutes = visitDurationMinutes([...bookingTasks, ...added], pricing.squareFootage)
  const before = currentDuration ?? visitDurationMinutes(bookingTasks, pricing.squareFootage)
  return { tasks: added, amount, cleanerPay: cleanerPayoutForServicePrice(amount), newDurationMinutes, addedMinutes: Math.max(0, newDurationMinutes - before) }
}

// Whether the Tidy Pro can do the booking at its new length: still offers everything,
// isn't off, and has no booking it would run into.
async function scheduleProblem(admin: Admin, booking: QuotableBooking & { id: string }, tasks: TidyTask[], newDuration: number, forTidyPro: boolean): Promise<string | null> {
  const { data: tidyPro } = await admin.from('tidypro_profiles').select('services_provided, time_off').eq('id', booking.tidy_pro_id!).maybeSingle()
  if (tidyPro && !providesServices(tidyPro.services_provided, requiredServicesForTasks(tasks))) {
    return forTidyPro ? 'You don’t offer one of these services, so you can’t accept them.' : SERVICES_NOT_OFFERED_MESSAGE
  }
  const date = booking.scheduled_date!
  const time = booking.scheduled_time!.slice(0, 5)
  const busy =
    (tidyPro && overlapsTimeOff(parseTimeOff(tidyPro.time_off), date, time, newDuration)) ||
    (await hasBookingConflict(admin, booking.tidy_pro_id!, date, time, newDuration, booking.id))
  if (busy) {
    return forTidyPro
      ? 'These tasks would run into another booking or time off on your schedule, so you can’t accept them.'
      : 'Your Tidy Pro doesn’t have time for these tasks at this booking. Try fewer tasks, or book them separately.'
  }
  return null
}

const BOOKING_COLUMNS =
  'id, user_id, tidy_pro_id, tidy_pro_name, status, progress_status, scheduled_date, scheduled_time, time_zone, scheduled_location, estimated_duration_minutes, task_list, pricing_breakdown, recurring_booking_id, suspended_for_upcharge_at, suspended_for_payment_at, payment_failed_at, total_customer_charge, customer_subtotal, cleaner_pay'

async function loadCustomerBooking(admin: Admin, bookingId: string, customerId: string) {
  const { data } = await admin.from('bookings').select(BOOKING_COLUMNS).eq('id', bookingId).eq('user_id', customerId).maybeSingle()
  return data
}

async function latestDraft(admin: Admin, customerId: string) {
  const { data } = await admin
    .from('booking_drafts')
    .select('id, task_list')
    .eq('customer_user_id', customerId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

// Whether "this and every future visit" can be offered: a visit of a series still going.
export async function seriesForBooking(admin: Admin, booking: { recurring_booking_id: string | null }): Promise<{ id: string } | null> {
  if (!booking.recurring_booking_id) return null
  const { data } = await admin.from('recurring_bookings').select('id, status').eq('id', booking.recurring_booking_id).maybeSingle()
  return data?.status === 'active' ? { id: data.id } : null
}

export type QuoteResult = { quote: TaskAdditionQuote; offerSeries: boolean } | { error: string }

// What adding these dashboard tasks would cost, checked the same way the request is.
export async function quoteTaskAddition(admin: Admin, input: { customerId: string; bookingId: string; taskIds: string[] }): Promise<QuoteResult> {
  const booking = await loadCustomerBooking(admin, input.bookingId, input.customerId)
  if (!booking) return { error: 'Booking not found.' }
  const blocked = taskAdditionBlockedReason(booking)
  if (blocked) return { error: blocked }

  const { data: pending } = await admin.from('booking_task_additions').select('id').eq('booking_id', booking.id).eq('status', 'pending').maybeSingle()
  if (pending) return { error: 'You already have added tasks waiting on your Tidy Pro for this booking.' }

  const draft = await latestDraft(admin, input.customerId)
  const bookingTasks = (booking.task_list as TidyTask[] | null) ?? []
  const added = tasksToAdd((draft?.task_list as TidyTask[] | null) ?? [], input.taskIds, bookingTasks)
  if (added.length === 0) return { error: 'Choose at least one task to add.' }

  if (added.some((t) => isPetTask(t)) && (await customerNeedsPets(admin, input.customerId))) return { error: PETS_REQUIRED_MESSAGE }

  const pricing = await pricingContextFor(admin, booking)
  if (!pricing) return { error: 'Pricing is not available for your area.' }
  let quote: TaskAdditionQuote
  try {
    quote = priceTaskAddition(bookingTasks, added, pricing, booking.estimated_duration_minutes)
  } catch (err) {
    if (err instanceof UnpriceableTaskError) return { error: 'We couldn’t price one of these tasks. Try editing it on your dashboard.' }
    throw err
  }
  if (quote.amount < MIN_ADDITION_CHARGE) {
    return { error: 'These tasks don’t add enough to the price to be charged on their own. Try adding another task with them, or message your Tidy Pro.' }
  }

  const problem = await scheduleProblem(admin, booking, added, quote.newDurationMinutes, false)
  if (problem) return { error: problem }

  return { quote, offerSeries: (await seriesForBooking(admin, booking)) != null }
}

async function notifyTidyPro(admin: Admin, tidyProId: string, payload: NotificationPayload): Promise<void> {
  const { data: tidyPro } = await admin.from('tidypro_profiles').select('phone, sms_consent').eq('id', tidyProId).maybeSingle()
  if (canSendSms(tidyPro?.sms_consent ?? null, tidyPro?.phone ?? null)) {
    await sendSmsForPayload(tidyPro!.phone!, payload).catch((err) => console.error('Cleaner SMS failed', err))
  }
  await sendPushForPayload(tidyProId, payload).catch((err) => console.error('Cleaner push failed', err))
}

// Takes the requested tasks off the dashboard while they're out with the Tidy Pro.
async function removeFromDashboard(admin: Admin, customerId: string, taskIds: string[]): Promise<void> {
  const draft = await latestDraft(admin, customerId)
  if (!draft) return
  const gone = new Set(taskIds)
  const remaining = dropUnmatchedLaundryLinks(((draft.task_list as TidyTask[] | null) ?? []).filter((t) => !gone.has(t.id)))
  if (remaining.length === 0) await admin.from('booking_drafts').delete().eq('id', draft.id)
  else await admin.from('booking_drafts').update({ task_list: remaining as never }).eq('id', draft.id)
}

// The customer paying for the added tasks and sending them to the Tidy Pro. expectedCents
// is the total they were shown for the card they picked, so they're never charged a
// different amount; attemptId is new for each tap of Pay, so a double tap charges once.
export async function requestTaskAddition(
  admin: Admin,
  input: {
    customerId: string
    bookingId: string
    taskIds: string[]
    applyToSeries: boolean
    paymentMethodId: string
    expectedCents: number
    attemptId: string
  }
): Promise<{ success: true; charged: number } | { error: string; paymentFailed?: true }> {
  const suspended = await bookingBlockedBySuspension(admin, input.customerId)
  if (suspended) return { error: suspended }

  const quoted = await quoteTaskAddition(admin, input)
  if ('error' in quoted) return quoted
  const { quote } = quoted
  if (input.applyToSeries && !quoted.offerSeries) return { error: 'This booking isn’t part of a recurring booking anymore. Please refresh the page.' }

  const { data: savedPaymentMethod } = await admin
    .from('payment_methods')
    .select('stripe_payment_method_id')
    .eq('id', input.paymentMethodId)
    .eq('user_id', input.customerId)
    .maybeSingle()
  if (!savedPaymentMethod?.stripe_payment_method_id) return { error: 'Payment method not found.' }

  let charge: number
  try {
    charge = grossUpForStripeFee(quote.amount, await stripePercentageForPaymentMethod(savedPaymentMethod.stripe_payment_method_id))
  } catch {
    return { error: 'We could not verify your card. Please try again.' }
  }
  if (Math.round(charge * 100) !== input.expectedCents) return { error: 'The total for these tasks has changed. Please refresh the page and try again.' }

  const { data: booking } = await admin.from('bookings').select('id, tidy_pro_id').eq('id', input.bookingId).maybeSingle()
  if (!booking?.tidy_pro_id) return { error: 'Booking not found.' }

  let paymentIntentId: string
  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: Math.round(charge * 100),
        currency: 'usd',
        customer: await getOrCreateStripeCustomerId(input.customerId),
        payment_method: savedPaymentMethod.stripe_payment_method_id,
        off_session: true,
        confirm: true,
        metadata: { profile_id: input.customerId, booking_id: booking.id, kind: 'task_addition' },
      },
      { idempotencyKey: `task-addition-${booking.id}-${input.attemptId}` }
    )
    paymentIntentId = intent.id
  } catch (err) {
    const cardMessage = cardFailureMessage(err)
    if (cardMessage) return { error: cardMessage, paymentFailed: true }
    return { error: userFacingError(err, 'Payment failed. Please try again.') }
  }

  const { error: insertError } = await admin.from('booking_task_additions').insert({
    booking_id: booking.id,
    user_id: input.customerId,
    tidy_pro_id: booking.tidy_pro_id,
    task_list: quote.tasks as never,
    apply_to_series: input.applyToSeries,
    amount: quote.amount,
    cleaner_pay: quote.cleanerPay,
    customer_charge: charge,
    new_duration_minutes: quote.newDurationMinutes,
    stripe_payment_intent_id: paymentIntentId,
  })
  if (insertError) {
    // The same tap sent twice: Stripe handed back the same payment, already recorded.
    const { data: same } = await admin.from('booking_task_additions').select('id').eq('stripe_payment_intent_id', paymentIntentId).maybeSingle()
    if (same) return { success: true, charged: charge }
    // Another request went in at the same moment (one pending per booking), or the
    // row couldn't be saved: nothing was sent, so nothing should be charged.
    await stripe.refunds
      .create({ payment_intent: paymentIntentId }, { idempotencyKey: `refund-task-addition-race-${paymentIntentId}` })
      .catch((err) => console.error('Could not refund task addition payment', paymentIntentId, err))
    return {
      error:
        insertError.code === '23505'
          ? 'You already have added tasks waiting on your Tidy Pro for this booking, so your card has been refunded.'
          : userFacingError(insertError, 'Your tasks couldn’t be sent, so your card has been refunded. Please try again.'),
    }
  }

  await removeFromDashboard(admin, input.customerId, quote.tasks.map((t) => t.id))
  await admin.from('bookings').update({ tidy_pro_unread: true }).eq('id', booking.id)

  const { data: customer } = await admin.from('profiles').select('first_name').eq('id', input.customerId).maybeSingle()
  await notifyTidyPro(admin, booking.tidy_pro_id, notifyTaskAdditionRequested(customer?.first_name ?? 'A customer', quote.tasks.length, quote.cleanerPay, booking.id))
  return { success: true, charged: charge }
}

export type PendingTaskAddition = {
  id: string
  tasks: TidyTask[]
  amount: number
  cleanerPay: number
  charge: number
  newDurationMinutes: number
  applyToSeries: boolean
  createdAt: string
}

export async function getPendingTaskAddition(admin: Admin, bookingId: string): Promise<PendingTaskAddition | null> {
  const { data } = await admin
    .from('booking_task_additions')
    .select('id, task_list, amount, cleaner_pay, customer_charge, new_duration_minutes, apply_to_series, created_at')
    .eq('booking_id', bookingId)
    .eq('status', 'pending')
    .maybeSingle()
  if (!data) return null
  return {
    id: data.id,
    tasks: (data.task_list as TidyTask[] | null) ?? [],
    amount: Number(data.amount),
    cleanerPay: Number(data.cleaner_pay),
    charge: Number(data.customer_charge),
    newDurationMinutes: data.new_duration_minutes,
    applyToSeries: data.apply_to_series,
    createdAt: data.created_at,
  }
}

// Every request to add tasks to this booking, oldest first, for the message threads: an open
// one to answer, and the record of ones answered (accepted, declined, expired, canceled).
export type TaskAdditionRecord = {
  id: string
  tasks: TidyTask[]
  status: TaskAdditionStatus
  charge: number
  cleanerPay: number
  newDurationMinutes: number
  applyToSeries: boolean
  createdAt: string
}

export async function listTaskAdditions(admin: Admin, bookingId: string): Promise<TaskAdditionRecord[]> {
  const { data } = await admin
    .from('booking_task_additions')
    .select('id, task_list, status, cleaner_pay, customer_charge, new_duration_minutes, apply_to_series, created_at')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true })
  return (data ?? []).map((row) => ({
    id: row.id,
    tasks: (row.task_list as TidyTask[] | null) ?? [],
    status: row.status as TaskAdditionStatus,
    charge: Number(row.customer_charge),
    cleanerPay: Number(row.cleaner_pay),
    newDurationMinutes: row.new_duration_minutes,
    applyToSeries: row.apply_to_series,
    createdAt: row.created_at,
  }))
}

type AdditionRow = {
  id: string
  booking_id: string
  user_id: string
  tidy_pro_id: string | null
  task_list: unknown
  amount: number
  cleaner_pay: number
  customer_charge: number
  apply_to_series: boolean
  stripe_payment_intent_id: string
}

const ADDITION_COLUMNS = 'id, booking_id, user_id, tidy_pro_id, task_list, amount, cleaner_pay, customer_charge, apply_to_series, stripe_payment_intent_id'

async function cleanerFirstName(admin: Admin, tidyProId: string | null): Promise<string> {
  if (!tidyProId) return 'Your Tidy Pro'
  const { data } = await admin.from('profiles').select('first_name').eq('id', tidyProId).maybeSingle()
  return data?.first_name ?? 'Your Tidy Pro'
}

// Ends a pending request with a full refund, and puts its tasks back on the dashboard.
// Claimed first, so it can't also be accepted. If the refund fails it's put back to
// pending, so the money is never left stranded and the scheduled job tries again.
async function settleWithRefund(
  admin: Admin,
  addition: AdditionRow,
  status: 'declined' | 'expired' | 'cancelled'
): Promise<{ success: true } | { error: string }> {
  const { data: claimed } = await admin
    .from('booking_task_additions')
    .update({ status, responded_at: new Date().toISOString() })
    .eq('id', addition.id)
    .eq('status', 'pending')
    .select('id')
  if (!claimed?.length) return { error: 'This request has already been answered. Please refresh the page.' }

  let refundId: string
  try {
    refundId = (
      await stripe.refunds.create({ payment_intent: addition.stripe_payment_intent_id }, { idempotencyKey: `refund-task-addition-${addition.id}` })
    ).id
  } catch (err) {
    await admin.from('booking_task_additions').update({ status: 'pending', responded_at: null }).eq('id', addition.id).eq('status', status)
    return { error: userFacingError(err, 'The refund didn’t go through. Please try again.') }
  }
  await admin.from('booking_task_additions').update({ stripe_refund_id: refundId }).eq('id', addition.id)

  await restoreBookingTasks(admin, addition.user_id, (addition.task_list as TidyTask[] | null) ?? [])
  // A canceled booking already told the customer; their refund for these is included.
  if (status !== 'cancelled') {
    await notifyCustomer(admin, addition.user_id, notifyTaskAdditionRefunded(status, await cleanerFirstName(admin, addition.tidy_pro_id), Number(addition.customer_charge)))
  }
  return { success: true }
}

async function loadPendingForTidyPro(admin: Admin, additionId: string, tidyProId: string): Promise<AdditionRow | null> {
  const { data } = await admin
    .from('booking_task_additions')
    .select(ADDITION_COLUMNS)
    .eq('id', additionId)
    .eq('tidy_pro_id', tidyProId)
    .eq('status', 'pending')
    .maybeSingle()
  return data
}

// The customer taking back their request before the Tidy Pro answers: refunded in full,
// the tasks go back on their dashboard, and the Tidy Pro is told (the customer isn't
// texted about their own cancel).
export async function withdrawTaskAddition(admin: Admin, input: { additionId: string; customerId: string }): Promise<{ success: true; bookingId: string } | { error: string }> {
  const { data: addition } = await admin
    .from('booking_task_additions')
    .select(ADDITION_COLUMNS)
    .eq('id', input.additionId)
    .eq('user_id', input.customerId)
    .eq('status', 'pending')
    .maybeSingle()
  if (!addition) return { error: 'Your Tidy Pro has already answered this request. Please refresh the page.' }
  const result = await settleWithRefund(admin, addition, 'cancelled')
  if ('error' in result) return result
  if (addition.tidy_pro_id) {
    const { data: customer } = await admin.from('profiles').select('first_name').eq('id', input.customerId).maybeSingle()
    await notifyTidyPro(admin, addition.tidy_pro_id, notifyTaskAdditionWithdrawn(customer?.first_name ?? 'The customer', addition.booking_id))
  }
  return { success: true, bookingId: addition.booking_id }
}

export async function declineTaskAddition(admin: Admin, input: { additionId: string; tidyProId: string }): Promise<{ success: true; bookingId: string } | { error: string }> {
  const addition = await loadPendingForTidyPro(admin, input.additionId, input.tidyProId)
  if (!addition) return { error: 'This request has already been answered. Please refresh the page.' }
  const result = await settleWithRefund(admin, addition, 'declined')
  return 'error' in result ? result : { success: true, bookingId: addition.booking_id }
}

export async function acceptTaskAddition(admin: Admin, input: { additionId: string; tidyProId: string; now?: Date }): Promise<{ success: true; bookingId: string } | { error: string }> {
  const now = input.now ?? new Date()
  const addition = await loadPendingForTidyPro(admin, input.additionId, input.tidyProId)
  if (!addition) return { error: 'This request has already been answered. Please refresh the page.' }

  const { data: booking } = await admin.from('bookings').select(BOOKING_COLUMNS).eq('id', addition.booking_id).eq('tidy_pro_id', input.tidyProId).maybeSingle()
  if (!booking || booking.status !== 'scheduled') return { error: 'This booking is no longer on your schedule.' }
  if (booking.scheduled_date && booking.scheduled_time && hasBookingStarted(booking.scheduled_date, booking.scheduled_time.slice(0, 5), now, zoneOf(booking))) {
    return { error: 'This booking has already started, so these tasks can’t be added anymore.' }
  }

  const added = (addition.task_list as TidyTask[] | null) ?? []
  const bookingTasks = (booking.task_list as TidyTask[] | null) ?? []
  const pricing = await pricingContextFor(admin, booking)
  const combined = dropUnmatchedLaundryLinks([...bookingTasks, ...added.filter((t) => !bookingTasks.some((b) => b.id === t.id))])
  const newDuration = visitDurationMinutes(combined, pricing?.squareFootage ?? null)
  const problem = await scheduleProblem(admin, booking, added, newDuration, true)
  if (problem) return { error: problem }

  const { data: claimed } = await admin
    .from('booking_task_additions')
    .update({ status: 'accepted', responded_at: now.toISOString(), new_duration_minutes: newDuration })
    .eq('id', addition.id)
    .eq('status', 'pending')
    .select('id')
  if (!claimed?.length) return { error: 'This request has already been answered. Please refresh the page.' }

  const { data: updated } = await admin
    .from('bookings')
    .update({ task_list: combined as never, estimated_duration_minutes: newDuration, user_unread: true })
    .eq('id', booking.id)
    .eq('status', 'scheduled')
    .select('id')
  if (!updated?.length) {
    // Canceled while this was being accepted: refund it like any other ended request.
    await admin.from('booking_task_additions').update({ status: 'pending' }).eq('id', addition.id).eq('status', 'accepted')
    await settleWithRefund(admin, addition, 'cancelled')
    return { error: 'This booking was just canceled.' }
  }

  const { data: checklist } = await admin
    .from('booking_tasks')
    .insert(
      added.map((task) => ({
        booking_id: booking.id,
        task_name: bookedTaskName(task),
        task_category: task.room,
        task_icon: task.room.toLowerCase(),
        is_completed: false,
      })) as never
    )
    .select('id')

  // From here on it's part of the booking's total, like a paid upcharge.
  await admin.from('booking_upcharges').insert({
    booking_id: booking.id,
    amount: Number(addition.amount),
    cleaner_pay: Number(addition.cleaner_pay),
    reason: `Added tasks: ${added.map((t) => bookedTaskName(t)).join(', ')}`,
    status: 'paid',
    customer_charge: Number(addition.customer_charge),
    stripe_payment_intent_id: addition.stripe_payment_intent_id,
    paid_at: now.toISOString(),
    task_addition_id: addition.id,
  })
  await addToBookingTotals(admin, booking, { charge: Number(addition.customer_charge), amount: Number(addition.amount), cleanerPay: Number(addition.cleaner_pay) })
  await admin
    .from('booking_task_additions')
    .update({ booking_task_ids: (checklist ?? []).map((r: { id: string }) => r.id) })
    .eq('id', addition.id)

  if (addition.apply_to_series && booking.recurring_booking_id) {
    await addTasksToSeries(admin, { seriesId: booking.recurring_booking_id, fromBooking: booking, tasks: added, pricing }).catch((err) =>
      console.error('Adding tasks to recurring series failed', booking.recurring_booking_id, err)
    )
  }

  await notifyCustomer(admin, addition.user_id, notifyTaskAdditionAccepted(await cleanerFirstName(admin, input.tidyProId), booking.id))
  return { success: true, bookingId: booking.id }
}

// "This and every future visit": the series books each next visit with the tasks, priced
// into that visit. Visits already booked and not yet charged get them too, if the Tidy
// Pro has the time; ones already paid for stay as they were.
async function addTasksToSeries(
  admin: Admin,
  input: { seriesId: string; fromBooking: { id: string; scheduled_date: string | null }; tasks: TidyTask[]; pricing: PricingContext | null }
): Promise<void> {
  const { data: series } = await admin.from('recurring_bookings').select('id, task_list, payment_method_id, status').eq('id', input.seriesId).maybeSingle()
  if (!series || series.status !== 'active') return
  const seriesTasks = (series.task_list as TidyTask[] | null) ?? []
  const newOnes = input.tasks.filter((t) => !seriesTasks.some((s) => s.id === t.id))
  if (newOnes.length > 0) {
    await admin
      .from('recurring_bookings')
      .update({ task_list: dropUnmatchedLaundryLinks([...seriesTasks, ...newOnes]) as never, updated_at: new Date().toISOString() })
      .eq('id', series.id)
  }

  if (!input.pricing || !input.fromBooking.scheduled_date) return
  const { data: later } = await admin
    .from('bookings')
    .select('id, tidy_pro_id, scheduled_date, scheduled_time, time_zone, task_list, estimated_duration_minutes, amount_due, customer_subtotal, cleaner_pay, status, progress_status, user_id, scheduled_location, pricing_breakdown')
    .eq('recurring_booking_id', series.id)
    .eq('status', 'scheduled')
    .is('stripe_payment_intent_id', null)
    .not('payment_due_at', 'is', null)
    .is('progress_status', null)
    .gt('scheduled_date', input.fromBooking.scheduled_date)
  if (!later?.length) return

  const { data: card } = series.payment_method_id
    ? await admin.from('payment_methods').select('stripe_payment_method_id').eq('id', series.payment_method_id).maybeSingle()
    : { data: null }
  const percentage = card?.stripe_payment_method_id
    ? await stripePercentageForPaymentMethod(card.stripe_payment_method_id).catch(() => stripePercentageForCardCountry('US'))
    : stripePercentageForCardCountry('US')

  for (const visit of later) {
    const visitTasks = (visit.task_list as TidyTask[] | null) ?? []
    const toAdd = input.tasks.filter((t) => !visitTasks.some((v) => v.id === t.id))
    if (toAdd.length === 0 || !visit.tidy_pro_id) continue
    const quote = priceTaskAddition(visitTasks, toAdd, input.pricing, visit.estimated_duration_minutes)
    if (await scheduleProblem(admin, visit as QuotableBooking, toAdd, quote.newDurationMinutes, true)) {
      console.warn('Recurring visit has no room for added tasks; left as booked', visit.id)
      continue
    }
    const amountDue = round2(Number(visit.amount_due ?? 0) + quote.amount)
    const { data: done } = await admin
      .from('bookings')
      .update({
        task_list: dropUnmatchedLaundryLinks([...visitTasks, ...toAdd]) as never,
        estimated_duration_minutes: quote.newDurationMinutes,
        amount_due: amountDue,
        customer_subtotal: round2(Number(visit.customer_subtotal ?? 0) + quote.amount),
        cleaner_pay: round2(Number(visit.cleaner_pay ?? 0) + quote.cleanerPay),
        total_customer_charge: grossUpForStripeFee(amountDue, percentage),
        tidy_pro_unread: true,
      })
      .eq('id', visit.id)
      .is('stripe_payment_intent_id', null)
      .not('payment_due_at', 'is', null)
      .select('id')
    if (!done?.length) continue
    await admin.from('booking_tasks').insert(
      toAdd.map((task) => ({
        booking_id: visit.id,
        task_name: bookedTaskName(task),
        task_category: task.room,
        task_icon: task.room.toLowerCase(),
        is_completed: false,
      })) as never
    )
  }
}

// The booking was canceled (by anyone) while a request was out: refunded in full, and
// the tasks go back on the dashboard. Called from dropPendingUpcharges, which every
// cancellation runs.
export async function endPendingTaskAdditions(admin: Admin, bookingId: string): Promise<void> {
  const { data: pending } = await admin.from('booking_task_additions').select(ADDITION_COLUMNS).eq('booking_id', bookingId).eq('status', 'pending')
  for (const addition of pending ?? []) {
    const result = await settleWithRefund(admin, addition, 'cancelled')
    if ('error' in result) console.error('Could not refund pending task addition', addition.id, result.error)
  }
}

// From the every-minute job: requests not answered by the booking's start are refunded
// and their tasks returned; ones whose booking has ended are cleaned up the same way
// (in case the cancellation's own clean-up failed).
export async function expireTaskAdditions(admin: Admin, now: Date = new Date()): Promise<{ expired: number }> {
  const { data: pending } = await admin.from('booking_task_additions').select(ADDITION_COLUMNS).eq('status', 'pending').limit(200)
  if (!pending?.length) return { expired: 0 }
  const { data: bookings } = await admin
    .from('bookings')
    .select('id, status, scheduled_date, scheduled_time, time_zone')
    .in('id', [...new Set(pending.map((p) => p.booking_id))])
  const byId = new Map((bookings ?? []).map((b) => [b.id, b]))

  let expired = 0
  for (const addition of pending) {
    const booking = byId.get(addition.booking_id)
    const ended = !booking || booking.status !== 'scheduled'
    const started =
      booking?.scheduled_date && booking.scheduled_time ? hasBookingStarted(booking.scheduled_date, booking.scheduled_time.slice(0, 5), now, zoneOf(booking)) : false
    if (!ended && !started) continue
    const result = await settleWithRefund(admin, addition, ended ? 'cancelled' : 'expired')
    if ('error' in result) console.error('Could not expire task addition', addition.id, result.error)
    else expired++
  }
  return { expired }
}

// The Tidy Pro backed out and the booking goes to someone else, paid from its original
// charge. refundUpchargesForReplacement has already refunded these tasks' payments and
// taken them off the totals; this takes the tasks off the booking too, and puts them
// back on the dashboard so the customer can add them for whoever takes it.
export async function removeAcceptedTaskAdditions(admin: Admin, bookingId: string): Promise<void> {
  const { data: accepted } = await admin
    .from('booking_task_additions')
    .select(`${ADDITION_COLUMNS}, booking_task_ids`)
    .eq('booking_id', bookingId)
    .eq('status', 'accepted')
  if (!accepted?.length) return

  const { data: booking } = await admin.from('bookings').select(BOOKING_COLUMNS).eq('id', bookingId).maybeSingle()
  if (!booking) return
  const removedIds = new Set(accepted.flatMap((a) => ((a.task_list as TidyTask[] | null) ?? []).map((t) => t.id)))
  const remaining = dropUnmatchedLaundryLinks(((booking.task_list as TidyTask[] | null) ?? []).filter((t) => !removedIds.has(t.id)))
  const pricing = await pricingContextFor(admin, booking)
  await admin
    .from('bookings')
    .update({ task_list: remaining as never, estimated_duration_minutes: visitDurationMinutes(remaining, pricing?.squareFootage ?? null) })
    .eq('id', bookingId)

  const checklistIds = accepted.flatMap((a) => a.booking_task_ids ?? [])
  if (checklistIds.length) await admin.from('booking_tasks').delete().in('id', checklistIds)

  const { data: upcharges } = await admin
    .from('booking_upcharges')
    .select('task_addition_id, stripe_refund_id')
    .in('task_addition_id', accepted.map((a) => a.id))
  const refundByAddition = new Map((upcharges ?? []).map((u) => [u.task_addition_id, u.stripe_refund_id]))

  const cleanerName = await cleanerFirstName(admin, booking.tidy_pro_id)
  for (const addition of accepted) {
    await admin
      .from('booking_task_additions')
      .update({ status: 'removed', stripe_refund_id: refundByAddition.get(addition.id) ?? null })
      .eq('id', addition.id)
      .eq('status', 'accepted')
    await restoreBookingTasks(admin, addition.user_id, (addition.task_list as TidyTask[] | null) ?? [])
    await notifyCustomer(admin, addition.user_id, notifyTaskAdditionRefunded('removed', cleanerName, Number(addition.customer_charge)))
  }
}
