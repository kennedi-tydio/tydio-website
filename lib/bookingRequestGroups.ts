import { stripe } from '@/lib/stripe'
import { requiredServicesForTasks } from '@/lib/tidyProServices'
import type { createAdminClient } from '@/lib/supabase/admin'
import { findAvailableCleaners, type CleanerMatch } from '@/lib/cleanerMatching'
import { hasAcceptanceWindowClosed } from '@/lib/bookingTime'
import { halfRefund, lateCancelRefund, stripePercentageForCardCountry, stripeProcessingFee } from '@/lib/pricingRules'
import { withdrawPendingProposals } from '@/lib/bookingTimeProposals'
import {
  notifyAdminCancelledBooking,
  notifyAdminCancelledRequest,
  notifyAllRequestsDeclined,
  notifyBookingExpired,
  notifyReplacementsDeclined,
  notifyRequestExpired,
  notifyRequestFilled,
  type NotificationPayload,
} from '@/lib/notifications'
import { notifyCustomer } from '@/lib/customerNotifications'
import { emailShell, escapeHtml, sendEmail } from '@/lib/email'
import { canSendSms, sendSmsForPayload } from '@/lib/sms'
import { sendPushForPayload } from '@/lib/push'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import type { TidyTask } from '@/app/dashboard/types'
import { userFacingError } from '@/lib/userFacingError'
import { addToBookingTotals, dropPendingUpcharges, getPaidUpcharges, markUpchargesRefunded, refundUpchargesOfUnpaidVisit } from '@/lib/bookingUpcharges'
import { requiredServiceForFullService } from '@/lib/fullService'
import { quotesForTidyPros, readSnapshot } from '@/lib/fullServiceBooking'
import { withoutTidyProQuote } from '@/lib/taskQuotes'
import { adminCleanerPay, type AdminPayoutChoice } from '@/lib/payoutHold'

type Admin = ReturnType<typeof createAdminClient>

// The customer pays once, when they book, and that payment stays with Tydio until the
// booking resolves. If a cleaner declines a task booking, it simply carries over: the
// customer can ask up to 3 others, once, at the same price, and the first to accept gets
// the booking with no new charge. A Standard / Deep Cleaning instead goes to one
// replacement at a time, at their own price, again and again until someone accepts
// (lib/replacementChain). It's only refunded when the whole booking is canceled: by the
// customer, because everyone declined, or because nobody accepted by an hour before the
// start time. Every request in a group shares that one payment, so anything that
// would refund it has to go through this file.
//
// A cleaner canceling a booking they'd accepted is treated like a decline, as long as
// there's still time for someone else to accept (an hour before the start): the
// customer can choose replacements, including when the cleaner was a replacement
// themselves.
//
// A customer can also ask up to 3 cleaners when they first book. That's an "initial"
// group: it has no original booking, every request is a member, and primary_booking_id
// is the request to their first choice. If they all decline, the group hands the
// payment back to that request, which then works like any declined booking: the
// customer can choose replacements or cancel. Any later and the customer is refunded in full. A customer canceling an
// accepted booking within 2 hours of the start gets 50% back, and the cleaner is paid
// 80% of the rest.

export const MAX_REPLACEMENT_CLEANERS = 3
// When first booking, the customer's chosen Tidy Pro plus up to this many more, all
// asked at once. Optional: most bookings go to one cleaner.
export const MAX_EXTRA_BOOKING_CLEANERS = 2

// Why a booking was canceled, when it wasn't the customer's own doing.
export const REQUEST_FILLED_REASON = 'filled_by_other'
export const NO_RESPONSE_REASON = 'no_response'
export const ALL_DECLINED_REASON = 'all_declined'
export const CLEANER_CANCELLED_REASON = 'cleaner_cancelled'
export const LATE_CANCEL_REASON = 'late_cancel'
// Reported incidents the admin settles (see lib/bookingIncidents).
export const NO_ACCESS_REASON = 'no_access'
export const CLEANER_NO_SHOW_REASON = 'cleaner_no_show'
// The customer canceled, saying the Tidy Pro asked them to: refund held for the admin.
export const CLEANER_ASKED_CANCEL_REASON = 'cleaner_asked_cancel'
export const ADMIN_CANCELLED_REASON = 'admin_cancelled'

export function cleanerCancelledNote(reason: string | null): string | null {
  if (reason === REQUEST_FILLED_REASON) return 'Another Tidy Pro accepted this booking first'
  if (reason === NO_RESPONSE_REASON) return 'This request expired because it was not accepted at least an hour before the booking'
  if (reason === LATE_CANCEL_REASON) return 'The customer canceled less than 2 hours before the booking, so you’ll still be paid 50% of your pay for it'
  if (reason === NO_ACCESS_REASON) return 'You reported that you couldn’t get in. Our team will review it and email you about your pay'
  if (reason === CLEANER_NO_SHOW_REASON) return 'The customer reported that you didn’t arrive. Our team will review it and email you'
  if (reason === CLEANER_ASKED_CANCEL_REASON) return 'The customer canceled and said you asked them to. Our team will review it and email you'
  if (reason === ADMIN_CANCELLED_REASON) return 'The Tydio team canceled this booking'
  return null
}

export function customerCancelledNote(reason: string | null): string | null {
  if (reason === NO_RESPONSE_REASON) return 'No Tidy Pro accepted by an hour before the booking time, so it was canceled and your payment refunded, minus the nonrefundable Stripe and Trust & Support fee.'
  if (reason === ALL_DECLINED_REASON) return 'The Tidy Pros you asked declined, so your booking was canceled and your payment refunded, minus the nonrefundable Stripe and Trust & Support fee.'
  if (reason === CLEANER_CANCELLED_REASON) return 'Your Tidy Pro canceled less than an hour before the booking, so your payment has been refunded in full.'
  if (reason === NO_ACCESS_REASON) return 'Your Tidy Pro couldn’t get into your home, so the booking was canceled. Our team will review it and email you about any refund.'
  if (reason === CLEANER_NO_SHOW_REASON) return 'You reported that your Tidy Pro didn’t arrive, so the booking was canceled. Our team will review it and email you about your refund.'
  if (reason === CLEANER_ASKED_CANCEL_REASON) return 'You canceled because your Tidy Pro asked you to. Our team will check with them and email you about your refund.'
  if (reason === ADMIN_CANCELLED_REASON) return 'The Tydio team canceled this booking. We’ve let you know about any refund by email.'
  return null
}

