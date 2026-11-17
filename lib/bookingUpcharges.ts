import type { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import { getOrCreateStripeCustomerId } from '@/lib/stripe/customer'
import { stripePercentageForPaymentMethod } from '@/lib/stripe/cardFees'
import { cardFailureMessage } from '@/lib/stripe/paymentFailure'
import { cleanerPayoutForServicePrice, grossUpForStripeFee } from '@/lib/pricingRules'
import { notifyCustomer } from '@/lib/customerNotifications'
import {
  notifyBookingSuspendedForUpcharge,
  notifyUpchargePaid,
  notifyUpchargePaidConfirmation,
  notifyUpchargeRequested,
  notifyUpchargeWithdrawn,
  type NotificationPayload,
} from '@/lib/notifications'
import { canSendSms, sendSmsForPayload } from '@/lib/sms'
import { sendPushForPayload } from '@/lib/push'
import { userFacingError } from '@/lib/userFacingError'

type Admin = ReturnType<typeof createAdminClient>

// The Tydio team asking a customer to pay extra for a booking, from /admin/bookings.
// While it's unpaid the booking is suspended (bookings.suspended_for_upcharge_at): the
// Tidy Pro can't start or continue it, and the customer sees "Needs attention" until
// they pay in the app. The customer pays the amount plus Stripe's fee for their card,
// like a booking. Once paid it's part of the booking: its charge is added to the
// booking's total, its amount to the price and its share to the Tidy Pro's pay, so
// refunds and payouts are worked out on the whole booking, not each charge.
// See supabase/migrations/075_booking_upcharges.sql.

export const MAX_UPCHARGE = 1000
export const UPCHARGE_REASON_MAX_LENGTH = 500
export const UPCHARGE_HOLD_MESSAGE =
  "This booking is on hold until the customer pays an extra charge. We'll let you know when it's back on."

export type UpchargeInput = { amount: number; cleanerPay: number; reason: string }

function parseDollars(raw: string): number | null {
  const text = raw.replace(/[$,\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null
  return Number(text)
}

// cleanerPayText left blank gives the Tidy Pro their usual 80%.
export function parseUpchargeInput(amountText: string, cleanerPayText: string, reasonText: string): UpchargeInput | { error: string } {
  const amount = parseDollars(amountText)
  if (amount == null || amount <= 0) return { error: 'Enter the amount to charge, like 25 or 25.50.' }
  if (amount > MAX_UPCHARGE) return { error: `An upcharge can't be more than $${MAX_UPCHARGE}.` }

  let cleanerPay = cleanerPayoutForServicePrice(amount)
  if (cleanerPayText.trim() !== '') {
    const parsed = parseDollars(cleanerPayText)
    if (parsed == null) return { error: "Enter the Tidy Pro's share in dollars, or leave it blank for 80%." }
    if (parsed > amount) return { error: "The Tidy Pro's share can't be more than the upcharge." }
    cleanerPay = parsed
  }

  const reason = reasonText.trim()
  if (!reason) return { error: 'Give the customer a reason. They see it when they pay.' }
  if (reason.length > UPCHARGE_REASON_MAX_LENGTH) return { error: `Keep the reason under ${UPCHARGE_REASON_MAX_LENGTH} characters.` }

  return { amount, cleanerPay, reason }
}

type UpchargeableBooking = {
  status: string | null
  progress_status: string | null
  cleaner_marked_complete_at: string | null
  suspended_for_upcharge_at: string | null
  tidy_pro_id: string | null
}

// Only an accepted booking that isn't finished, so there's a Tidy Pro to put on hold.
export function upchargeBlockedReason(booking: UpchargeableBooking): string | null {
  if (booking.suspended_for_upcharge_at) return 'This booking already has an upcharge waiting to be paid.'
  if (booking.status !== 'scheduled' || !booking.tidy_pro_id) return 'Only accepted bookings can be upcharged.'
  if (booking.cleaner_marked_complete_at || booking.progress_status === 'done') return 'This booking is already complete.'
  return null
}

// What the customer's card is charged for an upcharge: the amount plus Stripe's fee.
export function upchargeCustomerCharge(amount: number, cardFeePercentage: number): number {
  return grossUpForStripeFee(amount, cardFeePercentage)
}

async function notifyTidyPro(admin: Admin, tidyProId: string, payload: NotificationPayload): Promise<void> {
  const { data: tidyPro } = await admin.from('tidypro_profiles').select('phone, sms_consent').eq('id', tidyProId).maybeSingle()
  if (canSendSms(tidyPro?.sms_consent ?? null, tidyPro?.phone ?? null)) {
    await sendSmsForPayload(tidyPro!.phone!, payload).catch((err) => console.error('Cleaner SMS failed', err))
  }
  await sendPushForPayload(tidyProId, payload).catch((err) => console.error('Cleaner push failed', err))
}

export async function requestUpcharge(admin: Admin, bookingId: string, input: UpchargeInput): Promise<{ success: true } | { error: string }> {
  const { data: booking } = await admin
    .from('bookings')
    .select('id, user_id, tidy_pro_id, status, progress_status, cleaner_marked_complete_at, suspended_for_upcharge_at')
    .eq('id', bookingId)
    .maybeSingle()
  if (!booking) return { error: 'Booking not found.' }
  const blocked = upchargeBlockedReason(booking)
  if (blocked) return { error: blocked }

  const { data: upcharge, error: insertError } = await admin
    .from('booking_upcharges')
    .insert({ booking_id: bookingId, amount: input.amount, cleaner_pay: input.cleanerPay, reason: input.reason })
    .select('id')
    .single()
  // The one-pending-per-booking index stops two admins upcharging at once.
  if (insertError || !upcharge) {
    return { error: insertError?.code === '23505' ? 'This booking already has an upcharge waiting to be paid.' : userFacingError(insertError) }
  }

  const { data: suspended, error } = await admin
    .from('bookings')
    .update({ suspended_for_upcharge_at: new Date().toISOString(), user_unread: true, tidy_pro_unread: true })
    .eq('id', bookingId)
    .eq('status', 'scheduled')
    .is('suspended_for_upcharge_at', null)
    .select('id')
  if (error || !suspended?.length) {
    await admin.from('booking_upcharges').delete().eq('id', upcharge.id)
    return { error: error ? userFacingError(error) : 'This booking just changed. Please refresh the page and try again.' }
  }

  await notifyCustomer(admin, booking.user_id, notifyUpchargeRequested(input.amount, bookingId))
  await notifyTidyPro(admin, booking.tidy_pro_id!, notifyBookingSuspendedForUpcharge(bookingId))
  return { success: true }
}

// The admin taking back an upcharge the customer hasn't paid. The booking is back on.
export async function withdrawUpcharge(admin: Admin, upchargeId: string): Promise<{ success: true } | { error: string }> {
  const { data: withdrawn, error } = await admin
    .from('booking_upcharges')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', upchargeId)
    .eq('status', 'pending')
    .select('booking_id')
    .maybeSingle()
  if (error) return { error: userFacingError(error) }
  if (!withdrawn) return { error: 'This upcharge has already been paid or removed. Please refresh the page.' }

  const { data: booking } = await admin
    .from('bookings')
    .update({ suspended_for_upcharge_at: null, user_unread: true, tidy_pro_unread: true })
    .eq('id', withdrawn.booking_id)
    .select('id, user_id, tidy_pro_id, status')
    .maybeSingle()

  if (booking?.status === 'scheduled') {
    await notifyCustomer(admin, booking.user_id, notifyUpchargeWithdrawn('USER', booking.id))
    if (booking.tidy_pro_id) await notifyTidyPro(admin, booking.tidy_pro_id, notifyUpchargeWithdrawn('TIDYPRO', booking.id))
  }
  return { success: true }
}

export type PendingUpcharge = { id: string; amount: number; reason: string; createdAt: string }

export async function getPendingUpcharge(admin: Admin, bookingId: string): Promise<PendingUpcharge | null> {
  const { data } = await admin
    .from('booking_upcharges')
    .select('id, amount, reason, created_at')
    .eq('booking_id', bookingId)
    .eq('status', 'pending')
    .maybeSingle()
  return data ? { id: data.id, amount: Number(data.amount), reason: data.reason, createdAt: data.created_at } : null
}

// The customer paying from the booking page. expectedCents is the total they were shown
// for the card they picked, so they're never charged a different amount. attemptId is
// made fresh for each tap of Pay, so a double tap charges once but a retry after a
// declined card is a new attempt.
export async function payUpcharge(
  admin: Admin,
  input: { customerId: string; upchargeId: string; paymentMethodId: string; expectedCents: number; attemptId: string }
): Promise<{ success: true; charged: number } | { error: string; paymentFailed?: true }> {
  const { data: upcharge } = await admin
    .from('booking_upcharges')
    .select('id, booking_id, amount, cleaner_pay, status')
    .eq('id', input.upchargeId)
    .maybeSingle()
  if (!upcharge) return { error: 'This charge could not be found.' }

  const { data: booking } = await admin
    .from('bookings')
    .select('id, user_id, tidy_pro_id, status, total_customer_charge, customer_subtotal, cleaner_pay')
    .eq('id', upcharge.booking_id)
    .eq('user_id', input.customerId)
    .maybeSingle()
  if (!booking) return { error: 'This charge could not be found.' }
  if (upcharge.status === 'paid') return { error: 'You’ve already paid this. Please refresh the page.' }
  if (upcharge.status !== 'pending' || booking.status !== 'scheduled') return { error: 'This charge is no longer due. Please refresh the page.' }

  const { data: savedPaymentMethod } = await admin
    .from('payment_methods')
    .select('stripe_payment_method_id')
    .eq('id', input.paymentMethodId)
    .eq('user_id', input.customerId)
    .maybeSingle()
  if (!savedPaymentMethod?.stripe_payment_method_id) return { error: 'Payment method not found.' }

  let charge: number
  try {
    charge = upchargeCustomerCharge(Number(upcharge.amount), await stripePercentageForPaymentMethod(savedPaymentMethod.stripe_payment_method_id))
  } catch {
    return { error: 'We could not verify your card. Please try again.' }
  }
  if (Math.round(charge * 100) !== input.expectedCents) return { error: 'The total for this card has changed. Please refresh the page and try again.' }

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
        metadata: { profile_id: input.customerId, booking_id: booking.id, upcharge_id: upcharge.id, kind: 'upcharge' },
      },
      { idempotencyKey: `upcharge-${upcharge.id}-${input.attemptId}` }
    )
    paymentIntentId = intent.id
  } catch (err) {
    const cardMessage = cardFailureMessage(err)
    if (cardMessage) return { error: cardMessage, paymentFailed: true }
    return { error: userFacingError(err, 'Payment failed. Please try again.') }
  }

  const { data: paid } = await admin
    .from('booking_upcharges')
    .update({ status: 'paid', paid_at: new Date().toISOString(), customer_charge: charge, stripe_payment_intent_id: paymentIntentId })
    .eq('id', upcharge.id)
    .eq('status', 'pending')
    .select('id')
  if (!paid?.length) {
    // Withdrawn, or paid from another tab, while the card was being charged.
    await stripe.refunds.create({ payment_intent: paymentIntentId }, { idempotencyKey: `refund-upcharge-race-${paymentIntentId}` }).catch((err) =>
      console.error('Could not refund duplicate upcharge payment', paymentIntentId, err)
    )
    return { error: 'This charge is no longer due, so your card has been refunded. Please refresh the page.' }
  }

  await addToBookingTotals(admin, booking, { charge, amount: Number(upcharge.amount), cleanerPay: Number(upcharge.cleaner_pay) })
  await admin
    .from('bookings')
    .update({ suspended_for_upcharge_at: null, tidy_pro_unread: true })
    .eq('id', booking.id)

  await notifyCustomer(admin, input.customerId, notifyUpchargePaidConfirmation(charge, booking.id))
  if (booking.tidy_pro_id) await notifyTidyPro(admin, booking.tidy_pro_id, notifyUpchargePaid(Number(upcharge.cleaner_pay), booking.id))
  return { success: true, charged: charge }
}

