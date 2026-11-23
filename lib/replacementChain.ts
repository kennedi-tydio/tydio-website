// Replacing a Tidy Pro on a Standard / Deep Cleaning, one at a time.
//
// When a Tidy Pro declines (or cancels early), the customer picks ONE replacement and sees
// that Tidy Pro's own price first. Confirming sends the request and settles the price
// difference straight away: a replacement who costs more is charged to the card the
// booking was paid with (plus Stripe's fee for it, like any upcharge), and one who costs
// less has the difference refunded. If that replacement declines too, the payment comes
// back to the original booking and the customer picks again, from whatever they've paid
// by then. It keeps going until someone accepts, the customer cancels (from the picker),
// or the booking's cutoff an hour before it starts, when everything held is refunded
// (lib/bookingRequestGroups expireUnacceptedBookings).
//
// Each pick is a one-request "chain" group on the original booking (migration 099).
// Extra charges are booking_upcharges with replacement_difference set. They're held
// wherever the payment is: on the request while it's out, back on the original between
// picks, so every refund path finds them with the booking's own payment.
//
// Task bookings don't come here: they still go to up to 3 Tidy Pros at once, at the
// price already paid (app/dashboard/bookings/[bookingId]/replace/actions.ts).

import { stripe } from '@/lib/stripe'
import type { createAdminClient } from '@/lib/supabase/admin'
import { getOrCreateStripeCustomerId } from '@/lib/stripe/customer'
import { stripePercentageForPaymentMethod } from '@/lib/stripe/cardFees'
import { cardFailureMessage } from '@/lib/stripe/paymentFailure'
import { cleanerPayoutForServicePrice, netOfStripeFee, servicePriceForCleaner, stripePercentageForCardCountry, type PricingBreakdown } from '@/lib/pricingRules'
import { combineWithFullService } from '@/lib/bookingPricing'
import { buildSnapshot, checklistInsertRows, fullServiceLabel, quotesForTidyPros, readSnapshot, type FullServiceSnapshot } from '@/lib/fullServiceBooking'
import type { FullServiceSelection } from '@/lib/fullService'
import { computeIsTopTidyPro, haversineDistanceMiles, type CleanerMatch } from '@/lib/cleanerMatching'
import { promoDiscountAmount, type PromoDiscount } from '@/lib/promoCodes'
import { getPaidUpcharges, upchargeCustomerCharge } from '@/lib/bookingUpcharges'
import {
  REPLACEMENT_DIFFERENCE_REFUND,
  canRequestReplacements,
  expireBooking,
  getReplacementOptions,
  liveReplacementGroup,
} from '@/lib/bookingRequestGroups'
import { hasAcceptanceWindowClosed } from '@/lib/bookingTime'
import { notifyNewBookingRequest, notifyReplacementDeclined } from '@/lib/notifications'
import { notifyCustomer } from '@/lib/customerNotifications'
import { canSendSms, sendSmsForPayload } from '@/lib/sms'
import { sendPushForPayload } from '@/lib/push'
import { bookedTaskName } from '@/lib/laundry'
import { userFacingError } from '@/lib/userFacingError'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import type { TidyTask } from '@/app/dashboard/types'

type Admin = ReturnType<typeof createAdminClient>

export const REPLACEMENT_DIFFERENCE_REASON = 'Price difference for your replacement Tidy Pro'

// Stripe won't charge less than this. A smaller difference is Tydio's to cover.
const MIN_CHARGE = 0.5

export const CHAIN_BOOKING_COLUMNS =
  'id, user_id, tidy_pro_id, status, request_group_id, cancelled_reason, scheduled_date, scheduled_time, time_zone, scheduled_location, estimated_duration_minutes, task_list, full_service, pricing_version, pricing_breakdown, customer_subtotal, total_customer_charge, charged_price, cleaner_pay, promo_code_id, promo_discount, will_provide_supplies, pets, notes, entry_instructions, stripe_payment_intent_id, stripe_refund_id'

