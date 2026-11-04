'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { startMaskedCall } from '@/lib/maskedCalls'
import { completeBookingPayout, sendBookingMessage } from '@/lib/bookings'
import type { TidyTask } from '@/app/dashboard/types'
import {
  CLEANER_CANCELLED_REASON,
  cancelOtherRequests,
  closeGroupIfNoRequestsLeft,
  refundBookingInFull,
  restoreBookingTasks,
} from '@/lib/bookingRequestGroups'
import { canReportNoAccess, hasAcceptanceWindowClosed } from '@/lib/bookingTime'
import { reportBookingIncident } from '@/lib/bookingIncidents'
import { canChangeStartTime, proposedTimeInBookingZone, withdrawPendingProposals } from '@/lib/bookingTimeProposals'
import { notifyCustomer } from '@/lib/customerNotifications'
import {
  notifyBookingAccepted,
  notifyBookingDeclined,
  notifyCleanerCancelled,
  notifyCleanerCancelledRefunded,
  notifyCustomerNoAccess,
  notifyOnTheWay,
  notifyBookingDone,
  notifyNewMessage,
  notifyNewTimeProposed,
} from '@/lib/notifications'
import { userFacingError } from '@/lib/userFacingError'
import { bookingBlockedBySuspension } from '@/lib/accountSuspension'

export async function sendMessageAction(bookingId: string, body: string): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const admin = createAdminClient()

  const { data: booking } = await admin
    .from('bookings')
    .select('id, user_id')
    .eq('id', bookingId)
    .eq('tidy_pro_id', session.profileId)
    .maybeSingle()

  if (!booking) return { error: 'Booking not found.' }

  const result = await sendBookingMessage(admin, bookingId, 'TIDYPRO', body)
  if ('error' in result) return result

  await notifyCustomer(admin, booking.user_id, notifyNewMessage('USER', bookingId), { email: false })

  revalidatePath(`/pro/messages/${bookingId}`)
  revalidatePath(`/dashboard/messages/${bookingId}`)
  revalidatePath('/dashboard/messages')
  return { success: true }
}

async function loadOwnedPendingBooking(admin: ReturnType<typeof createAdminClient>, bookingId: string, tidyProId: string) {
  const { data } = await admin
    .from('bookings')
    .select('id, user_id, status, request_group_id, scheduled_date, scheduled_time, time_zone')
    .eq('id', bookingId)
    .eq('tidy_pro_id', tidyProId)
    .maybeSingle()
  return data
}

export async function acceptBookingRequestAction(bookingId: string): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const admin = createAdminClient()
  const suspended = await bookingBlockedBySuspension(admin, session.profileId)
  if (suspended) return { error: suspended }

  const booking = await loadOwnedPendingBooking(admin, bookingId, session.profileId)
  if (!booking) return { error: 'Booking not found.' }
  if (booking.status !== 'pending') return { error: 'This request has already been resolved.' }

  // The expiry job may not have run yet, so don't rely on it having closed this.
  if (hasAcceptanceWindowClosed(booking.scheduled_date, booking.scheduled_time, new Date(), booking.time_zone)) {
    return { error: 'This request has expired. Bookings must be accepted at least an hour before they start.' }
  }

  // One transaction in the database: refuses if the cleaner already has an accepted
  // booking at this time, and for a request sent to several cleaners, only the first
  // to accept gets it. See migration 031.
  const { data: outcome, error } = await admin.rpc('accept_booking_request', {
    p_booking_id: bookingId,
    p_tidy_pro_id: session.profileId,
  })

  if (error) return { error: userFacingError(error) }
  if (outcome === 'conflict') return { error: 'You already have a booking at this time, so you can’t accept this one.' }
  if (outcome === 'taken') return { error: 'Another Tidy Pro accepted this booking first.' }
  if (outcome === 'not_pending') return { error: 'This request has already been resolved.' }
  if (outcome !== 'accepted') return { error: 'Booking not found.' }

  if (booking.request_group_id) await cancelOtherRequests(admin, booking.request_group_id, bookingId)
  await withdrawPendingProposals(admin, bookingId)

  const { data: proProfile } = await admin.from('profiles').select('first_name').eq('id', session.profileId).maybeSingle()
  await notifyCustomer(admin, booking.user_id, notifyBookingAccepted(proProfile?.first_name ?? 'Your Tidy Pro', bookingId))

  revalidatePath(`/pro/messages/${bookingId}`)
  revalidatePath('/pro/messages')
  revalidatePath('/dashboard')
  return { success: true }
}

