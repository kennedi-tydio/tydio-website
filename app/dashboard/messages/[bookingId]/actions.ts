'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendBookingMessage } from '@/lib/bookings'
import { cancelGroupForCustomer, cancelOtherRequests, refundBookingPayment, restoreBookingTasks } from '@/lib/bookingRequestGroups'
import { hasAcceptanceWindowClosed } from '@/lib/bookingTime'
import { canChangeStartTime, hasScheduleConflict } from '@/lib/bookingTimeProposals'
import type { TidyTask } from '@/app/dashboard/types'
import { canSendSms, sendSmsForPayload } from '@/lib/sms'
import { sendPushForPayload } from '@/lib/push'
import {
  notifyBookingCancelledConfirmation,
  notifyCustomerCancelled,
  notifyNewMessage,
  notifyTimeProposalAnswered,
} from '@/lib/notifications'
import { notifyCustomer } from '@/lib/customerNotifications'

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

export async function cancelBookingRequestAction(
  bookingId: string
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const admin = createAdminClient()

  const { data: booking } = await admin
    .from('bookings')
    .select('id, tidy_pro_id, status, progress_status, stripe_payment_intent_id, stripe_refund_id, request_group_id, task_list')
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
    await Promise.all(result.tidyProIds.map((id) => notifyTidyPro(admin, id, cancelledPayload)))
    await notifyCustomer(admin, session.profileId, notifyBookingCancelledConfirmation())

    revalidatePath('/dashboard/messages')
    revalidatePath('/dashboard')
    return { success: true }
  }

  // A declined booking whose payment is still held, where no replacements were chosen.
  // Once they have been, the customer cancels from those requests instead.
  let declinedAndHeld = false
  if (booking.status === 'declined' && !booking.request_group_id && !booking.stripe_refund_id) {
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

  let refundId: string | null = null
  if (booking.stripe_payment_intent_id) {
    try {
      refundId = await refundBookingPayment(booking.stripe_payment_intent_id)
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to refund this booking.' }
    }
  }

  const { error } = await admin
    .from('bookings')
    .update({ status: 'cancelled', stripe_refund_id: refundId, user_unread: false, tidy_pro_unread: !declinedAndHeld })
    .eq('id', bookingId)
  if (error) return { error: error.message }

  await restoreBookingTasks(admin, session.profileId, (booking.task_list as TidyTask[] | null) ?? [])

  // The cleaner who declined has already moved on, so they don't need to hear about it.
  if (booking.tidy_pro_id && !declinedAndHeld) await notifyTidyPro(admin, booking.tidy_pro_id, cancelledPayload)
  await notifyCustomer(admin, session.profileId, notifyBookingCancelledConfirmation())

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
    .select('id, tidy_pro_id, status, progress_status, scheduled_date, scheduled_time, estimated_duration_minutes, time_zone, request_group_id')
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
      if (moveError) return { error: moveError.message }

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
        if (error) return { error: error.message }
        if (outcome === 'conflict') return { error: 'Your Tidy Pro already has a booking at that time.' }
        if (outcome === 'taken') return { error: 'Another Tidy Pro already accepted this booking.' }
        return { error: 'This booking can no longer be changed.' }
      }
      if (booking.request_group_id) await cancelOtherRequests(admin, booking.request_group_id, bookingId)
    } else {
      const conflict = await hasScheduleConflict(admin, tidyProId, bookingId, {
        date: proposal.proposed_date,
        time: proposal.proposed_time,
        durationMinutes: booking.estimated_duration_minutes ?? 60,
      })
      if (conflict) return { error: 'Your Tidy Pro already has a booking at that time.' }

      const { error } = await admin
        .from('bookings')
        .update(newTime)
        .eq('id', bookingId)
        .eq('status', 'scheduled')
        .is('progress_status', null)
      if (error) return { error: error.message }
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
