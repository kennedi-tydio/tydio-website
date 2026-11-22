'use server'

import { revalidatePath } from 'next/cache'
import { acceptSeriesForBooking } from '@/lib/recurringBookings'
import { isUnpaidVisit } from '@/lib/recurringPayments'
import { recurringPaymentDueAt } from '@/lib/recurrence'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { startMaskedCall } from '@/lib/maskedCalls'
import { completeBookingPayout, sendBookingMessage } from '@/lib/bookings'
import {
  LATE_CANCEL_REASON,
  cancelGroupForCustomer,
  cancelOtherRequests,
  isAwaitingReplacements,
  refundBookingTotal,
  restoreBookingTasks,
} from '@/lib/bookingRequestGroups'
import { bookingStartInstant, hasAcceptanceWindowClosed, isLateCancellation } from '@/lib/bookingTime'
import { lateCancelCleanerPay, lateCancelRefund } from '@/lib/pricingRules'
import { canChangeStartTime, hasScheduleConflict } from '@/lib/bookingTimeProposals'
import type { TidyTask } from '@/app/dashboard/types'
import { canSendSms, sendSmsForPayload } from '@/lib/sms'
import { sendPushForPayload } from '@/lib/push'
import {
  notifyBookingCancelledConfirmation,
  notifyCleanerAskedCancel,
  notifyCleanerAskedCancelConfirmation,
  notifyCustomerCancelled,
  notifyCustomerCancelledLate,
  notifyLateCancelConfirmation,
  notifyNewMessage,
  notifyTimeProposalAnswered,
} from '@/lib/notifications'
import { notifyCustomer } from '@/lib/customerNotifications'
import { userFacingError } from '@/lib/userFacingError'
import { dropPendingUpcharges, refundUpchargesOfUnpaidVisit } from '@/lib/bookingUpcharges'
import { CUSTOMER_CANCEL_REASONS, parseCancellation, type Cancellation } from '@/lib/cancellationReasons'
import { withdrawTaskAddition } from '@/lib/bookingTaskAdditions'
import { reportBookingIncident } from '@/lib/bookingIncidents'

async function notifyTidyPro(
  admin: ReturnType<typeof createAdminClient>,
  tidyProId: string,
  payload: { title: string; body: string; url: string }
): Promise<void> {
  const { data: tidyPro } = await admin
    .from('tidypro_profiles')
    .select('phone, sms_consent')
    .eq('id', tidyProId)
    .maybeSingle()

  if (canSendSms(tidyPro?.sms_consent ?? null, tidyPro?.phone ?? null)) {
    await sendSmsForPayload(tidyPro!.phone!, payload).catch(() => {})
  }
  await sendPushForPayload(tidyProId, payload).catch(() => {})
}

export async function sendMessageAction(bookingId: string, body: string): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const admin = createAdminClient()

  const { data: booking } = await admin
    .from('bookings')
    .select('id, tidy_pro_id')
    .eq('id', bookingId)
    .eq('user_id', session.profileId)
    .maybeSingle()

  if (!booking) return { error: 'Booking not found.' }

  const result = await sendBookingMessage(admin, bookingId, 'USER', body)
  if ('error' in result) return result

  if (booking.tidy_pro_id) {
    await notifyTidyPro(admin, booking.tidy_pro_id, notifyNewMessage('TIDYPRO', bookingId))
  }

  revalidatePath(`/dashboard/messages/${bookingId}`)
  revalidatePath(`/pro/messages/${bookingId}`)
  revalidatePath('/pro/messages')
  return { success: true }
}