export type ChainBooking = {
  id: string
  user_id: string
  tidy_pro_id: string | null
  status: string | null
  request_group_id: string | null
  cancelled_reason: string | null
  scheduled_date: string | null
  scheduled_time: string | null
  time_zone: string | null
  scheduled_location: unknown
  estimated_duration_minutes: number | null
  task_list: unknown
  full_service: unknown
  pricing_version: string | null
  pricing_breakdown: unknown
  customer_subtotal: number | null
  total_customer_charge: number | null
  charged_price: number | null
  cleaner_pay: number | null
  promo_code_id: string | null
  promo_discount: number | null
  will_provide_supplies: boolean | null
  pets: string | null
  notes: string | null
  entry_instructions: string | null
  stripe_payment_intent_id: string | null
  stripe_refund_id: string | null
}

// Whether a declined booking is replaced one at a time (this file) or up to 3 at once.
export function replacesOneAtATime(booking: { full_service: unknown }): boolean {
  return readSnapshot(booking.full_service) != null
}

// What the customer has paid so far, and the card it was paid with.
export type ChainHolding = {
  // For the service, after any promo, before Stripe's fee: what the next price is compared to.
  held: number
  // Everything charged, fees included: what the customer sees as their total.
  heldTotal: number
  paymentMethodId: string | null
  cardFeePercentage: number
}

export type ReplacementPrice = {
  tidyProId: string
  snapshot: FullServiceSnapshot
  breakdown: PricingBreakdown
  servicePrice: number
  promoDiscount: number | null
  // What the customer pays for the service with this Tidy Pro.
  chargedPrice: number
  cleanerPay: number
  // chargedPrice minus what's held. Positive is charged, negative refunded. Zero when a
  // tiny extra is too small to charge.
  difference: number
  // What the card is charged now (the difference plus Stripe's fee), or refunded now.
  extraCharge: number
  refund: number
  // The customer's total for the booking once it's settled.
  newTotal: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function chainHolding(booking: ChainBooking): Promise<ChainHolding> {
  const intent = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id!)
  const paymentMethodId = typeof intent.payment_method === 'string' ? intent.payment_method : intent.payment_method?.id ?? null
  const cardFeePercentage = paymentMethodId
    ? await stripePercentageForPaymentMethod(paymentMethodId).catch(() => stripePercentageForCardCountry('US'))
    : stripePercentageForCardCountry('US')
  const heldTotal = booking.total_customer_charge ?? 0
  // Bookings from before charged_price was kept: worked back from the total, which can
  // be a cent off.
  const held = booking.charged_price != null ? Number(booking.charged_price) : netOfStripeFee(heldTotal, cardFeePercentage)
  return { held, heldTotal, paymentMethodId, cardFeePercentage }
}

// The booking's Tidy Tasks part, unchanged: only the cleaning is priced per Tidy Pro.
function taskPartOf(booking: ChainBooking, snapshot: FullServiceSnapshot): PricingBreakdown {
  const breakdown = booking.pricing_breakdown as PricingBreakdown & { task_subtotal?: number }
  const taskTotal = breakdown.task_subtotal ?? round2(breakdown.total_customer_charge - snapshot.customer_total)
  return { ...breakdown, total_customer_charge: taskTotal }
}

// What moving to a Tidy Pro at chargedPrice does to the customer's card. More is charged
// with Stripe's fee on top, like any upcharge; less is refunded as it is. An extra too
// small for Stripe to charge is Tydio's to cover.
export function settleDifference(
  chargedPrice: number,
  holding: Pick<ChainHolding, 'held' | 'heldTotal' | 'cardFeePercentage'>
): Pick<ReplacementPrice, 'difference' | 'extraCharge' | 'refund' | 'newTotal'> {
  let difference = round2(chargedPrice - holding.held)
  let extraCharge = difference > 0 ? upchargeCustomerCharge(difference, holding.cardFeePercentage) : 0
  if (extraCharge > 0 && extraCharge < MIN_CHARGE) {
    difference = 0
    extraCharge = 0
  }
  const refund = difference < 0 ? -difference : 0
  return { difference, extraCharge, refund, newTotal: round2(holding.heldTotal + extraCharge - refund) }
}