// Requests within a group that didn't work out are bookkeeping, not bookings. The
// customer follows the outcome on their original booking instead. One that was accepted
// is a real booking, even if its cleaner later canceled.
export function isHiddenGroupRequest(booking: {
  status: string | null
  decision_status: string | null
  request_group_id: string | null
}): boolean {
  return (
    booking.request_group_id != null &&
    booking.decision_status !== 'accepted' &&
    (booking.status === 'cancelled' || booking.status === 'declined')
  )
}

// A declined booking whose payment is still held for replacements, whether its cleaner
// declined the request or canceled after accepting it. Requests in a group that are
// declined are otherwise settled by the group.
export function isAwaitingReplacements(booking: {
  status: string | null
  request_group_id: string | null
  cancelled_reason?: string | null
}): boolean {
  return (
    booking.status === 'declined' &&
    (booking.request_group_id == null || booking.cancelled_reason === CLEANER_CANCELLED_REASON)
  )
}

export function validateReplacementSelection(cleanerIds: string[], availableIds: string[]): string | null {
  if (cleanerIds.length === 0) return 'Choose at least one Tidy Pro.'
  if (cleanerIds.length > MAX_REPLACEMENT_CLEANERS) return `Choose up to ${MAX_REPLACEMENT_CLEANERS} Tidy Pros.`
  if (new Set(cleanerIds).size !== cleanerIds.length) return 'Choose each Tidy Pro only once.'
  if (cleanerIds.some((id) => !availableIds.includes(id))) {
    return 'One of those Tidy Pros is no longer available. Please choose again.'
  }
  return null
}

export function validateExtraCleanerSelection(cleanerIds: string[], primaryId: string, availableIds: string[]): string | null {
  if (cleanerIds.length > MAX_EXTRA_BOOKING_CLEANERS) return `Choose up to ${MAX_EXTRA_BOOKING_CLEANERS + 1} Tidy Pros in total.`
  if (new Set(cleanerIds).size !== cleanerIds.length || cleanerIds.includes(primaryId)) return 'Choose each Tidy Pro only once.'
  if (cleanerIds.some((id) => !availableIds.includes(id))) {
    return 'One of the other Tidy Pros you chose is no longer available. Please choose again.'
  }
  return null
}

// The replacement round under way for a declined booking (waiting on a Tidy Pro), or the
// one that filled it. A Standard / Deep Cleaning asks one replacement at a time, so it can
// have several earlier rounds, all closed; at most one is ever live (migration 099).
export async function liveReplacementGroup(admin: Admin, originalBookingId: string): Promise<{ id: string; status: string } | null> {
  const { data } = await admin
    .from('booking_request_groups')
    .select('id, status')
    .eq('original_booking_id', originalBookingId)
    .in('status', ['open', 'filled'])
    .maybeSingle()
  return data ?? null
}

// The original bookings among these with a live replacement round.
export async function bookingsBeingReplaced(admin: Admin, originalBookingIds: string[]): Promise<Set<string>> {
  if (originalBookingIds.length === 0) return new Set()
  const { data } = await admin
    .from('booking_request_groups')
    .select('original_booking_id')
    .in('original_booking_id', originalBookingIds)
    .in('status', ['open', 'filled'])
  return new Set((data ?? []).map((g) => g.original_booking_id).filter((id): id is string => id != null))
}

// A declined booking whose payment is still held, with no replacement round under way,
// not itself one of the requests in a group unless its cleaner canceled after accepting,
// and not past its cutoff. A task booking gets one round: if everyone in it declines, the
// booking is canceled and refunded, so it's never back here. A Standard / Deep Cleaning
// comes back here each time a replacement declines (lib/replacementChain).
export function canRequestReplacements(
  booking: {
    status: string | null
    request_group_id: string | null
    cancelled_reason?: string | null
    scheduled_date: string | null
    scheduled_time: string | null
    stripe_payment_intent_id: string | null
    stripe_refund_id: string | null
    time_zone?: string | null
  },
  hasExistingGroup: boolean,
  now: Date = new Date()
): boolean {
  return (
    isAwaitingReplacements(booking) &&
    !hasExistingGroup &&
    booking.stripe_payment_intent_id != null &&
    booking.stripe_refund_id == null &&
    !hasAcceptanceWindowClosed(booking.scheduled_date, booking.scheduled_time, now, booking.time_zone ?? null)
  )
}

export async function getReplacementOptions(
  admin: Admin,
  booking: {
    // When given, cleaners who were already asked alongside it are left out too.
    id?: string
    // The customer. Tidy Pros blocked either way (lib/userBlocks) are left out.
    user_id?: string | null
    tidy_pro_id: string | null
    scheduled_location: unknown
    scheduled_date: string | null
    scheduled_time: string | null
    estimated_duration_minutes: number | null
    task_list: unknown
    // A booking's Standard / Deep Cleaning snapshot (lib/fullServiceBooking).
    full_service?: unknown
  },
  // A replacement chain prices each Tidy Pro on their own, charging or refunding the
  // difference (lib/replacementChain), so nobody is left out for costing more.
  { anyPrice = false }: { anyPrice?: boolean } = {}
): Promise<CleanerMatch[]> {
  const location = booking.scheduled_location as ScheduledLocation | null
  if (location?.latitude == null || location?.longitude == null || !booking.scheduled_date) return []
  const fullService = readSnapshot(booking.full_service)

  const cleaners = await findAvailableCleaners(
    {
      latitude: location.latitude,
      longitude: location.longitude,
      date: booking.scheduled_date,
      time: booking.scheduled_time?.slice(0, 5) ?? null,
      durationMinutes: booking.estimated_duration_minutes ?? 60,
      // A replacement has to do everything the original booking asked for.
      requiredServices: [
        ...requiredServicesForTasks((booking.task_list as TidyTask[] | null) ?? []),
        ...(fullService ? [requiredServiceForFullService(fullService.selection.type)] : []),
      ],
      customerId: booking.user_id ?? null,
    },
    admin
  )

  const alreadyAsked = new Set([booking.tidy_pro_id, ...(booking.id ? await cleanersAskedWith(admin, booking.id) : [])])
  const others = cleaners.filter((c) => !alreadyAsked.has(c.id))
  if (!fullService) return others

  // Standard / Deep Cleaning carries over at the price already paid, so only
  // Tidy Pros who'd charge that much or less for it (with their own rates) are
  // offered: none of them is paid below their own price.
  const quotes = await quotesForTidyPros(
    admin,
    others.map((c) => c.id),
    { ...fullService.selection, version: 1, step: 'notes' },
    fullService.square_footage
  )
  return others.filter((c) => {
    const quote = quotes.get(c.id)
    return quote != null && (anyPrice || quote.customer_total <= fullService.customer_total)
  })
}