// `acceptLateFee` is the customer having been shown that canceling now only refunds half.
// Without it, a booking that crossed into the late window while they had the page open
// isn't canceled on terms they never saw.
export async function cancelBookingRequestAction(
  bookingId: string,
  cancellation: Cancellation,
  acceptLateFee = false
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const chosen = parseCancellation(CUSTOMER_CANCEL_REASONS, cancellation)
  if ('error' in chosen) return chosen
  const reasonFields = { cancellation_reason: chosen.reason, cancellation_note: chosen.note }

  const admin = createAdminClient()

  const { data: booking } = await admin
    .from('bookings')
    .select('id, tidy_pro_id, status, progress_status, stripe_payment_intent_id, stripe_refund_id, request_group_id, cancelled_reason, cancellation_reason, task_list, scheduled_date, scheduled_time, time_zone, total_customer_charge, cleaner_pay')
    .eq('id', bookingId)
    .eq('user_id', session.profileId)
    .maybeSingle()

  if (!booking) return { error: 'Booking not found.' }

  const { data: customer } = await admin.from('profiles').select('first_name').eq('id', session.profileId).maybeSingle()
  const cancelledPayload = notifyCustomerCancelled(customer?.first_name ?? 'The customer')

  // Waiting on several cleaners: the customer is canceling the booking, not one of them,
  // so every request goes. The refund and returned tasks are handled there.
  if (booking.status === 'pending' && booking.request_group_id) {
    const result = await cancelGroupForCustomer(admin, booking.request_group_id)
    if ('error' in result) return result
    // Only requests without a reason yet: a cleaner who canceled one keeps theirs.
    await admin.from('bookings').update(reasonFields).eq('request_group_id', booking.request_group_id).is('cancellation_reason', null)
    await Promise.all(result.tidyProIds.map((id) => notifyTidyPro(admin, id, cancelledPayload)))
    // The customer canceled, so only the Tidy Pros are texted.
    await notifyCustomer(admin, session.profileId, notifyBookingCancelledConfirmation(), { sms: false })

    revalidatePath('/dashboard/messages')
    revalidatePath('/dashboard')
    return { success: true }
  }

  // A declined booking whose payment is still held, where no replacements were chosen.
  // Once they have been, the customer cancels from those requests instead.
  let declinedAndHeld = false
  if (isAwaitingReplacements(booking) && !booking.stripe_refund_id) {
    const { data: group } = await admin.from('booking_request_groups').select('id').eq('original_booking_id', bookingId).maybeSingle()
    declinedAndHeld = group == null
  }

  // Cancellable while still pending, or once accepted but before the Tidy
  // Pro has arrived — once they've arrived, only Report Tidy Pro remains.
  const cancellable =
    declinedAndHeld ||
    booking.status === 'pending' ||
    (booking.status === 'scheduled' && (booking.progress_status == null || booking.progress_status === 'on_the_way'))
  if (!cancellable) return { error: 'This booking can no longer be cancelled.' }

  // "The cleaner asked me to cancel" on an accepted, paid booking: canceled now, but the
  // refund waits for the admin, who checks with both sides and settles it from
  // /admin/incidents (refund, the cleaner's pay, a possible pause).
  if (chosen.reason === 'cleaner_asked' && booking.status === 'scheduled' && booking.stripe_payment_intent_id && booking.tidy_pro_id) {
    const reported = await reportBookingIncident(
      admin,
      { id: booking.id, user_id: session.profileId, tidy_pro_id: booking.tidy_pro_id },
      'cleaner_asked_cancel',
      session.profileId,
      new Date(),
      { details: chosen.note }
    )
    if ('error' in reported) return reported
    await admin.from('bookings').update(reasonFields).eq('id', bookingId)
    await restoreBookingTasks(admin, session.profileId, (booking.task_list as TidyTask[] | null) ?? [])
    // The customer canceled, so only the Tidy Pro is texted.
    await notifyTidyPro(admin, booking.tidy_pro_id, notifyCleanerAskedCancel(customer?.first_name ?? 'The customer', bookingId))
    await notifyCustomer(admin, session.profileId, notifyCleanerAskedCancelConfirmation(), { sms: false })

    revalidatePath(`/pro/messages/${bookingId}`)
    revalidatePath(`/dashboard/messages/${bookingId}`)
    revalidatePath(`/dashboard/bookings/${bookingId}`)
    revalidatePath('/dashboard/messages')
    revalidatePath('/dashboard')
    return { success: true }
  }

  // Only an accepted booking: until a cleaner has committed to it, nobody has held the time.
  // A recurring visit that was never paid has nothing to keep, so canceling it is free.
  const isLate =
    booking.status === 'scheduled' &&
    booking.stripe_payment_intent_id != null &&
    isLateCancellation(booking.scheduled_date, booking.scheduled_time, new Date(), booking.time_zone)
  if (isLate && !acceptLateFee) {
    return { error: 'Your booking is now less than 2 hours away, so canceling refunds 50%. Refresh the page to see your refund.' }
  }

  // On the booking's whole total, including any upcharges they paid.
  let refundId: string | null = null
  if (booking.stripe_payment_intent_id) {
    try {
      refundId = (await refundBookingTotal(admin, booking, isLate ? 'late_cancel' : 'minus_fee')).refundId
    } catch (err) {
      return { error: userFacingError(err, 'Failed to refund this booking.') }
    }
  }

  const { error } = await admin
    .from('bookings')
    .update({
      status: 'cancelled',
      stripe_refund_id: refundId,
      user_unread: false,
      tidy_pro_unread: !declinedAndHeld,
      // A cleaner who canceled first keeps their reason on it.
      ...(booking.cancellation_reason ? {} : reasonFields),
      ...(isLate ? { cancelled_reason: LATE_CANCEL_REASON, cleaner_pay: lateCancelCleanerPay(booking.cleaner_pay ?? 0) } : {}),
    })
    .eq('id', bookingId)
  if (error) return { error: userFacingError(error) }

  await dropPendingUpcharges(admin, bookingId)
  // A recurring visit not charged yet is free to cancel, but tasks added to it were paid for.
  if (booking.status === 'scheduled' && !booking.stripe_payment_intent_id) await refundUpchargesOfUnpaidVisit(admin, bookingId)

  // Pays the cleaner their share now. If the transfer fails, the scheduled job retries it.
  if (isLate) {
    const payout = await completeBookingPayout(admin, bookingId)
    if ('error' in payout) console.error(`Late cancellation payout for ${bookingId}:`, payout.error)
  }

  await restoreBookingTasks(admin, session.profileId, (booking.task_list as TidyTask[] | null) ?? [])

  // The cleaner who declined has already moved on, so they don't need to hear about it.
  const total = booking.total_customer_charge ?? 0
  if (booking.tidy_pro_id && !declinedAndHeld) {
    const firstName = customer?.first_name ?? 'The customer'
    await notifyTidyPro(admin, booking.tidy_pro_id, isLate ? notifyCustomerCancelledLate(firstName, lateCancelCleanerPay(booking.cleaner_pay ?? 0), bookingId) : cancelledPayload)
  }
  // The customer canceled, so only the Tidy Pro is texted.
  await notifyCustomer(admin, session.profileId, isLate ? notifyLateCancelConfirmation(lateCancelRefund(total)) : notifyBookingCancelledConfirmation(), {
    sms: false,
  })

  revalidatePath(`/pro/messages/${bookingId}`)
  revalidatePath(`/dashboard/messages/${bookingId}`)
  revalidatePath(`/dashboard/bookings/${bookingId}`)
  revalidatePath('/dashboard/messages')
  revalidatePath('/dashboard')
  return { success: true }
}

