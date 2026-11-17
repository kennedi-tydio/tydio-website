import type { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import { getOrCreateStripeCustomerId } from '@/lib/stripe/customer'
import { stripePercentageForPaymentMethod } from '@/lib/stripe/cardFees'
import { cardFailureMessage } from '@/lib/stripe/paymentFailure'
import { grossUpForStripeFee } from '@/lib/pricingRules'
import { bookingStartInstant, DEFAULT_BOOKING_TIME_ZONE, isValidTimeZone, todayInZone, hourInZone } from '@/lib/bookingTime'
import { hasBookingConflict, minutesSinceMidnight, type WeeklyAvailability } from '@/lib/cleanerMatching'
import { openStartTimes } from '@/lib/bookingSlots'
import { parseTimeOff } from '@/lib/timeOff'
import { shouldSuspendUnpaidVisit, unpaidVisitAction } from '@/lib/recurrence'
import { notifyCustomer } from '@/lib/customerNotifications'
import { canSendSms, sendSmsForPayload } from '@/lib/sms'
import { sendPushForPayload } from '@/lib/push'
import {
  notifyRecurringPaymentFailed,
  notifyRecurringVisitBackOn,
  notifyRecurringVisitCancelledUnpaid,
  notifyRecurringVisitCharged,
  notifyRecurringVisitOnHold,
  notifyRecurringVisitPaidConfirmation,
  notifyRecurringVisitSuspended,
  type NotificationPayload,
} from '@/lib/notifications'
import { userFacingError } from '@/lib/userFacingError'
import { dropPendingUpcharges, getPaidUpcharges, refundUpchargesOfUnpaidVisit } from '@/lib/bookingUpcharges'

type Admin = ReturnType<typeof createAdminClient>

// Paying for the visits of a recurring booking whose Tidy Pro accepted the series. Each
// next visit goes on their schedule already accepted and unpaid (lib/placeBooking,
// deferPayment), with payment_due_at 3 days before it starts. Then:
//
//   - The scheduled job charges the series' card at payment_due_at. A failed charge
//     shows the customer "Needs attention" and is tried again every 24 hours. The
//     customer can also pay in the app with any card.
//   - Still unpaid 24 hours before the start, it's suspended: the Tidy Pro can't start
//     it, and to keep it the customer has to pay and choose a new date.
//   - Still unpaid at its original start, it's canceled. Nothing was charged, so nothing
//     is refunded, and the rest of the series carries on.
//
// payment_due_at is set only while a visit is unpaid, so it's what marks one. Once paid,
// a visit is an ordinary booking: refunds, cancellations and payouts all work on its
// stripe_payment_intent_id as usual. See supabase/migrations/077_recurring_visit_payments.sql.

export const UNPAID_VISIT_CANCELLED_REASON = 'unpaid'
export const UNPAID_HOLD_MESSAGE = "This visit is on hold because the customer's payment didn't go through. Don't start it unless it's paid. We'll let you know."

// Whether a booking is a visit still waiting on its payment.
export function isUnpaidVisit(booking: { payment_due_at?: string | null }): boolean {
  return booking.payment_due_at != null
}

async function notifyTidyPro(admin: Admin, tidyProId: string, payload: NotificationPayload): Promise<void> {
  const { data: tidyPro } = await admin.from('tidypro_profiles').select('phone, sms_consent').eq('id', tidyProId).maybeSingle()
  if (canSendSms(tidyPro?.sms_consent ?? null, tidyPro?.phone ?? null)) {
    await sendSmsForPayload(tidyPro!.phone!, payload).catch((err) => console.error('Cleaner SMS failed', err))
  }
  await sendPushForPayload(tidyProId, payload).catch((err) => console.error('Cleaner push failed', err))
}

async function customerFirstName(admin: Admin, customerId: string): Promise<string> {
  const { data } = await admin.from('profiles').select('first_name').eq('id', customerId).maybeSingle()
  return data?.first_name ?? 'The customer'
}

const UNPAID_VISIT_COLUMNS =
  'id, user_id, tidy_pro_id, status, progress_status, scheduled_date, scheduled_time, time_zone, estimated_duration_minutes, amount_due, payment_due_at, payment_attempted_at, payment_failed_at, suspended_for_payment_at, recurring_booking_id'

type UnpaidVisit = {
  id: string
  user_id: string
  tidy_pro_id: string | null
  status: string | null
  progress_status: string | null
  scheduled_date: string | null
  scheduled_time: string | null
  time_zone: string | null
  estimated_duration_minutes: number | null
  amount_due: number | null
  payment_due_at: string | null
  payment_attempted_at: string | null
  payment_failed_at: string | null
  suspended_for_payment_at: string | null
  recurring_booking_id: string | null
}

function zoneOf(visit: { time_zone: string | null }): string {
  return isValidTimeZone(visit.time_zone) ? visit.time_zone : DEFAULT_BOOKING_TIME_ZONE
}

function startOf(visit: UnpaidVisit): Date | null {
  if (!visit.scheduled_date || !visit.scheduled_time) return null
  return bookingStartInstant(visit.scheduled_date, visit.scheduled_time.slice(0, 5), zoneOf(visit))
}

// What a card is charged for a visit: its price plus Stripe's fee for that card.
export async function visitChargeForCard(amountDue: number, stripePaymentMethodId: string): Promise<number> {
  return grossUpForStripeFee(amountDue, await stripePercentageForPaymentMethod(stripePaymentMethodId))
}

// Whether the Tidy Pro can take the visit at a new date and time: inside their weekly
// hours, clear of their time off, and not overlapping another booking. The same rules
// the time picker shows the customer, checked again here.
export async function checkNewVisitTime(
  admin: Admin,
  visit: Pick<UnpaidVisit, 'id' | 'tidy_pro_id' | 'estimated_duration_minutes' | 'time_zone'>,
  date: string,
  time: string,
  now: Date = new Date()
): Promise<string | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return 'Please choose a date and time.'
  if (!visit.tidy_pro_id) return 'This visit no longer has a Tidy Pro.'
  const timeZone = zoneOf(visit)
  const today = todayInZone(timeZone, now)
  if (date < today) return 'That date has already passed. Please choose another.'
  const duration = visit.estimated_duration_minutes ?? 60

  const { data: tidyPro } = await admin.from('tidypro_profiles').select('availability, time_off, is_away').eq('id', visit.tidy_pro_id).maybeSingle()
  if (!tidyPro || tidyPro.is_away) return 'Your Tidy Pro is away right now, so this visit can’t be moved. You can cancel it instead.'

  const earliestStart = date === today ? hourInZone(timeZone, now) * 60 + 60 : 0
  const open = openStartTimes({
    availability: (tidyPro.availability as WeeklyAvailability | null) ?? {},
    timeOff: parseTimeOff(tidyPro.time_off),
    dateISO: date,
    durationMinutes: duration,
    earliestStart,
  })
  if (!open.includes(time) || minutesSinceMidnight(time) < earliestStart) return 'Your Tidy Pro isn’t available then anymore. Please choose another time.'
  if (await hasBookingConflict(admin, visit.tidy_pro_id, date, time, duration, visit.id)) {
    return 'Your Tidy Pro was just booked at that time. Please choose another time.'
  }
  return null
}