// The other cleaners a booking was already sent to, who all declined before it came back
// to the customer: those asked alongside it when it was first booked, and each earlier
// replacement in a chain.
async function cleanersAskedWith(admin: Admin, bookingId: string): Promise<string[]> {
  const { data: groups } = await admin
    .from('booking_request_groups')
    .select('id')
    .or(`primary_booking_id.eq.${bookingId},original_booking_id.eq.${bookingId}`)
  if (!groups?.length) return []
  const { data: requests } = await admin.from('bookings').select('tidy_pro_id').in('request_group_id', groups.map((g) => g.id))
  return (requests ?? []).map((r) => r.tidy_pro_id).filter((id): id is string => id != null)
}

async function notifyCleaner(admin: Admin, id: string, payload: NotificationPayload): Promise<void> {
  const { data: person } = await admin.from('tidypro_profiles').select('phone, sms_consent').eq('id', id).maybeSingle()
  if (canSendSms(person?.sms_consent ?? null, person?.phone ?? null)) {
    await sendSmsForPayload(person!.phone!, payload).catch(() => {})
  }
  await sendPushForPayload(id, payload).catch(() => {})
}

// A replacement who costs less than what the customer had paid: the difference was
// refunded from this payment when they confirmed (lib/replacementChain). Those refunds are
// tagged with this, so a later refund of the booking works from what's left.
export const REPLACEMENT_DIFFERENCE_REFUND = 'replacement_difference'

type RefundKind = 'minus_fee' | 'full' | 'late' | 'half'

// What's left of a payment after any replacement-difference refunds, or null when there
// were none (almost every booking), in which case refunds work exactly as they always have.
// A refund of `kind` already made after them is returned as `done`, so a retry never
// refunds twice: its idempotency key can't protect it, since the amount depends on what's
// been refunded so far.
async function afterDifferenceRefunds(
  intent: { id: string; amount_received: number; latest_charge?: unknown },
  kind: RefundKind
): Promise<null | { done: string } | { baseCents: number; remainingCents: number; lastRefundId: string | null }> {
  const charge = typeof intent.latest_charge === 'object' && intent.latest_charge ? (intent.latest_charge as { amount_refunded?: number }) : null
  // Every caller retrieves the payment with its latest charge expanded.
  const refundedCents = charge?.amount_refunded ?? 0
  if (!refundedCents) return null

  const refunds = await stripe.refunds.list({ payment_intent: intent.id, limit: 100 })
  const live = refunds.data.filter((r) => r.status !== 'failed' && r.status !== 'canceled')
  const differences = live.filter((r) => r.metadata?.tydio_refund === REPLACEMENT_DIFFERENCE_REFUND)
  if (differences.length === 0) return null
  const done = live.find((r) => r.metadata?.tydio_refund === kind)
  if (done) return { done: done.id }

  const differenceCents = differences.reduce((sum, r) => sum + r.amount, 0)
  return {
    baseCents: intent.amount_received - differenceCents,
    remainingCents: intent.amount_received - refundedCents,
    lastRefundId: live[0]?.id ?? null,
  }
}

// Refunds `cents` (capped at what's left) after difference refunds, or hands back the last
// refund when there's nothing left to refund, so the booking still records one.
async function refundAfterDifferences(
  paymentIntentId: string,
  kind: RefundKind,
  plan: { remainingCents: number; lastRefundId: string | null },
  cents: number
): Promise<string> {
  const amount = Math.min(cents, plan.remainingCents)
  if (amount <= 0 && plan.lastRefundId) return plan.lastRefundId
  const refund = await stripe.refunds.create(
    { payment_intent: paymentIntentId, amount, metadata: { tydio_refund: kind } },
    { idempotencyKey: `refund-booking-${kind}-after-differences-${paymentIntentId}` }
  )
  return refund.id
}

// Refunds what the customer paid minus the fee Stripe actually took on this charge, and
// minus the Trust & Support fee when the payment carried one (its metadata says so;
// payments made before it existed don't). Stripe's record can take a moment to appear
// right after a charge, so until it does, its fee is worked out from the card's country. Keyed to the payment, so however many paths reach
// this, it's only refunded once.
export async function refundBookingPayment(paymentIntentId: string): Promise<string> {
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge.balance_transaction'] })
  const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null
  const balance = charge && typeof charge.balance_transaction === 'object' ? charge.balance_transaction : null
  const percentage = stripePercentageForCardCountry(charge?.payment_method_details?.card?.country)
  const stripeFeeCents = balance?.fee ?? Math.round(stripeProcessingFee(intent.amount_received / 100, percentage) * 100)
  const trustSupportFee = Number(intent.metadata?.trust_support_fee)
  const feeCents = stripeFeeCents + (Number.isFinite(trustSupportFee) && trustSupportFee > 0 ? Math.round(trustSupportFee * 100) : 0)

  const plan = await afterDifferenceRefunds(intent, 'minus_fee')
  if (plan && 'done' in plan) return plan.done
  if (plan) return refundAfterDifferences(paymentIntentId, 'minus_fee', plan, plan.baseCents - feeCents)

  const refund = await stripe.refunds.create(
    { payment_intent: paymentIntentId, amount: intent.amount_received - feeCents },
    { idempotencyKey: `refund-booking-${paymentIntentId}` }
  )
  return refund.id
}