// `time` is "HH:MM" as the cleaner sees it, on the day they see the booking.
export async function proposeStartTimeAction(bookingId: string, time: string): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { error: 'Please choose a start time.' }

  const admin = createAdminClient()

  const { data: booking } = await admin
    .from('bookings')
    .select('id, user_id, status, progress_status, scheduled_date, scheduled_time, time_zone')
    .eq('id', bookingId)
    .eq('tidy_pro_id', session.profileId)
    .maybeSingle()

  if (!booking || !booking.scheduled_date || !booking.scheduled_time) return { error: 'Booking not found.' }
  if (!canChangeStartTime(booking)) return { error: 'The start time can no longer be changed for this booking.' }

  const { data: tidyPro } = await admin.from('tidypro_profiles').select('time_zone').eq('id', session.profileId).maybeSingle()
  const proposed = proposedTimeInBookingZone(
    { scheduled_date: booking.scheduled_date, scheduled_time: booking.scheduled_time, time_zone: booking.time_zone },
    tidyPro?.time_zone ?? null,
    time
  )

  if (proposed.date === booking.scheduled_date && proposed.time === booking.scheduled_time.slice(0, 5)) {
    return { error: 'That’s already the start time. Choose a different time.' }
  }
  if (hasAcceptanceWindowClosed(proposed.date, proposed.time, new Date(), booking.time_zone)) {
    return { error: 'Please choose a start time at least an hour from now.' }
  }

  await withdrawPendingProposals(admin, bookingId)

  const { error } = await admin.from('booking_messages').insert({
    booking_id: bookingId,
    sender_role: 'TIDYPRO',
    body: 'Suggested a new start time',
    kind: 'time_proposal',
    proposed_date: proposed.date,
    proposed_time: proposed.time,
    proposal_status: 'pending',
  })
  if (error) return { error: userFacingError(error) }

  await admin.from('bookings').update({ user_unread: true }).eq('id', bookingId)

  const { data: proProfile } = await admin.from('profiles').select('first_name').eq('id', session.profileId).maybeSingle()
  await notifyCustomer(admin, booking.user_id, notifyNewTimeProposed(proProfile?.first_name ?? 'Your Tidy Pro', bookingId))

  revalidatePath(`/pro/messages/${bookingId}`)
  revalidatePath(`/dashboard/messages/${bookingId}`)
  revalidatePath('/dashboard/messages')
  return { success: true }
}

export async function markOnTheWayAction(bookingId: string): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const admin = createAdminClient()
  const { data: booking } = await admin
    .from('bookings')
    .select('id, user_id, status')
    .eq('id', bookingId)
    .eq('tidy_pro_id', session.profileId)
    .maybeSingle()

  if (!booking) return { error: 'Booking not found.' }
  if (booking.status !== 'scheduled') return { error: 'This booking has not been accepted yet.' }

  const { error } = await admin.from('bookings').update({ progress_status: 'on_the_way' }).eq('id', bookingId)
  if (error) return { error: userFacingError(error) }

  const { data: proProfile } = await admin.from('profiles').select('first_name').eq('id', session.profileId).maybeSingle()
  await notifyCustomer(admin, booking.user_id, notifyOnTheWay(proProfile?.first_name ?? 'Your Tidy Pro', bookingId))

  revalidatePath(`/pro/messages/${bookingId}`)
  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/bookings/${bookingId}`)
  return { success: true }
}

// The next three progress steps have no cleaner-side UI yet (that's later
// work) — they exist now so the customer tracking view and payment plumbing
// have real state to key off of, and so a future "arrived"/"start
// cleaning"/"finish job" UI has something to call.

export async function markArrivedAction(bookingId: string): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const admin = createAdminClient()
  const { data: booking } = await admin
    .from('bookings')
    .select('id, status, progress_status')
    .eq('id', bookingId)
    .eq('tidy_pro_id', session.profileId)
    .maybeSingle()

  if (!booking) return { error: 'Booking not found.' }
  if (booking.status !== 'scheduled' || booking.progress_status !== 'on_the_way') {
    return { error: 'This booking is not on the way yet.' }
  }

  const { error } = await admin.from('bookings').update({ progress_status: 'arrived', arrived_at: new Date().toISOString() }).eq('id', bookingId)
  if (error) return { error: userFacingError(error) }

  revalidatePath(`/pro/messages/${bookingId}`)
  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/bookings/${bookingId}`)
  return { success: true }
}