type PayInput = {
  bookingId: string
  paymentMethodId: string
  // Each attempt gets its own id, so a double tap charges once but a retry is a new try.
  attemptId: string
  // The customer paying: the total they were shown for this card, and a new date and
  // time when the visit was suspended. Left out for the scheduled job's own charge.
  customer?: { id: string; expectedCents: number; newSlot: { date: string; time: string } | null }
}

// Charges for an unpaid visit. On success the visit is an ordinary paid booking.
export async function payForVisit(
  admin: Admin,
  input: PayInput,
  now: Date = new Date()
): Promise<{ success: true; charged: number } | { error: string; paymentFailed?: true }> {
  let query = admin.from('bookings').select(UNPAID_VISIT_COLUMNS).eq('id', input.bookingId)
  if (input.customer) query = query.eq('user_id', input.customer.id)
  const { data } = await query.maybeSingle()
  const visit = data as UnpaidVisit | null
  if (!visit) return { error: 'This booking could not be found.' }
  if (!isUnpaidVisit(visit)) return { error: 'This booking is already paid. Please refresh the page.' }
  if (visit.status !== 'scheduled' || visit.amount_due == null) return { error: 'This booking can no longer be paid. Please refresh the page.' }

  const start = startOf(visit)
  if (start && now.getTime() >= start.getTime() && !input.customer?.newSlot) {
    return { error: 'This booking’s time has passed. Please choose a new date.' }
  }
  const suspended = visit.suspended_for_payment_at != null
  const newSlot = input.customer?.newSlot ?? null
  if (suspended && input.customer && !newSlot) return { error: 'Please choose a new date for this booking.' }
  if (newSlot) {
    const problem = await checkNewVisitTime(admin, visit, newSlot.date, newSlot.time, now)
    if (problem) return { error: problem }
  }

  const { data: savedPaymentMethod } = await admin
    .from('payment_methods')
    .select('stripe_payment_method_id')
    .eq('id', input.paymentMethodId)
    .eq('user_id', visit.user_id)
    .maybeSingle()
  if (!savedPaymentMethod?.stripe_payment_method_id) return { error: 'Payment method not found.' }

  let charge: number
  try {
    charge = await visitChargeForCard(Number(visit.amount_due), savedPaymentMethod.stripe_payment_method_id)
  } catch {
    return { error: 'We could not verify your card. Please try again.' }
  }
  if (input.customer && Math.round(charge * 100) !== input.customer.expectedCents) {
    return { error: 'The total for this card has changed. Please refresh the page and try again.' }
  }

  let paymentIntentId: string
  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: Math.round(charge * 100),
        currency: 'usd',
        customer: await getOrCreateStripeCustomerId(visit.user_id),
        payment_method: savedPaymentMethod.stripe_payment_method_id,
        off_session: true,
        confirm: true,
        metadata: {
          profile_id: visit.user_id,
          booking_id: visit.id,
          kind: 'recurring_visit',
          ...(visit.recurring_booking_id ? { recurring_booking_id: visit.recurring_booking_id } : {}),
        },
      },
      { idempotencyKey: `recurring-visit-payment-${visit.id}-${input.attemptId}` }
    )
    paymentIntentId = intent.id
  } catch (err) {
    const cardMessage = cardFailureMessage(err)
    if (cardMessage) return { error: cardMessage, paymentFailed: true }
    return { error: userFacingError(err, 'Payment failed. Please try again.') }
  }

  const addOnCharges = (await getPaidUpcharges(admin, visit.id)).reduce((sum, u) => sum + u.charge, 0)
  const { data: paid } = await admin
    .from('bookings')
    .update({
      stripe_payment_intent_id: paymentIntentId,
      // Tasks added to the visit were charged separately and are part of its total.
      total_customer_charge: Math.round((charge + addOnCharges) * 100) / 100,
      amount_due: null,
      payment_due_at: null,
      payment_failed_at: null,
      payment_error: null,
      suspended_for_payment_at: null,
      payment_attempted_at: now.toISOString(),
      ...(newSlot ? { scheduled_date: newSlot.date, scheduled_time: newSlot.time, reminder_sent_at: null, on_the_way_reminder_sent_at: null, customer_arrival_check_sent_at: null } : {}),
      tidy_pro_unread: true,
    })
    .eq('id', visit.id)
    .eq('status', 'scheduled')
    .not('payment_due_at', 'is', null)
    .is('stripe_payment_intent_id', null)
    .select('id')
  if (!paid?.length) {
    // Paid from another tab, or canceled, while the card was being charged.
    await stripe.refunds.create({ payment_intent: paymentIntentId }, { idempotencyKey: `refund-visit-race-${paymentIntentId}` }).catch((err) =>
      console.error('Could not refund duplicate visit payment', paymentIntentId, err)
    )
    return { error: 'This booking just changed, so your card has been refunded. Please refresh the page.' }
  }

  const date = newSlot?.date ?? visit.scheduled_date ?? ''
  if (input.customer) {
    await notifyCustomer(admin, visit.user_id, notifyRecurringVisitPaidConfirmation(charge, date, visit.id))
  } else {
    await notifyCustomer(admin, visit.user_id, notifyRecurringVisitCharged(charge, date, visit.id), { email: false })
  }
  // The Tidy Pro only hears about it if they'd been told something was wrong.
  if (visit.tidy_pro_id && (suspended || newSlot)) {
    await notifyTidyPro(admin, visit.tidy_pro_id, notifyRecurringVisitBackOn(await customerFirstName(admin, visit.user_id), date, newSlot != null, visit.id))
  }
  return { success: true, charged: charge }
}