// For a cleaner canceling at the last minute: everything comes back, Stripe's fee too,
// which Tydio absorbs.
export async function refundBookingInFull(paymentIntentId: string): Promise<string> {
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] })
  const plan = await afterDifferenceRefunds(intent, 'full')
  if (plan && 'done' in plan) return plan.done
  if (plan) return refundAfterDifferences(paymentIntentId, 'full', plan, plan.remainingCents)

  const refund = await stripe.refunds.create(
    { payment_intent: paymentIntentId },
    { idempotencyKey: `refund-booking-full-${paymentIntentId}` }
  )
  return refund.id
}

// For a customer canceling late: 50% of what they paid comes back.
export async function refundLateCancellation(paymentIntentId: string): Promise<string> {
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] })
  const plan = await afterDifferenceRefunds(intent, 'late')
  if (plan && 'done' in plan) return plan.done
  if (plan) return refundAfterDifferences(paymentIntentId, 'late', plan, Math.round(lateCancelRefund(plan.baseCents / 100) * 100))

  const refund = await stripe.refunds.create(
    { payment_intent: paymentIntentId, amount: Math.round(lateCancelRefund(intent.amount_received / 100) * 100) },
    { idempotencyKey: `refund-booking-late-${paymentIntentId}` }
  )
  return refund.id
}

// The admin's half refund (an admin cancellation or a settled incident): half of what
// they paid comes back.
export async function refundHalf(paymentIntentId: string): Promise<string> {
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] })
  const plan = await afterDifferenceRefunds(intent, 'half')
  if (plan && 'done' in plan) return plan.done
  if (plan) return refundAfterDifferences(paymentIntentId, 'half', plan, Math.round(halfRefund(plan.baseCents / 100) * 100))

  const refund = await stripe.refunds.create(
    { payment_intent: paymentIntentId, amount: Math.round(halfRefund(intent.amount_received / 100) * 100) },
    { idempotencyKey: `refund-booking-half-${paymentIntentId}` }
  )
  return refund.id
}

// Puts a canceled booking's tasks back on the customer's list, unselected and ready to
// choose again. The list lives on their most recent draft, which booking removes, so
// this may need to start a new one.
export async function restoreBookingTasks(admin: Admin, userId: string, tasks: TidyTask[]): Promise<void> {
  if (tasks.length === 0) return
  // A Tidy Pro's quoted price was for that booking only: re-booked, it's quoted again.
  const restored = tasks.map((task) => ({ ...withoutTidyProQuote(task), completed: false }))

  const { data: draft } = await admin
    .from('booking_drafts')
    .select('id, task_list')
    .eq('customer_user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!draft) {
    await admin.from('booking_drafts').insert({ customer_user_id: userId, task_list: restored as never, last_step_reached: 1 })
    return
  }

  const existing = (draft.task_list as TidyTask[] | null) ?? []
  const existingIds = new Set(existing.map((t) => t.id))
  const merged = [...existing, ...restored.filter((t) => !existingIds.has(t.id))]
  await admin.from('booking_drafts').update({ task_list: merged as never }).eq('id', draft.id)
}

export async function cancelOtherRequests(admin: Admin, groupId: string, acceptedBookingId: string): Promise<void> {
  const { data: others } = await admin
    .from('bookings')
    .update({ status: 'cancelled', cancelled_reason: REQUEST_FILLED_REASON, tidy_pro_unread: true })
    .eq('request_group_id', groupId)
    .eq('status', 'pending')
    .neq('id', acceptedBookingId)
    .select('id, tidy_pro_id')

  await Promise.all(
    (others ?? [])
      .filter((b): b is { id: string; tidy_pro_id: string } => b.tidy_pro_id != null)
      .map((b) => notifyCleaner(admin, b.tidy_pro_id, notifyRequestFilled(b.id)))
  )
}

// Ends a group and everything hanging off it: refund, requests, the original booking,
// and the tasks. Closing first means a cleaner accepting at the same moment can't win
// after this has started, or the reverse. If the refund fails the group reopens, so the
// money is never left stranded and the scheduled job can try again.
async function closeAndRefundGroup(
  admin: Admin,
  groupId: string,
  reason: string | null,
  refund: (paymentIntentId: string) => Promise<string | null> = refundBookingPayment,
  // For the upcharges held with it. Defaults to the same refund as the payment.
  upchargeRefund: (paymentIntentId: string) => Promise<string | null> = refund
): Promise<{ closed: true; userId: string; requests: { id: string; tidy_pro_id: string | null }[] } | { closed: false; error: string }> {
  const { data: closed } = await admin
    .from('booking_request_groups')
    .update({ status: 'closed' })
    .eq('id', groupId)
    .eq('status', 'open')
    .select('user_id, stripe_payment_intent_id, original_booking_id, primary_booking_id')

  const group = closed?.[0]
  if (!group) return { closed: false, error: 'A Tidy Pro just accepted this booking. Please refresh the page.' }

  let refundId: string | null
  try {
    refundId = await refund(group.stripe_payment_intent_id)
  } catch (err) {
    console.error('Failed to refund booking group', groupId, err)
    await admin.from('booking_request_groups').update({ status: 'open' }).eq('id', groupId)
    return { closed: false, error: 'We could not refund this booking. Please try again.' }
  }

  const { data: requests } = await admin
    .from('bookings')
    .update({ status: 'cancelled', cancelled_reason: reason, tidy_pro_unread: true })
    .eq('request_group_id', groupId)
    .eq('status', 'pending')
    .select('id, tidy_pro_id')

  // A replacement chain's price differences are held on whichever booking holds the
  // payment (lib/replacementChain): the pending request, or the original between picks.
  await refundHeldUpcharges(admin, [...(requests ?? []).map((r) => r.id), (group.original_booking_id ?? group.primary_booking_id)!], upchargeRefund)

  // An initial group has no original booking, so the outcome goes on the request to the
  // customer's first choice, taken out of the group so it stays visible to them.
  const isInitial = group.original_booking_id == null
  const { data: original } = await admin
    .from('bookings')
    .update({
      status: 'cancelled',
      cancelled_reason: reason,
      stripe_refund_id: refundId,
      user_unread: reason != null,
      ...(isInitial ? { request_group_id: null } : {}),
    })
    .eq('id', (group.original_booking_id ?? group.primary_booking_id)!)
    .select('task_list')
    .maybeSingle()

  await restoreBookingTasks(admin, group.user_id, (original?.task_list as TidyTask[] | null) ?? [])

  return { closed: true, userId: group.user_id, requests: requests ?? [] }
}