// Approving moves the booking to the suggested time, and accepts it if it was still a
// request. Declining leaves the booking exactly as it was.
export async function respondToTimeProposalAction(
  messageId: string,
  approve: boolean
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const admin = createAdminClient()

  const { data: proposal } = await admin
    .from('booking_messages')
    .select('id, booking_id, kind, proposed_date, proposed_time, proposal_status')
    .eq('id', messageId)
    .maybeSingle()
  if (!proposal || proposal.kind !== 'time_proposal' || !proposal.proposed_date || !proposal.proposed_time) {
    return { error: 'Suggestion not found.' }
  }

  const { data: booking } = await admin
    .from('bookings')
    .select('id, tidy_pro_id, status, progress_status, scheduled_date, scheduled_time, estimated_duration_minutes, time_zone, request_group_id, payment_due_at')
    .eq('id', proposal.booking_id)
    .eq('user_id', session.profileId)
    .maybeSingle()
  if (!booking || !booking.tidy_pro_id) return { error: 'Booking not found.' }
  if (proposal.proposal_status !== 'pending') return { error: 'This suggestion has already been answered.' }

  const bookingId = booking.id
  const tidyProId = booking.tidy_pro_id

  async function answer(status: 'approved' | 'declined'): Promise<boolean> {
    const { data } = await admin
      .from('booking_messages')
      .update({ proposal_status: status })
      .eq('id', messageId)
      .eq('proposal_status', 'pending')
      .select('id')
    return (data?.length ?? 0) > 0
  }

  if (approve) {
    if (!canChangeStartTime(booking)) return { error: 'This booking can no longer be changed.' }
    if (hasAcceptanceWindowClosed(proposal.proposed_date, proposal.proposed_time, new Date(), booking.time_zone)) {
      return { error: 'This suggested time is too soon now. Ask your Tidy Pro for another time.' }
    }

    const newTime = { scheduled_date: proposal.proposed_date, scheduled_time: proposal.proposed_time, reminder_sent_at: null }

    if (booking.status === 'pending') {
      // Move the request to the new time, then accept it through the same database check
      // as the cleaner's Accept button, which refuses a double booking. Put it back if that fails.
      const { error: moveError } = await admin.from('bookings').update(newTime).eq('id', bookingId).eq('status', 'pending')
      if (moveError) return { error: userFacingError(moveError) }

      const { data: outcome, error } = await admin.rpc('accept_booking_request', {
        p_booking_id: bookingId,
        p_tidy_pro_id: tidyProId,
      })
      if (error || outcome !== 'accepted') {
        await admin
          .from('bookings')
          .update({ scheduled_date: booking.scheduled_date, scheduled_time: booking.scheduled_time })
          .eq('id', bookingId)
          .eq('status', 'pending')
        if (error) return { error: userFacingError(error) }
        if (outcome === 'conflict') return { error: 'Your Tidy Pro already has a booking at that time.' }
        if (outcome === 'taken') return { error: 'Another Tidy Pro already accepted this booking.' }
        return { error: 'This booking can no longer be changed.' }
      }
      if (booking.request_group_id) await cancelOtherRequests(admin, booking.request_group_id, bookingId)
      await acceptSeriesForBooking(admin, bookingId, tidyProId)
    } else {
      const conflict = await hasScheduleConflict(admin, tidyProId, bookingId, {
        date: proposal.proposed_date,
        time: proposal.proposed_time,
        durationMinutes: booking.estimated_duration_minutes ?? 60,
      })
      if (conflict) return { error: 'Your Tidy Pro already has a booking at that time.' }

      // An unpaid recurring visit is charged 3 days before its new time instead.
      const paymentDue = isUnpaidVisit(booking)
        ? { payment_due_at: recurringPaymentDueAt(bookingStartInstant(proposal.proposed_date, proposal.proposed_time.slice(0, 5), booking.time_zone ?? undefined)).toISOString() }
        : {}
      const { error } = await admin
        .from('bookings')
        .update({ ...newTime, ...paymentDue })
        .eq('id', bookingId)
        .eq('status', 'scheduled')
        .is('progress_status', null)
      if (error) return { error: userFacingError(error) }
    }

    await answer('approved')
  } else if (!(await answer('declined'))) {
    return { error: 'This suggestion has already been answered.' }
  }

  await admin.from('bookings').update({ tidy_pro_unread: true, user_unread: false }).eq('id', bookingId)
  await notifyTidyPro(admin, tidyProId, notifyTimeProposalAnswered(approve, bookingId))

  revalidatePath(`/dashboard/messages/${bookingId}`)
  revalidatePath(`/dashboard/bookings/${bookingId}`)
  revalidatePath(`/pro/messages/${bookingId}`)
  revalidatePath('/pro/messages')
  revalidatePath('/dashboard')
  return { success: true }
}

// Rings the customer's phone from Tydio's number, then connects them to their Tidy Pro.
// Neither side sees the other's number.
export async function startCallAction(bookingId: string): Promise<{ success: true; from: string } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }
  return startMaskedCall(createAdminClient(), bookingId, { role: 'USER', profileId: session.profileId })
}

// The customer canceling their added tasks request from the chat while it's still waiting
// on the Tidy Pro: refunded in full, tasks back on the dashboard (lib/bookingTaskAdditions).
export async function cancelTaskAdditionAction(additionId: string): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const result = await withdrawTaskAddition(createAdminClient(), { additionId, customerId: session.profileId })
  if ('error' in result) return result

  revalidatePath(`/dashboard/messages/${result.bookingId}`)
  revalidatePath(`/dashboard/bookings/${result.bookingId}`)
  revalidatePath('/dashboard')
  revalidatePath(`/pro/messages/${result.bookingId}`)
  revalidatePath('/pro/messages')
  return { success: true }
}
