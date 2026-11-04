import { stripe } from '@/lib/stripe'
import type { createAdminClient } from '@/lib/supabase/admin'
import { findAvailableCleaners, type CleanerMatch } from '@/lib/cleanerMatching'
import { hasAcceptanceWindowClosed } from '@/lib/bookingTime'
import { lateCancelRefund, stripePercentageForCardCountry, stripeProcessingFee } from '@/lib/pricingRules'
import { withdrawPendingProposals } from '@/lib/bookingTimeProposals'
import {
  notifyAdminCancelledBooking,
  notifyAdminCancelledRequest,
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

type Admin = ReturnType<typeof createAdminClient>

// The customer pays once, when they book, and that payment stays with Tydio until the
// booking resolves. If a cleaner declines, it simply carries over: the customer can
// ask up to 3 others, once, at the same price, and the first to accept gets the booking
// with no new charge. It's only refunded when the whole booking is canceled: by the
// customer, because everyone declined, or because nobody accepted by an hour before the
// start time. Every request in a group shares that one payment, so anything that
// would refund it has to go through this file.
//
// A cleaner canceling a booking they'd accepted is treated like a decline, as long as
// there's still time for someone else to accept (an hour before the start): the
// customer can choose replacements, including when the cleaner was a replacement
// themselves. Any later and the customer is refunded in full. A customer canceling an
// accepted booking within 12 hours of the start gets half back, and the cleaner is paid
// part of the rest.

export const MAX_REPLACEMENT_CLEANERS = 3

// Why a booking was canceled, when it wasn't the customer's own doing.
export const REQUEST_FILLED_REASON = 'filled_by_other'
export const NO_RESPONSE_REASON = 'no_response'
export const ALL_DECLINED_REASON = 'all_declined'
export const CLEANER_CANCELLED_REASON = 'cleaner_cancelled'
export const LATE_CANCEL_REASON = 'late_cancel'
// Reported incidents the admin settles (see lib/bookingIncidents).
export const NO_ACCESS_REASON = 'no_access'
export const CLEANER_NO_SHOW_REASON = 'cleaner_no_show'
export const ADMIN_CANCELLED_REASON = 'admin_cancelled'

export function cleanerCancelledNote(reason: string | null): string | null {
  if (reason === REQUEST_FILLED_REASON) return 'Another Tidy Pro accepted this booking first'
  if (reason === NO_RESPONSE_REASON) return 'This request expired because it was not accepted at least an hour before the booking'
  if (reason === LATE_CANCEL_REASON) return 'The customer canceled less than 12 hours before the booking, so you’ll still be paid part of it'
  if (reason === NO_ACCESS_REASON) return 'You reported that you couldn’t get in. Our team will review it and email you about your pay'
  if (reason === CLEANER_NO_SHOW_REASON) return 'The customer reported that you didn’t arrive. Our team will review it and email you'
  if (reason === ADMIN_CANCELLED_REASON) return 'The Tydio team canceled this booking'
  return null
}

export function customerCancelledNote(reason: string | null): string | null {
  if (reason === NO_RESPONSE_REASON) return 'No Tidy Pro accepted by an hour before the booking time, so it was canceled and your payment refunded, minus the nonrefundable Stripe fee.'
  if (reason === ALL_DECLINED_REASON) return 'The Tidy Pros you asked declined, so your booking was canceled and your payment refunded, minus the nonrefundable Stripe fee.'
  if (reason === CLEANER_CANCELLED_REASON) return 'Your Tidy Pro canceled less than an hour before the booking, so your payment has been refunded in full.'
  if (reason === NO_ACCESS_REASON) return 'Your Tidy Pro couldn’t get into your home, so the booking was canceled. Our team will review it and email you about any refund.'
  if (reason === CLEANER_NO_SHOW_REASON) return 'You reported that your Tidy Pro didn’t arrive, so the booking was canceled. Our team will review it and email you about your refund.'
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

// A declined booking whose payment is still held, not already replaced, not itself one
// of the requests in a group unless its cleaner canceled after accepting (otherwise
// there's one replacement round), and not past its cutoff.
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

// For a cleaner canceling at the last minute: everything comes back, Stripe's fee too,
// which Tydio absorbs.
export async function refundBookingInFull(paymentIntentId: string): Promise<string> {
  const refund = await stripe.refunds.create(
    { payment_intent: paymentIntentId },
    { idempotencyKey: `refund-booking-full-${paymentIntentId}` }
  )
  return refund.id
}

// For a customer canceling late: half of what they paid comes back.
export async function refundLateCancellation(paymentIntentId: string): Promise<string> {
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId)
  const refund = await stripe.refunds.create(
    { payment_intent: paymentIntentId, amount: Math.round(lateCancelRefund(intent.amount_received / 100) * 100) },
    { idempotencyKey: `refund-booking-late-${paymentIntentId}` }
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
  reason: string | null,
  refund: (paymentIntentId: string) => Promise<string | null> = refundBookingPayment
): Promise<{ closed: true; userId: string; requests: { id: string; tidy_pro_id: string | null }[] } | { closed: false; error: string }> {
  const { data: closed } = await admin
    .from('booking_request_groups')
    .update({ status: 'closed' })
    .eq('id', groupId)
    .eq('status', 'open')
    .select('user_id, stripe_payment_intent_id, original_booking_id')

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

export type AdminRefund = 'full' | 'minus_fee' | 'half' | 'none'

export const ADMIN_REFUND_LABELS: Record<AdminRefund, string> = {
  full: 'Full refund, Stripe fee included',
  minus_fee: 'Full refund minus Stripe fee',
  half: 'Half refund (50%)',
  none: 'No refund',
}

export function isAdminRefund(value: string): value is AdminRefund {
  return Object.hasOwn(ADMIN_REFUND_LABELS, value)
}

const ADMIN_REFUNDS: Record<AdminRefund, (paymentIntentId: string) => Promise<string | null>> = {
  full: refundBookingInFull,
  minus_fee: refundBookingPayment,
  half: refundLateCancellation,
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
    minus_fee: `Refund${amount}. Stripe’s processing fee isn’t refundable, so it was kept back.`,
    half: `Partial refund (50%)${amount}.`,
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
// reason, which is emailed to the customer. The cleaner isn't paid; whatever isn't
// refunded stays with Tydio. A request still out to several cleaners, or a declined
// booking whose replacements are still out, ends the whole group.
export async function cancelBookingAsAdmin(
  admin: Admin,
  bookingId: string,
  refund: AdminRefund,
  reason: string | null = null
): Promise<{ success: true } | { error: string }> {
  const { data: booking } = await admin
    .from('bookings')
    .select('id, user_id, tidy_pro_id, status, decision_status, request_group_id, cancelled_reason, cleaner_marked_complete_at, stripe_payment_intent_id, stripe_refund_id, task_list, scheduled_date')
    .eq('id', bookingId)
    .maybeSingle()
  if (!booking) return { error: 'Booking not found.' }
  if (refund === 'none' && booking.stripe_payment_intent_id && !reason) return { error: 'Give the customer a reason for not refunding them.' }

  // Whichever path refunds it, this is the refund the customer is told about.
  let issuedRefundId: string | null = null
  const issueRefund = async (paymentIntentId: string) => (issuedRefundId = await ADMIN_REFUNDS[refund](paymentIntentId))
  const tellCustomer = async (customerId: string) => {
    const refunded = await refundedAmount(issuedRefundId)
    await notifyCustomer(admin, customerId, notifyAdminCancelledBooking(refund, refunded), { email: false })
    await emailAdminCancellation(admin, customerId, booking.scheduled_date, refund, refunded, reason)
  }

  let groupId: string | null = null
  if (booking.status === 'pending' && booking.request_group_id) groupId = booking.request_group_id
  let declinedAndHeld = false
  if (isAwaitingReplacements(booking) && !booking.stripe_refund_id) {
    const { data: group } = await admin.from('booking_request_groups').select('id, status').eq('original_booking_id', bookingId).maybeSingle()
    if (group?.status === 'open') groupId = group.id
    declinedAndHeld = group == null
  }

  if (groupId) {
    const result = await closeAndRefundGroup(admin, groupId, ADMIN_CANCELLED_REASON, issueRefund)
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

  let refundId: string | null = booking.stripe_refund_id
  if (booking.stripe_payment_intent_id && !refundId) {
    try {
      refundId = await issueRefund(booking.stripe_payment_intent_id)
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
  await restoreBookingTasks(admin, booking.user_id, (booking.task_list as TidyTask[] | null) ?? [])
  await tellCustomer(booking.user_id)
  // The cleaner who declined has already moved on, so they don't need to hear about it.
  if (booking.tidy_pro_id && !declinedAndHeld) {
    await notifyCleaner(admin, booking.tidy_pro_id, notifyAdminCancelledRequest(bookingId))
  }
  return { success: true }
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
    .select('id, user_id, tidy_pro_id, status, scheduled_date, scheduled_time, stripe_payment_intent_id, stripe_refund_id, task_list, request_group_id, cancelled_reason, time_zone')
    .in('status', ['pending', 'declined'])
    .is('stripe_refund_id', null)

  const started = (waiting ?? []).filter((b) => hasAcceptanceWindowClosed(b.scheduled_date, b.scheduled_time, now, b.time_zone))

  const declinedIds = started.filter(isAwaitingReplacements).map((b) => b.id)
  const { data: replacedFrom } = declinedIds.length
    ? await admin.from('booking_request_groups').select('id, original_booking_id, status').in('original_booking_id', declinedIds)
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