// Refunds the paid upcharges on these bookings with the same refund as the booking's own
// payment. The payment itself is already refunded by now, so a failure here is logged for
// the admin rather than undoing that.
async function refundHeldUpcharges(admin: Admin, bookingIds: string[], refund: (paymentIntentId: string) => Promise<string | null>): Promise<void> {
  for (const bookingId of bookingIds) {
    const upcharges = await getPaidUpcharges(admin, bookingId)
    const refunds: { upchargeId: string; refundId: string | null }[] = []
    for (const u of upcharges) {
      try {
        refunds.push({ upchargeId: u.id, refundId: await refund(u.paymentIntentId) })
      } catch (err) {
        console.error('Could not refund upcharge of a canceled booking', u.id, err)
      }
    }
    await markUpchargesRefunded(admin, refunds)
  }
}

// Called after a cleaner in the group declines. Ends the booking once nobody's left.
export async function closeGroupIfNoRequestsLeft(admin: Admin, groupId: string): Promise<void> {
  const { count } = await admin
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('request_group_id', groupId)
    .eq('status', 'pending')
  if (count !== 0) return

  // Everyone the customer first asked declined. Rather than refund, the payment goes back
  // to the request to their first choice, so they can choose replacements, the same as
  // when a single cleaner declines.
  const { data: group } = await admin
    .from('booking_request_groups')
    .select('original_booking_id, primary_booking_id, user_id, chain')
    .eq('id', groupId)
    .maybeSingle()

  // One replacement in a chain declined: the payment goes back to the original booking,
  // and the customer picks someone else or cancels.
  if (group?.chain && group.original_booking_id) {
    // Imported here: lib/replacementChain imports this module.
    const { returnChainPaymentToOriginal } = await import('@/lib/replacementChain')
    await returnChainPaymentToOriginal(admin, groupId)
    return
  }
  if (group && group.original_booking_id == null && group.primary_booking_id) {
    const { data: closed } = await admin
      .from('booking_request_groups')
      .update({ status: 'closed' })
      .eq('id', groupId)
      .eq('status', 'open')
      .select('id')
    if (!closed?.length) return
    const { data: primary } = await admin
      .from('bookings')
      .update({ status: 'declined', decision_status: 'declined', request_group_id: null, user_unread: true })
      .eq('id', group.primary_booking_id)
      .select('full_service')
      .maybeSingle()
    await notifyCustomer(admin, group.user_id, notifyAllRequestsDeclined(group.primary_booking_id, primary?.full_service != null))
    return
  }

  const result = await closeAndRefundGroup(admin, groupId, ALL_DECLINED_REASON)
  if (result.closed) await notifyCustomer(admin, result.userId, notifyReplacementsDeclined())
}

// A customer canceling is canceling the booking, not one cleaner, so every request goes.
// Returns which cleaners to tell.
export async function cancelGroupForCustomer(admin: Admin, groupId: string): Promise<{ tidyProIds: string[] } | { error: string }> {
  const result = await closeAndRefundGroup(admin, groupId, null)
  if (!result.closed) return { error: result.error }
  return { tidyProIds: result.requests.map((b) => b.tidy_pro_id).filter((id): id is string => id != null) }
}

export type AdminRefund = 'full' | 'minus_fee' | 'half' | 'custom' | 'none'

export const ADMIN_REFUND_LABELS: Record<AdminRefund, string> = {
  full: 'Full refund, Stripe fee included',
  minus_fee: 'Full refund minus Stripe and Trust & Support fee',
  half: 'Half refund (50%)',
  custom: 'Custom amount',
  none: 'No refund',
}

// An amount the admin typed, in dollars: more than nothing, and no more than was paid.
export function validateCustomRefund(amount: number | null | undefined, paid: number | null): string | null {
  if (amount == null || !Number.isFinite(amount) || Math.round(amount * 100) <= 0) return 'Enter a refund amount greater than $0.'
  if (paid != null && Math.round(amount * 100) > Math.round(paid * 100)) {
    return `The refund can’t be more than the $${paid.toFixed(2)} the customer paid.`
  }
  return null
}

// Keyed to the payment and amount, so a retry after a refresh can't refund twice.
export async function refundCustomAmount(paymentIntentId: string, amount: number): Promise<string> {
  const cents = Math.round(amount * 100)
  const refund = await stripe.refunds.create(
    { payment_intent: paymentIntentId, amount: cents },
    { idempotencyKey: `refund-booking-custom-${paymentIntentId}-${cents}` }
  )
  return refund.id
}

export type BookingRefundPolicy = 'full' | 'minus_fee' | 'half' | 'late_cancel' | 'none' | { custom: number }

const POLICY_REFUNDS: Record<'full' | 'minus_fee' | 'half' | 'late_cancel', (paymentIntentId: string) => Promise<string>> = {
  full: refundBookingInFull,
  minus_fee: refundBookingPayment,
  half: refundHalf,
  late_cancel: refundLateCancellation,
}