// Ends a visit that was never paid. No money moved, so there's nothing to refund.
export async function cancelUnpaidVisit(admin: Admin, visit: UnpaidVisit): Promise<boolean> {
  const { data: cancelled } = await admin
    .from('bookings')
    .update({
      status: 'cancelled',
      cancelled_reason: UNPAID_VISIT_CANCELLED_REASON,
      payment_due_at: null,
      suspended_for_payment_at: null,
      user_unread: true,
      tidy_pro_unread: true,
    })
    .eq('id', visit.id)
    .eq('status', 'scheduled')
    .not('payment_due_at', 'is', null)
    .is('stripe_payment_intent_id', null)
    .select('id')
  if (!cancelled?.length) return false

  // Tasks added to it were paid for separately, so those are refunded.
  await dropPendingUpcharges(admin, visit.id)
  await refundUpchargesOfUnpaidVisit(admin, visit.id)

  const date = visit.scheduled_date ?? ''
  await notifyCustomer(admin, visit.user_id, notifyRecurringVisitCancelledUnpaid('USER', date))
  if (visit.tidy_pro_id) await notifyTidyPro(admin, visit.tidy_pro_id, notifyRecurringVisitCancelledUnpaid('TIDYPRO', date))
  return true
}

async function suspendVisit(admin: Admin, visit: UnpaidVisit, now: Date): Promise<void> {
  const { data: suspended } = await admin
    .from('bookings')
    .update({ suspended_for_payment_at: now.toISOString(), user_unread: true, tidy_pro_unread: true })
    .eq('id', visit.id)
    .eq('status', 'scheduled')
    .not('payment_due_at', 'is', null)
    .is('suspended_for_payment_at', null)
    .select('id')
  if (!suspended?.length) return

  const date = visit.scheduled_date ?? ''
  await notifyCustomer(admin, visit.user_id, notifyRecurringVisitSuspended(date, visit.id))
  if (visit.tidy_pro_id) await notifyTidyPro(admin, visit.tidy_pro_id, notifyRecurringVisitOnHold(await customerFirstName(admin, visit.user_id), date, visit.id))
}

