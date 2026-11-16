import type { createAdminClient } from '@/lib/supabase/admin'
import type { TidyTask } from '@/app/dashboard/types'
import {
  CLEANER_CANCELLED_REASON,
  closeGroupIfNoRequestsLeft,
  refundBookingTotal,
  refundUpchargesForReplacement,
  restoreBookingTasks,
} from '@/lib/bookingRequestGroups'
import { hasAcceptanceWindowClosed } from '@/lib/bookingTime'
import { withdrawPendingProposals } from '@/lib/bookingTimeProposals'
import { dropPendingUpcharges } from '@/lib/bookingUpcharges'
import { notifyCustomer } from '@/lib/customerNotifications'
import { notifyBookingDeclined, notifyCleanerCancelled, notifyCleanerCancelledRefunded, notifyRecurringVisitCancelledByTidyPro } from '@/lib/notifications'
import { isUnpaidVisit } from '@/lib/recurringPayments'
import { userFacingError } from '@/lib/userFacingError'

type Admin = ReturnType<typeof createAdminClient>

// A cleaner backing out of a booking they accepted, any time before they arrive. With an
// hour or more to go, the booking goes back to the customer like a decline: their payment
// stays held, and they can choose up to 3 other cleaners, whoever accepts being paid from
// it when they finish. Any later and there's no time for anyone else to accept, so the
// customer is refunded in full. decision_status stays 'accepted', which keeps a canceled
// replacement visible to the customer (see isHiddenGroupRequest).
//
// A recurring visit that isn't paid yet (lib/recurringPayments) has no payment to hold or
// refund, so it's simply canceled; the customer can book that day themselves, and the
// rest of the series carries on.
//
// Used by the Tidy Pro's Cancel button, by dropping a whole recurring series, by suspending
// or banning them (lib/accountBookingCancellation), and by time
// off that covers a recurring visit.
export async function cancelBookingForTidyPro(
  admin: Admin,
  input: {
    bookingId: string
    tidyProId: string
    reason: { cancellation_reason: string; cancellation_note: string | null }
    now?: Date
  }
): Promise<{ success: true } | { error: string }> {
  const now = input.now ?? new Date()
  const { data: booking } = await admin
    .from('bookings')
    .select('id, user_id, status, progress_status, scheduled_date, scheduled_time, time_zone, stripe_payment_intent_id, task_list, payment_due_at')
    .eq('id', input.bookingId)
    .eq('tidy_pro_id', input.tidyProId)
    .maybeSingle()

  if (!booking) return { error: 'Booking not found.' }
  if (booking.status !== 'scheduled' || (booking.progress_status != null && booking.progress_status !== 'on_the_way')) {
    return { error: 'This booking can no longer be canceled.' }
  }

  const { data: proProfile } = await admin.from('profiles').select('first_name').eq('id', input.tidyProId).maybeSingle()
  const cleanerName = proProfile?.first_name ?? 'Your Tidy Pro'

  await withdrawPendingProposals(admin, input.bookingId)

  if (isUnpaidVisit(booking) && !booking.stripe_payment_intent_id) {
    const { data: updated, error } = await admin
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_reason: CLEANER_CANCELLED_REASON,
        ...input.reason,
        progress_status: null,
        payment_due_at: null,
        suspended_for_payment_at: null,
        user_unread: true,
        tidy_pro_unread: false,
      })
      .eq('id', input.bookingId)
      .eq('status', 'scheduled')
      .is('stripe_payment_intent_id', null)
      .select('id')
    if (error) return { error: userFacingError(error) }
    if (!updated?.length) return { error: 'This booking just changed. Please refresh the page and try again.' }

    await dropPendingUpcharges(admin, input.bookingId)
    await notifyCustomer(admin, booking.user_id, notifyRecurringVisitCancelledByTidyPro(cleanerName, booking.scheduled_date ?? ''))
    return { success: true }
  }

  const tooLateToReplace = hasAcceptanceWindowClosed(booking.scheduled_date, booking.scheduled_time, now, booking.time_zone)

  if (tooLateToReplace) {
    let refundId: string | null = null
    if (booking.stripe_payment_intent_id) {
      try {
        refundId = (await refundBookingTotal(admin, { id: input.bookingId, stripe_payment_intent_id: booking.stripe_payment_intent_id }, 'full')).refundId
      } catch (err) {
        return { error: userFacingError(err, 'Failed to refund this booking.') }
      }
    }

    const { data: updated, error } = await admin
      .from('bookings')
      .update({ status: 'cancelled', cancelled_reason: CLEANER_CANCELLED_REASON, ...input.reason, progress_status: null, stripe_refund_id: refundId, user_unread: true, tidy_pro_unread: false })
      .eq('id', input.bookingId)
      .eq('status', 'scheduled')
      .select('id')
    if (error) return { error: userFacingError(error) }
    if (!updated?.length) return { error: 'This booking can no longer be canceled.' }

    await dropPendingUpcharges(admin, input.bookingId)
    await restoreBookingTasks(admin, booking.user_id, (booking.task_list as TidyTask[] | null) ?? [])
    await notifyCustomer(admin, booking.user_id, notifyCleanerCancelledRefunded(cleanerName))
  } else {
    const { data: updated, error } = await admin
      .from('bookings')
      .update({ status: 'declined', cancelled_reason: CLEANER_CANCELLED_REASON, ...input.reason, progress_status: null, user_unread: true, tidy_pro_unread: false })
      .eq('id', input.bookingId)
      .eq('status', 'scheduled')
      .select('id')
    if (error) return { error: userFacingError(error) }
    if (!updated?.length) return { error: 'This booking can no longer be canceled.' }

    // Whoever replaces them is paid from the original charge, so an upcharge for this
    // cleaner's visit comes back.
    await dropPendingUpcharges(admin, input.bookingId)
    await refundUpchargesForReplacement(admin, input.bookingId).catch((err) => console.error('Upcharge refund failed', input.bookingId, err))
    await notifyCustomer(admin, booking.user_id, notifyCleanerCancelled(cleanerName, input.bookingId))
  }

  return { success: true }
}