// Refunds a booking on its whole total: its own charge plus any upcharges the customer
// paid, which are part of the booking (see lib/bookingUpcharges). Full, minus the fee,
// half and late-cancel are shares of each charge, so they add up to the same share of the total. A
// custom amount comes off the booking's charge first, then each upcharge in turn.
// Each refund is keyed to its payment, so a retry after a failure never refunds twice.
// Returns the booking charge's refund id, the upcharges' refund ids, and the total
// refunded (null if it couldn't be looked up).
export async function refundBookingTotal(
  admin: Admin,
  booking: { id: string; stripe_payment_intent_id: string | null },
  policy: BookingRefundPolicy
): Promise<{ refundId: string | null; refunded: number | null }> {
  if (policy === 'none') return { refundId: null, refunded: 0 }

  const upcharges = await getPaidUpcharges(admin, booking.id)
  const charges = [
    ...(booking.stripe_payment_intent_id ? [{ paymentIntentId: booking.stripe_payment_intent_id, upchargeId: null as string | null }] : []),
    ...upcharges.map((u) => ({ paymentIntentId: u.paymentIntentId, upchargeId: u.id as string | null })),
  ]

  const refundIds: (string | null)[] = []
  if (typeof policy === 'object') {
    let remainingCents = Math.round(policy.custom * 100)
    for (const charge of charges) {
      if (remainingCents <= 0) {
        refundIds.push(null)
        continue
      }
      const intent = await stripe.paymentIntents.retrieve(charge.paymentIntentId, { expand: ['latest_charge'] })
      const latest = typeof intent.latest_charge === 'object' ? intent.latest_charge : null
      const refundableCents = intent.amount_received - (latest?.amount_refunded ?? 0)
      const cents = Math.min(remainingCents, refundableCents)
      refundIds.push(cents > 0 ? await refundCustomAmount(charge.paymentIntentId, cents / 100) : null)
      remainingCents -= Math.max(0, cents)
    }
  } else {
    for (const charge of charges) refundIds.push(await POLICY_REFUNDS[policy](charge.paymentIntentId))
  }

  await markUpchargesRefunded(
    admin,
    charges.flatMap((c, i) => (c.upchargeId ? [{ upchargeId: c.upchargeId, refundId: refundIds[i] }] : []))
  )

  const amounts = await Promise.all(refundIds.map((id) => refundedAmount(id)))
  const refunded = amounts.some((a) => a == null) ? null : Math.round(amounts.reduce<number>((sum, a) => sum + (a ?? 0) * 100, 0)) / 100
  return { refundId: booking.stripe_payment_intent_id ? refundIds[0] : null, refunded }
}

// A cleaner backing out early: the booking goes back to the customer to choose someone
// else, paid from its original charge. Any upcharge was for this cleaner's visit, so it
// comes back in full and leaves the booking's totals.
// A replacement's price difference is part of the booking's price, not extra for this
// visit, so it stays held for the next replacement.
export async function refundUpchargesForReplacement(admin: Admin, bookingId: string): Promise<void> {
  const upcharges = (await getPaidUpcharges(admin, bookingId)).filter((u) => !u.replacementDifference)
  if (upcharges.length === 0) return
  const refundIds: { upchargeId: string; refundId: string | null }[] = []
  for (const u of upcharges) refundIds.push({ upchargeId: u.id, refundId: await refundBookingInFull(u.paymentIntentId) })
  await markUpchargesRefunded(admin, refundIds)

  const { data: booking } = await admin.from('bookings').select('id, total_customer_charge, customer_subtotal, cleaner_pay').eq('id', bookingId).maybeSingle()
  if (booking) {
    await addToBookingTotals(admin, booking, {
      charge: -upcharges.reduce((sum, u) => sum + u.charge, 0),
      amount: -upcharges.reduce((sum, u) => sum + u.amount, 0),
      cleanerPay: -upcharges.reduce((sum, u) => sum + u.cleanerPay, 0),
    })
  }

  // Tasks the customer added for this cleaner come off the booking as well, back to the
  // dashboard, so whoever replaces them isn't asked to do them unpaid.
  if (upcharges.some((u) => u.taskAdditionId)) {
    // Imported here: lib/bookingTaskAdditions imports this module.
    const { removeAcceptedTaskAdditions } = await import('@/lib/bookingTaskAdditions')
    await removeAcceptedTaskAdditions(admin, bookingId)
  }
}

export function isAdminRefund(value: string): value is AdminRefund {
  return Object.hasOwn(ADMIN_REFUND_LABELS, value)
}

const ADMIN_REFUNDS: Record<Exclude<AdminRefund, 'custom'>, (paymentIntentId: string) => Promise<string | null>> = {
  full: refundBookingInFull,
  minus_fee: refundBookingPayment,
  half: refundHalf,
  none: async () => null,
}

async function refundedAmount(refundId: string | null): Promise<number | null> {
  if (!refundId) return 0
  try {
    return (await stripe.refunds.retrieve(refundId)).amount / 100
  } catch (err) {
    console.error('Could not look up refund', refundId, err)
    return null
  }
}