// Each Tidy Pro's price for this booking, worked out the way checkout would
// (lib/placeBooking): their own rates for the cleaning, the same Tidy Tasks, their Top
// Tidy Pro and distance surcharges, and the booking's promo on top. A Tidy Pro who can't
// price it is left out.
export async function priceReplacements(
  admin: Admin,
  booking: ChainBooking,
  tidyProIds: string[],
  holding: ChainHolding
): Promise<Map<string, ReplacementPrice>> {
  const prices = new Map<string, ReplacementPrice>()
  const snapshot = readSnapshot(booking.full_service)
  if (!snapshot || tidyProIds.length === 0) return prices

  const selection = { ...snapshot.selection, version: 1, step: 'notes' } as FullServiceSelection
  const location = booking.scheduled_location as ScheduledLocation | null
  const [quotes, { data: pros }, { data: promo }] = await Promise.all([
    quotesForTidyPros(admin, tidyProIds, selection, snapshot.square_footage),
    admin.from('tidypro_profiles').select('id, rating, total_accepted_bookings, latitude, longitude').in('id', tidyProIds),
    booking.promo_code_id
      ? admin.from('promo_codes').select('discount_type, discount_value').eq('id', booking.promo_code_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const taskPart = taskPartOf(booking, snapshot)
  for (const pro of pros ?? []) {
    const quote = quotes.get(pro.id)
    if (!quote) continue
    const fullService = buildSnapshot(selection, quote, { minutes: snapshot.duration_minutes, source: snapshot.duration_source })
    const breakdown = combineWithFullService(taskPart, quote, taskPart.total_task_minutes)
    const distanceMiles =
      location?.latitude != null && location?.longitude != null && pro.latitude != null && pro.longitude != null
        ? haversineDistanceMiles({ latitude: location.latitude, longitude: location.longitude }, { latitude: pro.latitude, longitude: pro.longitude })
        : null
    const servicePrice = servicePriceForCleaner(breakdown.total_customer_charge, {
      isTopTidyPro: computeIsTopTidyPro(Number(pro.rating ?? 0), pro.total_accepted_bookings ?? 0),
      distanceMiles,
    })
    // A promo carries over: worked out again on this price, still funded by Tydio.
    const promoDiscount = promo ? promoDiscountAmount(servicePrice, promo as PromoDiscount) : null
    const chargedPrice = round2(servicePrice - (promoDiscount ?? 0))

    prices.set(pro.id, {
      tidyProId: pro.id,
      snapshot: fullService,
      breakdown,
      servicePrice,
      promoDiscount,
      chargedPrice,
      // The full price, not the discounted one: a promo never comes out of the Tidy Pro's pay.
      cleanerPay: cleanerPayoutForServicePrice(servicePrice),
      ...settleDifference(chargedPrice, holding),
    })
  }
  return prices
}

export type ReplacementOption = CleanerMatch & { price: Pick<ReplacementPrice, 'chargedPrice' | 'difference' | 'extraCharge' | 'refund' | 'newTotal'> }

// The Tidy Pros the customer can pick from, each with their price, cheapest first.
export async function getChainReplacementOptions(
  admin: Admin,
  booking: ChainBooking
): Promise<{ options: ReplacementOption[]; holding: ChainHolding }> {
  const holding = await chainHolding(booking)
  const cleaners = await getReplacementOptions(admin, booking, { anyPrice: true })
  const prices = await priceReplacements(admin, booking, cleaners.map((c) => c.id), holding)
  const options = cleaners
    .filter((c) => prices.has(c.id))
    .map((c) => {
      const p = prices.get(c.id)!
      return { ...c, price: { chargedPrice: p.chargedPrice, difference: p.difference, extraCharge: p.extraCharge, refund: p.refund, newTotal: p.newTotal } }
    })
    .sort((a, b) => a.price.chargedPrice - b.price.chargedPrice)
  return { options, holding }
}

export async function loadChainBooking(admin: Admin, bookingId: string, customerId: string): Promise<ChainBooking | null> {
  const { data } = await admin.from('bookings').select(CHAIN_BOOKING_COLUMNS).eq('id', bookingId).eq('user_id', customerId).maybeSingle()
  return (data as ChainBooking | null) ?? null
}

// Refunds a cheaper replacement's difference: from the booking's own payment first, then
// from earlier price differences, newest first. Tagged so later refunds of the booking work
// from what's left (lib/bookingRequestGroups). Throws only if nothing could be refunded,
// so the request can be undone; a part refund is logged for the admin and kept.
async function refundDifference(admin: Admin, booking: ChainBooking, amount: number, key: string): Promise<void> {
  let leftCents = Math.round(amount * 100)
  const differences = (await getPaidUpcharges(admin, booking.id)).filter((u) => u.replacementDifference).reverse()
  const sources = [
    { paymentIntentId: booking.stripe_payment_intent_id!, upchargeId: null as string | null },
    ...differences.map((u) => ({ paymentIntentId: u.paymentIntentId, upchargeId: u.id as string | null })),
  ]

  let refundedAny = false
  for (const source of sources) {
    if (leftCents <= 0) break
    try {
      const intent = await stripe.paymentIntents.retrieve(source.paymentIntentId, { expand: ['latest_charge'] })
      const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null
      const remaining = intent.amount_received - (charge?.amount_refunded ?? 0)
      const cents = Math.min(leftCents, remaining)
      if (cents <= 0) continue
      const refund = await stripe.refunds.create(
        { payment_intent: source.paymentIntentId, amount: cents, metadata: { tydio_refund: REPLACEMENT_DIFFERENCE_REFUND } },
        { idempotencyKey: `${key}-${source.paymentIntentId}` }
      )
      refundedAny = true
      leftCents -= cents
      if (source.upchargeId && cents === remaining) {
        await admin
          .from('booking_upcharges')
          .update({ status: 'refunded', refunded_at: new Date().toISOString(), stripe_refund_id: refund.id })
          .eq('id', source.upchargeId)
      }
    } catch (err) {
      if (!refundedAny) throw err
      console.error('Replacement difference refund stopped partway', booking.id, err)
      return
    }
  }
  if (leftCents > 0) console.error('Replacement difference not fully refunded', booking.id, leftCents)
}

// The customer pressing Confirm request. expectedDifferenceCents is the difference they
// were shown, so they're never charged or refunded an amount they didn't see.
export async function sendChainReplacementRequest(
  admin: Admin,
  input: { customerId: string; bookingId: string; tidyProId: string; expectedDifferenceCents: number }
): Promise<{ success: true } | { error: string; paymentFailed?: true }> {
  const booking = await loadChainBooking(admin, input.bookingId, input.customerId)
  if (!booking) return { error: 'Booking not found.' }
  if (!replacesOneAtATime(booking)) return { error: 'This booking can’t be sent this way.' }

  const live = await liveReplacementGroup(admin, booking.id)
  if (!canRequestReplacements(booking, live != null) || booking.total_customer_charge == null) {
    return { error: 'This booking can no longer be sent to another Tidy Pro.' }
  }

  // Still free, still able to do all of it, and not blocked either way.
  const available = await getReplacementOptions(admin, booking, { anyPrice: true })
  const cleaner = available.find((c) => c.id === input.tidyProId)
  if (!cleaner) return { error: 'This Tidy Pro is no longer available. Please choose again.' }

  const holding = await chainHolding(booking)
  const price = (await priceReplacements(admin, booking, [cleaner.id], holding)).get(cleaner.id)
  if (!price) return { error: 'This Tidy Pro is no longer available. Please choose again.' }
  if (Math.round(price.difference * 100) !== input.expectedDifferenceCents) {
    return { error: 'This Tidy Pro’s price has changed. Please refresh the page to see it.' }
  }
  if (price.extraCharge > 0 && !holding.paymentMethodId) {
    return { error: 'We couldn’t find the card you booked with. Please contact us to choose this Tidy Pro.' }
  }

  // The partial unique index (one live group per booking) stops a double tap sending twice.
  const { data: group, error: groupError } = await admin
    .from('booking_request_groups')
    .insert({
      user_id: input.customerId,
      original_booking_id: booking.id,
      stripe_payment_intent_id: booking.stripe_payment_intent_id!,
      amount_cents: Math.round(price.newTotal * 100),
      chain: true,
    })
    .select('id')
    .single()
  if (groupError || !group) return { error: 'This request was already sent.' }

  const { data: request, error: insertError } = await admin
    .from('bookings')
    .insert({
      user_id: input.customerId,
      tidy_pro_id: cleaner.id,
      tidy_pro_name: cleaner.name,
      tidy_pro_photo_url: cleaner.photoUrl,
      scheduled_date: booking.scheduled_date,
      scheduled_time: booking.scheduled_time,
      time_zone: booking.time_zone,
      scheduled_location: booking.scheduled_location,
      estimated_duration_minutes: booking.estimated_duration_minutes,
      task_list: booking.task_list,
      full_service: price.snapshot,
      pricing_version: booking.pricing_version,
      pricing_breakdown: price.breakdown,
      customer_subtotal: price.breakdown.total_customer_charge,
      total_customer_charge: price.newTotal,
      charged_price: price.chargedPrice,
      cleaner_pay: price.cleanerPay,
      promo_code_id: booking.promo_code_id,
      promo_discount: price.promoDiscount,
      tip: 0,
      will_provide_supplies: booking.will_provide_supplies,
      pets: booking.pets,
      notes: booking.notes,
      entry_instructions: booking.entry_instructions,
      decision_status: 'pending',
      status: 'pending',
      tidy_pro_unread: true,
      stripe_payment_intent_id: booking.stripe_payment_intent_id,
      request_group_id: group.id,
    } as never)
    .select('id')
    .single()

  const undo = async (requestId: string | null) => {
    if (requestId) await admin.from('bookings').delete().eq('id', requestId).eq('status', 'pending')
    await admin.from('booking_request_groups').delete().eq('id', group.id)
  }
  if (insertError || !request) {
    await undo(null)
    return { error: userFacingError(insertError, 'Something went wrong sending your request. Please try again.') }
  }

  // The money moves last, so anything above that fails leaves it untouched.
  if (price.refund > 0) {
    try {
      await refundDifference(admin, booking, price.refund, `replacement-difference-refund-${group.id}`)
    } catch (err) {
      await undo(request.id)
      return { error: userFacingError(err, 'We couldn’t refund the difference. Please try again.') }
    }
  }

  // Earlier differences move with the payment, onto this request.
  await admin
    .from('booking_upcharges')
    .update({ booking_id: request.id })
    .eq('booking_id', booking.id)
    .eq('status', 'paid')
    .eq('replacement_difference', true)

  if (price.extraCharge > 0) {
    const charged = await chargeDifference(admin, input.customerId, request.id, holding.paymentMethodId!, price, group.id)
    if ('error' in charged) {
      // Put the earlier differences back before undoing the request.
      await admin.from('booking_upcharges').update({ booking_id: booking.id }).eq('booking_id', request.id).eq('status', 'paid')
      await undo(request.id)
      return charged
    }
  }

  // The original now records what's been paid, for the next pick if this one declines.
  await admin.from('bookings').update({ charged_price: price.chargedPrice, total_customer_charge: price.newTotal }).eq('id', booking.id)

  const tasks = (booking.task_list as TidyTask[] | null) ?? []
  await admin.from('booking_tasks').insert([
    ...checklistInsertRows(request.id, price.snapshot),
    ...tasks.map((task) => ({
      booking_id: request.id,
      task_name: bookedTaskName(task),
      task_category: task.room,
      task_icon: task.room.toLowerCase(),
      is_completed: false,
    })),
  ] as never)

  const { data: profile } = await admin.from('profiles').select('first_name').eq('id', input.customerId).maybeSingle()
  const payload = notifyNewBookingRequest(profile?.first_name ?? 'A customer', request.id, fullServiceLabel(price.snapshot))
  const { data: tidyPro } = await admin.from('tidypro_profiles').select('phone, sms_consent').eq('id', cleaner.id).maybeSingle()
  if (canSendSms(tidyPro?.sms_consent ?? null, tidyPro?.phone ?? null)) await sendSmsForPayload(tidyPro!.phone!, payload).catch(() => {})
  await sendPushForPayload(cleaner.id, payload).catch(() => {})

  return { success: true }
}

async function chargeDifference(
  admin: Admin,
  customerId: string,
  requestId: string,
  paymentMethodId: string,
  price: ReplacementPrice,
  groupId: string
): Promise<{ success: true } | { error: string; paymentFailed?: true }> {
  let paymentIntentId: string
  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: Math.round(price.extraCharge * 100),
        currency: 'usd',
        customer: await getOrCreateStripeCustomerId(customerId),
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        metadata: { profile_id: customerId, booking_id: requestId, kind: 'replacement_difference' },
      },
      { idempotencyKey: `replacement-difference-${groupId}` }
    )
    paymentIntentId = intent.id
  } catch (err) {
    const cardMessage = cardFailureMessage(err)
    if (cardMessage) return { error: `${cardMessage} Your card was not charged and the request wasn’t sent.`, paymentFailed: true }
    return { error: userFacingError(err, 'Payment failed. Please try again.') }
  }

  const { error } = await admin.from('booking_upcharges').insert({
    booking_id: requestId,
    amount: price.difference,
    cleaner_pay: 0,
    reason: REPLACEMENT_DIFFERENCE_REASON,
    status: 'paid',
    paid_at: new Date().toISOString(),
    customer_charge: price.extraCharge,
    stripe_payment_intent_id: paymentIntentId,
    replacement_difference: true,
  } as never)
  if (error) {
    // Charged but not recorded: hand it straight back rather than lose track of it.
    await stripe.refunds
      .create({ payment_intent: paymentIntentId }, { idempotencyKey: `refund-replacement-difference-${paymentIntentId}` })
      .catch((err) => console.error('Could not refund unrecorded replacement difference', paymentIntentId, err))
    return { error: 'Something went wrong sending your request, so your card has been refunded. Please try again.' }
  }
  return { success: true }
}