export async function startCleaningAction(bookingId: string): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const admin = createAdminClient()
  const { data: booking } = await admin
    .from('bookings')
    .select('id, status, progress_status')
    .eq('id', bookingId)
    .eq('tidy_pro_id', session.profileId)
    .maybeSingle()

  if (!booking) return { error: 'Booking not found.' }
  if (booking.status !== 'scheduled' || booking.progress_status !== 'arrived') {
    return { error: 'This booking has not arrived yet.' }
  }

  const { error } = await admin.from('bookings').update({ progress_status: 'cleaning' }).eq('id', bookingId)
  if (error) return { error: userFacingError(error) }

  revalidatePath(`/pro/messages/${bookingId}`)
  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/bookings/${bookingId}`)
  return { success: true }
}

export async function markBookingDoneAction(bookingId: string): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const admin = createAdminClient()
  const { data: booking } = await admin
    .from('bookings')
    .select('id, user_id, status, progress_status')
    .eq('id', bookingId)
    .eq('tidy_pro_id', session.profileId)
    .maybeSingle()

  if (!booking) return { error: 'Booking not found.' }
  if (booking.status !== 'scheduled' || booking.progress_status !== 'cleaning') {
    return { error: 'This booking has not started cleaning yet.' }
  }

  const { error } = await admin.from('bookings').update({ progress_status: 'done' }).eq('id', bookingId)
  if (error) return { error: userFacingError(error) }

  // Marking progress_status 'done' is the real completion signal — this
  // immediately processes the payout rather than waiting for someone to
  // later load a page that self-heals it (see completeBookingPayout).
  const result = await completeBookingPayout(admin, bookingId)

  // The service happened regardless of whether the payout itself
  // succeeded — the review-prompt notification should fire either way.
  await notifyCustomer(admin, booking.user_id, notifyBookingDone(bookingId))

  revalidatePath(`/pro/messages/${bookingId}`)
  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/bookings/${bookingId}`)
  return result
}

export async function declineBookingRequestAction(bookingId: string): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const admin = createAdminClient()
  const booking = await loadOwnedPendingBooking(admin, bookingId, session.profileId)
  if (!booking) return { error: 'Booking not found.' }
  if (booking.status !== 'pending') return { error: 'This request has already been resolved.' }

  await withdrawPendingProposals(admin, bookingId)

  // The customer's payment backs every request in a group, so one cleaner declining
  // mustn't touch it. The customer only hears about it if nobody is left to accept.
  if (booking.request_group_id) {
    const { error } = await admin
      .from('bookings')
      .update({ decision_status: 'declined', status: 'declined', tidy_pro_unread: false })
      .eq('id', bookingId)
    if (error) return { error: userFacingError(error) }

    await closeGroupIfNoRequestsLeft(admin, booking.request_group_id)

    revalidatePath(`/pro/messages/${bookingId}`)
    revalidatePath('/pro/messages')
    return { success: true }
  }

  // The payment stays where it is: the customer can send this to other cleaners with no
  // new charge. It's refunded if they cancel, or when the booking time arrives.
  const { error } = await admin
    .from('bookings')
    .update({ decision_status: 'declined', status: 'declined', tidy_pro_unread: false, user_unread: true })
    .eq('id', bookingId)
  if (error) return { error: userFacingError(error) }

  await notifyCustomer(admin, booking.user_id, notifyBookingDeclined(bookingId))

  revalidatePath(`/pro/messages/${bookingId}`)
  revalidatePath('/pro/messages')
  return { success: true }
}