// Sent whether or not they've turned booking emails off: it's their record of what
// happened to their money.
async function emailAdminCancellation(
  admin: Admin,
  customerId: string,
  scheduledDate: string | null,
  refund: AdminRefund,
  refunded: number | null,
  reason: string | null
): Promise<void> {
  const { data: customer } = await admin.from('profiles').select('email, first_name').eq('id', customerId).maybeSingle()
  if (!customer?.email) return

  const amount = refunded != null ? `: $${refunded.toFixed(2)}` : ''
  const outcome = {
    full: `Full refund${amount}, including the Stripe processing fee.`,
    minus_fee: `Refund${amount}. The Stripe and Trust & Support fee isn’t refundable, so it was kept back.`,
    half: `Partial refund (50%)${amount}.`,
    custom: `Partial refund${amount}.`,
    none: 'No refund.',
  }[refund]
  const when = scheduledDate ? ` for ${escapeHtml(scheduledDate)}` : ''
  const p = 'margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;'

  await sendEmail({
    to: [{ email: customer.email, name: customer.first_name ?? undefined }],
    subject: 'Your Tydio booking was canceled',
    htmlContent: emailShell(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">Hi ${escapeHtml(customer.first_name ?? 'there')},</h2>
      <p style="${p}">The Tydio team canceled your booking${when}.</p>
      <p style="margin:0 0 12px;padding:12px 16px;background:#f1f5f9;border-radius:10px;color:#1a2332;font-size:15px;line-height:1.5;"><strong>${escapeHtml(outcome)}</strong></p>
      ${reason ? `<p style="${p}">Reason: ${escapeHtml(reason)}</p>` : ''}
      ${refund !== 'none' ? `<p style="${p}">Refunds usually reach your card within 5–10 business days.</p>` : ''}
      <p style="${p}">Your tasks are back on your list whenever you’re ready to book again.</p>
    `),
  }).catch((err) => console.error('Admin cancellation email failed', err))
}

// The Tydio team canceling a booking from the admin dashboard, at any point before the
// cleaner marks it complete, refunding as much as the admin chooses. No refund needs a
// reason, which is emailed to the customer. An accepted booking's cleaner is paid what the
// admin chooses (`payout`, nothing by default), straight away and emailed to them;
// whatever isn't refunded or paid to them stays with Tydio. A request still out to several cleaners, or a declined
// booking whose replacements are still out, ends the whole group: they all share one
// payment, so it's refunded once. A custom refund is an amount in dollars, up to what
// the customer paid.
export async function cancelBookingAsAdmin(
  admin: Admin,
  bookingId: string,
  refund: AdminRefund,
  reason: string | null = null,
  customAmount: number | null = null,
  payout: { choice: AdminPayoutChoice; custom: number | null } | null = null
): Promise<{ success: true; cleanerPay?: number; warning?: string } | { error: string }> {
  const { data: booking } = await admin
    .from('bookings')
    .select('id, user_id, tidy_pro_id, status, decision_status, request_group_id, cancelled_reason, cleaner_marked_complete_at, stripe_payment_intent_id, stripe_refund_id, task_list, scheduled_date, total_customer_charge, cleaner_pay')
    .eq('id', bookingId)
    .maybeSingle()
  if (!booking) return { error: 'Booking not found.' }
  if (refund === 'none' && booking.stripe_payment_intent_id && !reason) return { error: 'Give the customer a reason for not refunding them.' }
  if (refund === 'custom') {
    if (!booking.stripe_payment_intent_id) return { error: 'There’s no payment to refund.' }
    const invalid = validateCustomRefund(customAmount, booking.total_customer_charge)
    if (invalid) return { error: invalid }
  }

  // Only an accepted booking has a cleaner to pay.
  let cleanerPay = 0
  if (payout && payout.choice !== 'none') {
    if (booking.status !== 'scheduled' || !booking.tidy_pro_id) return { error: 'Only an accepted booking has a Tidy Pro to pay.' }
    const result = adminCleanerPay(payout.choice, Number(booking.cleaner_pay ?? 0), payout.custom)
    if ('error' in result) return { error: result.error }
    cleanerPay = result.pay
  }

  // Whichever path refunds it, this is the refund the customer is told about.
  let issuedRefundId: string | null = null
  const issueRefund = async (paymentIntentId: string) =>
    (issuedRefundId =
      refund === 'custom' ? await refundCustomAmount(paymentIntentId, customAmount!) : await ADMIN_REFUNDS[refund](paymentIntentId))
  // The total refunded, when the booking path already knows it (it can span upcharges).
  let refundedTotal: number | null | undefined
  const tellCustomer = async (customerId: string) => {
    const refunded = refundedTotal !== undefined ? refundedTotal : await refundedAmount(issuedRefundId)
    await notifyCustomer(admin, customerId, notifyAdminCancelledBooking(refund, refunded), { email: false })
    await emailAdminCancellation(admin, customerId, booking.scheduled_date, refund, refunded, reason)
  }

  let groupId: string | null = null
  if (booking.status === 'pending' && booking.request_group_id) groupId = booking.request_group_id
  let declinedAndHeld = false
  if (isAwaitingReplacements(booking) && !booking.stripe_refund_id) {
    const group = await liveReplacementGroup(admin, bookingId)
    if (group?.status === 'open') groupId = group.id
    declinedAndHeld = group == null
  }

  if (groupId) {
    // A custom amount comes off the booking's own payment; upcharges get the chosen share.
    const result = await closeAndRefundGroup(admin, groupId, ADMIN_CANCELLED_REASON, issueRefund, refund === 'custom' ? async () => null : ADMIN_REFUNDS[refund])
    if (!result.closed) return { error: result.error }
    await Promise.all(
      result.requests
        .filter((b): b is { id: string; tidy_pro_id: string } => b.tidy_pro_id != null)
        .map((b) => notifyCleaner(admin, b.tidy_pro_id, notifyAdminCancelledRequest(b.id)))
    )
    await tellCustomer(result.userId)
    return { success: true }
  }

  const cancellable =
    declinedAndHeld || booking.status === 'pending' || (booking.status === 'scheduled' && !booking.cleaner_marked_complete_at)
  if (!cancellable) return { error: 'This booking can no longer be canceled.' }

  // On the booking's whole total, including any upcharges the customer paid.
  let refundId: string | null = booking.stripe_refund_id
  if (booking.stripe_payment_intent_id && !refundId) {
    try {
      const result = await refundBookingTotal(admin, booking, refund === 'custom' ? { custom: customAmount! } : refund)
      refundId = result.refundId
      refundedTotal = result.refunded
    } catch (err) {
      return { error: userFacingError(err, 'Failed to refund this booking.') }
    }
  }

  const { data: updated, error } = await admin
    .from('bookings')
    .update({ status: 'cancelled', cancelled_reason: ADMIN_CANCELLED_REASON, progress_status: null, stripe_refund_id: refundId, user_unread: true, tidy_pro_unread: !declinedAndHeld })
    .eq('id', bookingId)
    .eq('status', booking.status!)
    .select('id')
  if (error) return { error: userFacingError(error) }
  // The refund is keyed to the payment, so trying again after a refresh won't refund twice.
  if (!updated?.length) return { error: 'This booking just changed. Please refresh the page and try again.' }

  await withdrawPendingProposals(admin, bookingId)
  await dropPendingUpcharges(admin, bookingId)
  if (booking.status === 'scheduled' && !booking.stripe_payment_intent_id && refund !== 'none') await refundUpchargesOfUnpaidVisit(admin, bookingId)
  await restoreBookingTasks(admin, booking.user_id, (booking.task_list as TidyTask[] | null) ?? [])
  await tellCustomer(booking.user_id)
  // The cleaner who declined has already moved on, so they don't need to hear about it.
  if (booking.tidy_pro_id && !declinedAndHeld) {
    await notifyCleaner(admin, booking.tidy_pro_id, notifyAdminCancelledRequest(bookingId))
  }

  let warning: string | undefined
  if (cleanerPay > 0 && booking.tidy_pro_id) {
    // The admin's choice settles any hold they'd put on the payout.
    await admin
      .from('bookings')
      .update({ cleaner_pay: cleanerPay, payout_adjusted_at: new Date().toISOString(), payout_held_at: null, payout_hold_note: null })
      .eq('id', bookingId)
    // Imported here: lib/bookings imports this module.
    const { completeBookingPayout } = await import('@/lib/bookings')
    const result = await completeBookingPayout(admin, bookingId).catch((err) => ({ error: String(err) }))
    if ('error' in result) warning = `The Tidy Pro's payout transfer failed and will be retried: ${result.error}.`
    await emailCleanerPaidForCancellation(admin, booking.tidy_pro_id, booking.scheduled_date, cleanerPay)
  }
  return { success: true, ...(cleanerPay > 0 ? { cleanerPay } : {}), ...(warning ? { warning } : {}) }
}

async function emailCleanerPaidForCancellation(admin: Admin, tidyProId: string, scheduledDate: string | null, pay: number): Promise<void> {
  const { data: cleaner } = await admin.from('profiles').select('email, first_name').eq('id', tidyProId).maybeSingle()
  if (!cleaner?.email) return
  const when = scheduledDate ? ` for ${escapeHtml(scheduledDate)}` : ''
  const p = 'margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;'
  await sendEmail({
    to: [{ email: cleaner.email, name: cleaner.first_name ?? undefined }],
    subject: `You'll be paid $${pay.toFixed(2)} for a canceled booking`,
    htmlContent: emailShell(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">Hi ${escapeHtml(cleaner.first_name ?? 'there')},</h2>
      <p style="${p}">The Tydio team canceled your booking${when}. You'll still be paid $${pay.toFixed(2)} for it, sent to your payout account.</p>
    `),
  }).catch((err) => console.error('Cancellation payout email failed', tidyProId, err))
}

// The cutoff arrived with nobody having accepted.
export async function expireGroup(admin: Admin, groupId: string): Promise<void> {
  const result = await closeAndRefundGroup(admin, groupId, NO_RESPONSE_REASON)
  if (!result.closed) return

  await notifyCustomer(admin, result.userId, notifyBookingExpired())
  await Promise.all(
    result.requests
      .filter((b): b is { id: string; tidy_pro_id: string } => b.tidy_pro_id != null)
      .map((b) => notifyCleaner(admin, b.tidy_pro_id, notifyRequestExpired(b.id)))
  )
}

// The same, for a booking with no group: a first request nobody answered, or a declined
// one where the customer never chose replacements. Conditional on status, so a cleaner
// accepting at the same moment wins or loses cleanly. Accepting is refused once the
// cutoff has passed, so this can't take a booking out from under them.
export async function expireBooking(
  admin: Admin,
  booking: {
    id: string
    user_id: string
    tidy_pro_id: string | null
    status: string | null
    stripe_payment_intent_id: string | null
    task_list: unknown
  }
): Promise<void> {
  if (!booking.status) return
  // With any upcharges held on it: a replacement chain's price differences.
  const refundId = booking.stripe_payment_intent_id ? (await refundBookingTotal(admin, booking, 'minus_fee')).refundId : null

  const { data: updated } = await admin
    .from('bookings')
    .update({ status: 'cancelled', cancelled_reason: NO_RESPONSE_REASON, stripe_refund_id: refundId, user_unread: true, tidy_pro_unread: booking.status === 'pending' })
    .eq('id', booking.id)
    .eq('status', booking.status)
    .select('id')

  if (!updated || updated.length === 0) return

  await restoreBookingTasks(admin, booking.user_id, (booking.task_list as TidyTask[] | null) ?? [])
  await notifyCustomer(admin, booking.user_id, notifyBookingExpired())
  if (booking.status === 'pending' && booking.tidy_pro_id) {
    await notifyCleaner(admin, booking.tidy_pro_id, notifyRequestExpired(booking.id))
  }
}

// Run on a schedule. Finds anything still waiting on a cleaner, or on the customer,
// whose cutoff has arrived, an hour before it starts. Accepted bookings are never touched. Each one is handled on its own, so one failed refund
// doesn't hold up the rest, and it's retried on the next run.
export async function expireUnacceptedBookings(admin: Admin, now: Date = new Date()): Promise<{ expired: number; failed: number }> {
  const { data: waiting } = await admin
    .from('bookings')
    .select('id, user_id, tidy_pro_id, status, scheduled_date, scheduled_time, stripe_payment_intent_id, stripe_refund_id, task_list, request_group_id, cancelled_reason, time_zone')
    .in('status', ['pending', 'declined'])
    .is('stripe_refund_id', null)

  const started = (waiting ?? []).filter((b) => hasAcceptanceWindowClosed(b.scheduled_date, b.scheduled_time, now, b.time_zone))

  const declinedIds = started.filter(isAwaitingReplacements).map((b) => b.id)
  // Only the live round: a chain's earlier rounds are closed, and the booking waits on the
  // customer again, so it expires on its own.
  const { data: replacedFrom } = declinedIds.length
    ? await admin.from('booking_request_groups').select('id, original_booking_id, status').in('original_booking_id', declinedIds).in('status', ['open', 'filled'])
    : { data: [] }
  const groupByOriginal = new Map((replacedFrom ?? []).map((g) => [g.original_booking_id, g]))

  const groupIds = new Set<string>()
  const singles: typeof started = []

  for (const booking of started) {
    if (booking.request_group_id && !isAwaitingReplacements(booking)) {
      // A cleaner in a group declining is settled by closeGroupIfNoRequestsLeft.
      if (booking.status === 'pending') groupIds.add(booking.request_group_id)
    } else if (booking.status === 'pending') {
      singles.push(booking)
    } else {
      const group = groupByOriginal.get(booking.id)
      if (!group) singles.push(booking)
      else if (group.status === 'open') groupIds.add(group.id)
    }
  }

  let expired = 0
  let failed = 0
  const attempt = async (work: () => Promise<void>) => {
    try {
      await work()
      expired++
    } catch (err) {
      console.error('Failed to expire booking', err)
      failed++
    }
  }

  for (const groupId of groupIds) await attempt(() => expireGroup(admin, groupId))
  for (const booking of singles) await attempt(() => expireBooking(admin, booking))

  return { expired, failed }
}
