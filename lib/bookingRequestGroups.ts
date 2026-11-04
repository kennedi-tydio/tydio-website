import { stripe } from '@/lib/stripe'
import type { createAdminClient } from '@/lib/supabase/admin'
import { findAvailableCleaners, type CleanerMatch } from '@/lib/cleanerMatching'
import { hasAcceptanceWindowClosed } from '@/lib/bookingTime'
import { stripePercentageForCardCountry, stripeProcessingFee } from '@/lib/pricingRules'
import {
  notifyBookingExpired,
  notifyReplacementsDeclined,
  notifyRequestExpired,
  notifyRequestFilled,
  type NotificationPayload,
} from '@/lib/notifications'
import { notifyCustomer } from '@/lib/customerNotifications'
import { canSendSms, sendSmsForPayload } from '@/lib/sms'
import { sendPushForPayload } from '@/lib/push'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import type { TidyTask } from '@/app/dashboard/types'

type Admin = ReturnType<typeof createAdminClient>

// The customer pays once, when they book, and that payment stays with Tydio until the
// booking resolves. If a cleaner declines, it simply carries over: the customer can
// ask up to 3 others, once, at the same price, and the first to accept gets the booking
// with no new charge. It's only refunded when the whole booking is canceled: by the
// customer, because everyone declined, or because nobody accepted by an hour before the
// start time. Every request in a group shares that one payment, so anything that
// would refund it has to go through this file.

export const MAX_REPLACEMENT_CLEANERS = 3

// Why a booking was canceled, when it wasn't the customer's own doing.
export const REQUEST_FILLED_REASON = 'filled_by_other'
export const NO_RESPONSE_REASON = 'no_response'
export const ALL_DECLINED_REASON = 'all_declined'

export function cleanerCancelledNote(reason: string | null): string | null {
  if (reason === REQUEST_FILLED_REASON) return 'Another Tidy Pro accepted this booking first'
  if (reason === NO_RESPONSE_REASON) return 'This request expired because it was not accepted at least an hour before the booking'
  return null
}

export function customerCancelledNote(reason: string | null): string | null {
  if (reason === NO_RESPONSE_REASON) return 'No Tidy Pro accepted by an hour before the booking time, so it was canceled and your payment refunded, minus the nonrefundable Stripe fee.'
  if (reason === ALL_DECLINED_REASON) return 'The Tidy Pros you asked declined, so your booking was canceled and your payment refunded, minus the nonrefundable Stripe fee.'
  return null
}