// A cleaner backing out of a booking they accepted, any time before they arrive. With an
// hour or more to go, the booking goes back to the customer like a decline: their payment
// stays held, and they can choose up to 3 other cleaners, whoever accepts being paid from
// it when they finish. Any later and there's no time for anyone else to accept, so the
// customer is refunded in full. decision_status stays 'accepted', which keeps a canceled
// replacement visible to the customer (see isHiddenGroupRequest).
export async function cancelAcceptedBookingAction(bookingId: string): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const admin = createAdminClient()
  const { data: booking } = await admin
    .from('bookings')
    .select('id, user_id, status, progress_status, scheduled_date, scheduled_time, time_zone, stripe_payment_intent_id, task_list')
    .eq('id', bookingId)
    .eq('tidy_pro_id', session.profileId)
    .maybeSingle()

  if (!booking) return { error: 'Booking not found.' }
  if (booking.status !== 'scheduled' || (booking.progress_status != null && booking.progress_status !== 'on_the_way')) {
    return { error: 'This booking can no longer be canceled.' }
  }

  const { data: proProfile } = await admin.from('profiles').select('first_name').eq('id', session.profileId).maybeSingle()
  const cleanerName = proProfile?.first_name ?? 'Your Tidy Pro'
  const tooLateToReplace = hasAcceptanceWindowClosed(booking.scheduled_date, booking.scheduled_time, new Date(), booking.time_zone)

  await withdrawPendingProposals(admin, bookingId)

  if (tooLateToReplace) {
    let refundId: string | null = null
    if (booking.stripe_payment_intent_id) {
      try {
        refundId = await refundBookingInFull(booking.stripe_payment_intent_id)
      } catch (err) {
        return { error: userFacingError(err, 'Failed to refund this booking.') }
      }
    }

    const { data: updated, error } = await admin
      .from('bookings')
      .update({ status: 'cancelled', cancelled_reason: CLEANER_CANCELLED_REASON, progress_status: null, stripe_refund_id: refundId, user_unread: true, tidy_pro_unread: false })
      .eq('id', bookingId)
      .eq('status', 'scheduled')
      .select('id')
    if (error) return { error: userFacingError(error) }
    if (!updated?.length) return { error: 'This booking can no longer be canceled.' }

    await restoreBookingTasks(admin, booking.user_id, (booking.task_list as TidyTask[] | null) ?? [])
    await notifyCustomer(admin, booking.user_id, notifyCleanerCancelledRefunded(cleanerName))
  } else {
    const { data: updated, error } = await admin
      .from('bookings')
      .update({ status: 'declined', cancelled_reason: CLEANER_CANCELLED_REASON, progress_status: null, user_unread: true, tidy_pro_unread: false })
      .eq('id', bookingId)
      .eq('status', 'scheduled')
      .select('id')
    if (error) return { error: userFacingError(error) }
    if (!updated?.length) return { error: 'This booking can no longer be canceled.' }

    await notifyCustomer(admin, booking.user_id, notifyCleanerCancelled(cleanerName, bookingId))
  }

  revalidatePath(`/pro/messages/${bookingId}`)
  revalidatePath('/pro/messages')
  revalidatePath('/pro/bookings')
  revalidatePath(`/dashboard/messages/${bookingId}`)
  revalidatePath(`/dashboard/bookings/${bookingId}`)
  revalidatePath('/dashboard')
  return { success: true }
}

// The cleaner arrived but couldn't get in, and has waited NO_ACCESS_WAIT_MINUTES past the
// start or their arrival, whichever was later. The booking is canceled with no money
// moved; the admin settles the refund and their pay (see lib/bookingIncidents).
export async function reportNoAccessAction(bookingId: string): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const admin = createAdminClient()
  const { data: booking } = await admin
    .from('bookings')
    .select('id, user_id, tidy_pro_id, status, progress_status, scheduled_date, scheduled_time, time_zone, arrived_at, task_list')
    .eq('id', bookingId)
    .eq('tidy_pro_id', session.profileId)
    .maybeSingle()

  if (!booking) return { error: 'Booking not found.' }
  if (booking.status !== 'scheduled' || booking.progress_status !== 'arrived') {
    return { error: 'You can only report this once you’ve arrived.' }
  }
  if (!canReportNoAccess(booking.scheduled_date, booking.scheduled_time, booking.arrived_at, new Date(), booking.time_zone)) {
    return { error: 'Please wait the full 15 minutes before reporting this.' }
  }

  const result = await reportBookingIncident(admin, booking, 'no_access', session.profileId)
  if ('error' in result) return result

  await restoreBookingTasks(admin, booking.user_id, (booking.task_list as TidyTask[] | null) ?? [])
  await notifyCustomer(admin, booking.user_id, notifyCustomerNoAccess())

  revalidatePath(`/pro/messages/${bookingId}`)
  revalidatePath(`/pro/bookings/${bookingId}`)
  revalidatePath('/pro/messages')
  revalidatePath('/pro/bookings')
  revalidatePath('/pro/dashboard')
  revalidatePath(`/dashboard/bookings/${bookingId}`)
  revalidatePath('/dashboard')
  return { success: true }
}

// Rings the Tidy Pro's phone from Tydio's number, then connects them to the customer.
// Neither side sees the other's number.
export async function startCallAction(bookingId: string): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }
  return startMaskedCall(createAdminClient(), bookingId, { role: 'TIDYPRO', profileId: session.profileId })
}