type BookingTotals = { id: string; total_customer_charge: number | null; customer_subtotal: number | null; cleaner_pay: number | null }

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

// Adds (or, with negative numbers, takes away) a paid upcharge from the booking's
// totals. Conditional on the totals it read, so a change in between (a late cancel
// setting cleaner_pay, say) is re-read rather than overwritten.
export async function addToBookingTotals(
  admin: Admin,
  booking: BookingTotals,
  delta: { charge: number; amount: number; cleanerPay: number }
): Promise<void> {
  let current: BookingTotals | null = booking
  for (let attempt = 0; attempt < 3 && current; attempt++) {
    let query = admin
      .from('bookings')
      .update({
        total_customer_charge: round2((current.total_customer_charge ?? 0) + delta.charge),
        customer_subtotal: round2((current.customer_subtotal ?? 0) + delta.amount),
        cleaner_pay: round2(Math.max(0, (current.cleaner_pay ?? 0) + delta.cleanerPay)),
      })
      .eq('id', current.id)
    query = current.total_customer_charge == null ? query.is('total_customer_charge', null) : query.eq('total_customer_charge', current.total_customer_charge)
    query = current.cleaner_pay == null ? query.is('cleaner_pay', null) : query.eq('cleaner_pay', current.cleaner_pay)
    const { data: updated } = await query.select('id')
    if (updated?.length) return
    const { data: fresh } = await admin.from('bookings').select('id, total_customer_charge, customer_subtotal, cleaner_pay').eq('id', booking.id).maybeSingle()
    current = fresh
  }
  console.error('Could not update booking totals for upcharge', booking.id, delta)
}