// The scheduled job's own try, with the series' card.
async function chargeWithSeriesCard(admin: Admin, visit: UnpaidVisit, now: Date): Promise<'paid' | 'failed'> {
  const { data: series } = visit.recurring_booking_id
    ? await admin.from('recurring_bookings').select('payment_method_id').eq('id', visit.recurring_booking_id).maybeSingle()
    : { data: null }

  // Marked first, so a run that dies mid-charge isn't retried until the next day.
  await admin.from('bookings').update({ payment_attempted_at: now.toISOString() }).eq('id', visit.id)

  const result = series?.payment_method_id
    ? await payForVisit(admin, { bookingId: visit.id, paymentMethodId: series.payment_method_id, attemptId: now.toISOString().slice(0, 13) }, now)
    : { error: 'The card for your recurring booking was removed.' }
  if ('success' in result) return 'paid'

  const firstFailure = visit.payment_failed_at == null
  await admin
    .from('bookings')
    .update({ payment_failed_at: now.toISOString(), payment_error: result.error, user_unread: true })
    .eq('id', visit.id)
    .not('payment_due_at', 'is', null)
  const start = startOf(visit)
  if (start && shouldSuspendUnpaidVisit(start, now)) {
    await suspendVisit(admin, visit, now)
  } else if (firstFailure) {
    await notifyCustomer(admin, visit.user_id, notifyRecurringPaymentFailed(visit.scheduled_date ?? '', visit.id))
  }
  return 'failed'
}

// Run hourly. Charges visits that are due, retries failed ones, suspends ones still
// unpaid at the cutoff, and cancels ones still unpaid at their start. Each visit is
// handled on its own, so one failure doesn't hold up the rest.
export async function processRecurringVisitPayments(
  admin: Admin,
  now: Date = new Date()
): Promise<{ paid: number; failed: number; cancelled: number }> {
  const result = { paid: 0, failed: 0, cancelled: 0 }
  const { data } = await admin
    .from('bookings')
    .select(UNPAID_VISIT_COLUMNS)
    .eq('status', 'scheduled')
    .not('payment_due_at', 'is', null)
    .lte('payment_due_at', now.toISOString())
    .is('stripe_payment_intent_id', null)

  for (const visit of (data ?? []) as UnpaidVisit[]) {
    const start = startOf(visit)
    if (!start || !visit.payment_due_at) continue
    try {
      const action = unpaidVisitAction(
        {
          start,
          paymentDueAt: new Date(visit.payment_due_at),
          attemptedAt: visit.payment_attempted_at ? new Date(visit.payment_attempted_at) : null,
          suspended: visit.suspended_for_payment_at != null,
        },
        now
      )
      if (action === 'cancel') {
        if (await cancelUnpaidVisit(admin, visit)) result.cancelled++
      } else if (action === 'charge') {
        result[(await chargeWithSeriesCard(admin, visit, now)) === 'paid' ? 'paid' : 'failed']++
      }
    } catch (err) {
      console.error('Recurring visit payment failed', visit.id, err)
      result.failed++
    }
  }
  return result
}