// The replacement in a chain round declined. The payment, and any price differences held
// with it, go back to the original booking for the customer to pick again, or, if the
// cutoff has passed, it's refunded now.
export async function returnChainPaymentToOriginal(admin: Admin, groupId: string): Promise<void> {
  const { data: closed } = await admin
    .from('booking_request_groups')
    .update({ status: 'closed' })
    .eq('id', groupId)
    .eq('status', 'open')
    .select('original_booking_id, user_id')
  const group = closed?.[0]
  if (!group?.original_booking_id) return

  const { data: requests } = await admin.from('bookings').select('id').eq('request_group_id', groupId)
  const requestIds = (requests ?? []).map((r) => r.id)
  if (requestIds.length) {
    await admin
      .from('booking_upcharges')
      .update({ booking_id: group.original_booking_id })
      .in('booking_id', requestIds)
      .eq('status', 'paid')
      .eq('replacement_difference', true)
  }

  const { data: original } = await admin
    .from('bookings')
    .update({ user_unread: true })
    .eq('id', group.original_booking_id)
    .select('id, user_id, tidy_pro_id, status, scheduled_date, scheduled_time, time_zone, stripe_payment_intent_id, stripe_refund_id, task_list')
    .maybeSingle()
  if (!original || original.stripe_refund_id) return

  if (hasAcceptanceWindowClosed(original.scheduled_date, original.scheduled_time, new Date(), original.time_zone)) {
    await expireBooking(admin, original)
    return
  }
  await notifyCustomer(admin, group.user_id, notifyReplacementDeclined(original.id))
}