// A Tidy Pro declining a request they haven't answered yet. Used by the Decline button
// and when a Tidy Pro is suspended or banned. Conditional on the request still pending,
// so it can't undo an accept that just happened.
export async function declineRequestForTidyPro(
  admin: Admin,
  input: { bookingId: string; tidyProId: string }
): Promise<{ success: true } | { error: string }> {
  const { data: booking } = await admin
    .from('bookings')
    .select('id, user_id, status, request_group_id')
    .eq('id', input.bookingId)
    .eq('tidy_pro_id', input.tidyProId)
    .maybeSingle()
  if (!booking) return { error: 'Booking not found.' }
  if (booking.status !== 'pending') return { error: 'This request has already been resolved.' }

  await withdrawPendingProposals(admin, input.bookingId)

  // The customer's payment backs every request in a group, so one cleaner declining
  // mustn't touch it. The customer only hears about it if nobody is left to accept.
  const inGroup = booking.request_group_id != null
  const { data: declined, error } = await admin
    .from('bookings')
    .update({ decision_status: 'declined', status: 'declined', tidy_pro_unread: false, ...(inGroup ? {} : { user_unread: true }) })
    .eq('id', input.bookingId)
    .eq('status', 'pending')
    .select('id')
  if (error) return { error: userFacingError(error) }
  if (!declined?.length) return { error: 'This request has already been resolved.' }

  if (booking.request_group_id) {
    await closeGroupIfNoRequestsLeft(admin, booking.request_group_id)
  } else {
    // The payment stays where it is: the customer can send this to other cleaners with no
    // new charge. It's refunded if they cancel, or when the booking time arrives.
    await notifyCustomer(admin, booking.user_id, notifyBookingDeclined(input.bookingId))
  }
  return { success: true }
}

// Every visit of a series still ahead and not started that's on this Tidy Pro's schedule,
// for dropping the series.
export async function upcomingSeriesVisits(admin: Admin, seriesId: string, tidyProId: string): Promise<string[]> {
  const { data } = await admin
    .from('bookings')
    .select('id')
    .eq('recurring_booking_id', seriesId)
    .eq('tidy_pro_id', tidyProId)
    .eq('status', 'scheduled')
    .or('progress_status.is.null,progress_status.eq.on_the_way')
  return (data ?? []).map((b) => b.id)
}