// Requests within a group that didn't work out are bookkeeping, not bookings. The
// customer follows the outcome on their original booking instead.
export function isHiddenGroupRequest(booking: { status: string | null; request_group_id: string | null }): boolean {
  return booking.request_group_id != null && (booking.status === 'cancelled' || booking.status === 'declined')
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

// A declined booking whose payment is still held, not already replaced, not itself one
// of the requests in a group (there's one replacement round), and not past its cutoff.
export function canRequestReplacements(
  booking: {
    status: string | null
    request_group_id: string | null
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
    booking.status === 'declined' &&
    booking.request_group_id == null &&
    !hasExistingGroup &&
    booking.stripe_payment_intent_id != null &&
    booking.stripe_refund_id == null &&
    !hasAcceptanceWindowClosed(booking.scheduled_date, booking.scheduled_time, now, booking.time_zone ?? null)
  )
}

export async function getReplacementOptions(
  admin: Admin,
  booking: {
    tidy_pro_id: string | null
    scheduled_location: unknown
    scheduled_date: string | null
    scheduled_time: string | null
    estimated_duration_minutes: number | null
  }
): Promise<CleanerMatch[]> {
  const location = booking.scheduled_location as ScheduledLocation | null
  if (location?.latitude == null || location?.longitude == null || !booking.scheduled_date) return []

  const cleaners = await findAvailableCleaners(
    {
      latitude: location.latitude,
      longitude: location.longitude,
      date: booking.scheduled_date,
      time: booking.scheduled_time?.slice(0, 5) ?? null,
      durationMinutes: booking.estimated_duration_minutes ?? 60,
    },
    admin
  )

  return cleaners.filter((c) => c.id !== booking.tidy_pro_id)
}

async function notifyCleaner(admin: Admin, id: string, payload: NotificationPayload): Promise<void> {
  const { data: person } = await admin.from('tidypro_profiles').select('phone, sms_consent').eq('id', id).maybeSingle()
  if (canSendSms(person?.sms_consent ?? null, person?.phone ?? null)) {
    await sendSmsForPayload(person!.phone!, payload).catch(() => {})
  }
  await sendPushForPayload(id, payload).catch(() => {})
}

// Refunds what the customer paid minus the fee Stripe actually took on this charge. That
// record can take a moment to appear right after a charge, so until it does, the fee is
// worked out from the card's country. Keyed to the payment, so however many paths reach
// this, it's only refunded once.
export async function refundBookingPayment(paymentIntentId: string): Promise<string> {
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge.balance_transaction'] })
  const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null
  const balance = charge && typeof charge.balance_transaction === 'object' ? charge.balance_transaction : null
  const percentage = stripePercentageForCardCountry(charge?.payment_method_details?.card?.country)
  const feeCents = balance?.fee ?? Math.round(stripeProcessingFee(intent.amount_received / 100, percentage) * 100)

  const refund = await stripe.refunds.create(
    { payment_intent: paymentIntentId, amount: intent.amount_received - feeCents },
    { idempotencyKey: `refund-booking-${paymentIntentId}` }
  )
  return refund.id
}

// Puts a canceled booking's tasks back on the customer's list, unselected and ready to
// choose again. The list lives on their most recent draft, which booking removes, so
// this may need to start a new one.
export async function restoreBookingTasks(admin: Admin, userId: string, tasks: TidyTask[]): Promise<void> {
  if (tasks.length === 0) return
  const restored = tasks.map((task) => ({ ...task, completed: false }))

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
  reason: string | null
): Promise<{ closed: true; userId: string; requests: { id: string; tidy_pro_id: string | null }[] } | { closed: false; error: string }> {
  const { data: closed } = await admin
    .from('booking_request_groups')
    .update({ status: 'closed' })
    .eq('id', groupId)
    .eq('status', 'open')
    .select('user_id, stripe_payment_intent_id, original_booking_id')

  const group = closed?.[0]
  if (!group) return { closed: false, error: 'A Tidy Pro just accepted this booking. Please refresh the page.' }

  let refundId: string
  try {
    refundId = await refundBookingPayment(group.stripe_payment_intent_id)
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

  const { data: original } = await admin
    .from('bookings')
    .update({ status: 'cancelled', cancelled_reason: reason, stripe_refund_id: refundId, user_unread: reason != null })
    .eq('id', group.original_booking_id)
    .select('task_list')
    .maybeSingle()

  await restoreBookingTasks(admin, group.user_id, (original?.task_list as TidyTask[] | null) ?? [])

  return { closed: true, userId: group.user_id, requests: requests ?? [] }
}

// Called after a cleaner in the group declines. Ends the booking once nobody's left.
export async function closeGroupIfNoRequestsLeft(admin: Admin, groupId: string): Promise<void> {
  const { count } = await admin
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('request_group_id', groupId)
    .eq('status', 'pending')
  if (count !== 0) return

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
  const refundId = booking.stripe_payment_intent_id ? await refundBookingPayment(booking.stripe_payment_intent_id) : null

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
    .select('id, user_id, tidy_pro_id, status, scheduled_date, scheduled_time, stripe_payment_intent_id, stripe_refund_id, task_list, request_group_id, time_zone')
    .in('status', ['pending', 'declined'])
    .is('stripe_refund_id', null)

  const started = (waiting ?? []).filter((b) => hasAcceptanceWindowClosed(b.scheduled_date, b.scheduled_time, now, b.time_zone))

  const declinedIds = started.filter((b) => b.status === 'declined' && !b.request_group_id).map((b) => b.id)
  const { data: replacedFrom } = declinedIds.length
    ? await admin.from('booking_request_groups').select('id, original_booking_id, status').in('original_booking_id', declinedIds)
    : { data: [] }
  const groupByOriginal = new Map((replacedFrom ?? []).map((g) => [g.original_booking_id, g]))

  const groupIds = new Set<string>()
  const singles: typeof started = []

  for (const booking of started) {
    if (booking.request_group_id) {
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