// taskAdditionId: tasks the customer added and the Tidy Pro accepted (lib/bookingTaskAdditions).
export type PaidUpcharge = { id: string; paymentIntentId: string; amount: number; charge: number; cleanerPay: number; taskAdditionId: string | null }

export async function getPaidUpcharges(admin: Admin, bookingId: string): Promise<PaidUpcharge[]> {
  const { data } = await admin
    .from('booking_upcharges')
    .select('id, stripe_payment_intent_id, amount, customer_charge, cleaner_pay, task_addition_id')
    .eq('booking_id', bookingId)
    .eq('status', 'paid')
    .order('paid_at', { ascending: true })
  return (data ?? [])
    .filter((u) => u.stripe_payment_intent_id)
    .map((u) => ({
      id: u.id,
      paymentIntentId: u.stripe_payment_intent_id!,
      amount: Number(u.amount),
      charge: Number(u.customer_charge ?? u.amount),
      cleanerPay: Number(u.cleaner_pay),
      taskAdditionId: u.task_addition_id ?? null,
    }))
}

// A recurring visit canceled before it was ever charged costs nothing, but tasks added
// to it were paid for up front. Those come back in full.
export async function refundUpchargesOfUnpaidVisit(admin: Admin, bookingId: string): Promise<void> {
  const upcharges = await getPaidUpcharges(admin, bookingId)
  const refunds: { upchargeId: string; refundId: string | null }[] = []
  for (const u of upcharges) {
    try {
      const refund = await stripe.refunds.create({ payment_intent: u.paymentIntentId }, { idempotencyKey: `refund-booking-full-${u.paymentIntentId}` })
      refunds.push({ upchargeId: u.id, refundId: refund.id })
    } catch (err) {
      console.error('Could not refund upcharge of canceled unpaid visit', u.id, err)
    }
  }
  await markUpchargesRefunded(admin, refunds)
}

// After a refund of the booking's total, records which part of it came off each upcharge.
export async function markUpchargesRefunded(admin: Admin, refunds: { upchargeId: string; refundId: string | null }[]): Promise<void> {
  const now = new Date().toISOString()
  await Promise.all(
    refunds
      .filter((r) => r.refundId)
      .map((r) => admin.from('booking_upcharges').update({ status: 'refunded', refunded_at: now, stripe_refund_id: r.refundId }).eq('id', r.upchargeId))
  )
}

// Once a booking is canceled, an upcharge it was still waiting on is no longer owed, and
// added tasks still waiting on the Tidy Pro are refunded and go back on the dashboard.
export async function dropPendingUpcharges(admin: Admin, bookingId: string): Promise<void> {
  // Imported here: lib/bookingTaskAdditions imports this module.
  const { endPendingTaskAdditions } = await import('@/lib/bookingTaskAdditions')
  await endPendingTaskAdditions(admin, bookingId).catch((err) => console.error('Ending pending task additions failed', bookingId, err))
  await admin
    .from('booking_upcharges')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('booking_id', bookingId)
    .eq('status', 'pending')
  await admin.from('bookings').update({ suspended_for_upcharge_at: null }).eq('id', bookingId)
}
