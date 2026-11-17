'use server'

import { revalidatePath } from 'next/cache'
import { acceptSeriesForBooking, dropSeriesForTidyPro } from '@/lib/recurringBookings'
import { cancelBookingForTidyPro, declineRequestForTidyPro, upcomingSeriesVisits } from '@/lib/tidyProCancellation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { startMaskedCall } from '@/lib/maskedCalls'
import { completeBookingPayout, sendBookingMessage } from '@/lib/bookings'
import type { TidyTask } from '@/app/dashboard/types'
import {
  cancelOtherRequests,
  restoreBookingTasks,
} from '@/lib/bookingRequestGroups'
import {
  NO_ACCESS_WAIT_MINUTES,
  ON_THE_WAY_TOO_EARLY_MESSAGE,
  START_BOOKING_WINDOW_MINUTES,
  bookingStartInstant,
  canReportNoAccess,
  hasAcceptanceWindowClosed,
} from '@/lib/bookingTime'
import { startNoAccessCountdown, revalidateNoAccessPaths } from '@/lib/noAccessCountdown'
import { reportBookingIncident } from '@/lib/bookingIncidents'
import { canChangeStartTime, proposedTimeInBookingZone, withdrawPendingProposals } from '@/lib/bookingTimeProposals'
import { notifyCustomer } from '@/lib/customerNotifications'
import {
  notifyBookingAccepted,
  notifyCustomerNoAccess,
  notifyOnTheWay,
  notifyBookingDone,
  notifyNewMessage,
  notifyNewTimeProposed,
} from '@/lib/notifications'
import { userFacingError } from '@/lib/userFacingError'
import { prepareTaskPhoto } from '@/lib/tidyProPortfolio'
import { extensionForType } from '@/lib/uploadExtension'
import { COMPLETION_PHOTOS_BUCKET } from '@/lib/taskPhotoRetention'
import { UPCHARGE_HOLD_MESSAGE } from '@/lib/bookingUpcharges'
import { UNPAID_HOLD_MESSAGE } from '@/lib/recurringPayments'
import { CLEANER_CANCEL_REASONS, parseCancellation, type Cancellation } from '@/lib/cancellationReasons'
import { bookingBlockedBySuspension } from '@/lib/accountSuspension'
import { checkAcceptanceRate } from '@/lib/acceptanceRate'
import { acceptTaskAddition, declineTaskAddition } from '@/lib/bookingTaskAdditions'
import { pendingAmendment } from '@/lib/legal/agreementAmendments'

const NO_ACCESS_PHOTO_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const NO_ACCESS_PHOTO_MAX_BYTES = 10 * 1024 * 1024

// Booking requests still reach a Tidy Pro with an unsigned ICA amendment (the
// /pro layouts send them to sign it as soon as they open the app), but they
// can't respond until they've signed, even from a page opened before then.
const UNSIGNED_AMENDMENT_ERROR = 'Please sign the update to your contractor agreement before responding. Reload the page to sign it.'
async function blockedByUnsignedAmendment(admin: ReturnType<typeof createAdminClient>, profileId: string): Promise<string | null> {
  return (await pendingAmendment(admin, profileId)) ? UNSIGNED_AMENDMENT_ERROR : null
}

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
  const unsigned = await blockedByUnsignedAmendment(admin, session.profileId)
  if (unsigned) return { error: unsigned }

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
  // A visit of a recurring booking: accepting it accepts every later visit too.
  await acceptSeriesForBooking(admin, bookingId, session.profileId)
  await withdrawPendingProposals(admin, bookingId)
  await checkAcceptanceRate(admin, session.profileId)

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
  const unsigned = await blockedByUnsignedAmendment(admin, session.profileId)
  if (unsigned) return { error: unsigned }

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
    .select('id, user_id, status, suspended_for_upcharge_at, payment_due_at, scheduled_date, scheduled_time, time_zone')
    .eq('id', bookingId)
    .eq('tidy_pro_id', session.profileId)
    .maybeSingle()

  if (!booking) return { error: 'Booking not found.' }
  if (booking.status !== 'scheduled') return { error: 'This booking has not been accepted yet.' }
  // Opens an hour before the start, same as the buttons. An "anytime" booking has no
  // start time, so it can be started whenever.
  if (booking.scheduled_date && booking.scheduled_time) {
    const opensAt = bookingStartInstant(booking.scheduled_date, booking.scheduled_time, booking.time_zone).getTime() - START_BOOKING_WINDOW_MINUTES * 60 * 1000
    if (Date.now() < opensAt) return { error: ON_THE_WAY_TOO_EARLY_MESSAGE }
  }
  if (booking.suspended_for_upcharge_at) return { error: UPCHARGE_HOLD_MESSAGE }
  // A recurring visit the customer hasn't paid for yet (lib/recurringPayments).
  if (booking.payment_due_at) return { error: UNPAID_HOLD_MESSAGE }

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
    .select('id, status, progress_status, suspended_for_upcharge_at, payment_due_at')
    .eq('id', bookingId)
    .eq('tidy_pro_id', session.profileId)
    .maybeSingle()

  if (!booking) return { error: 'Booking not found.' }
  if (booking.status !== 'scheduled' || booking.progress_status !== 'on_the_way') {
    return { error: 'This booking is not on the way yet.' }
  }
  if (booking.suspended_for_upcharge_at) return { error: UPCHARGE_HOLD_MESSAGE }
  // A recurring visit the customer hasn't paid for yet (lib/recurringPayments).
  if (booking.payment_due_at) return { error: UNPAID_HOLD_MESSAGE }

  const { error } = await admin.from('bookings').update({ progress_status: 'arrived', arrived_at: new Date().toISOString() }).eq('id', bookingId)
  if (error) return { error: userFacingError(error) }

  revalidatePath(`/pro/messages/${bookingId}`)
  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/bookings/${bookingId}`)
  return { success: true }
}

// "Unable to access location": pressed at the door (on the way) or from the task list
// before any task is done. See startNoAccessCountdown.
export async function reportUnableToAccessAction(bookingId: string): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const result = await startNoAccessCountdown(createAdminClient(), bookingId, session.profileId)
  if ('error' in result) return result

  revalidateNoAccessPaths(bookingId)
  return { success: true }
}

export async function startCleaningAction(bookingId: string): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const admin = createAdminClient()
  const { data: booking } = await admin
    .from('bookings')
    .select('id, status, progress_status, suspended_for_upcharge_at, payment_due_at')
    .eq('id', bookingId)
    .eq('tidy_pro_id', session.profileId)
    .maybeSingle()

  if (!booking) return { error: 'Booking not found.' }
  if (booking.status !== 'scheduled' || booking.progress_status !== 'arrived') {
    return { error: 'This booking has not arrived yet.' }
  }
  if (booking.suspended_for_upcharge_at) return { error: UPCHARGE_HOLD_MESSAGE }
  // A recurring visit the customer hasn't paid for yet (lib/recurringPayments).
  if (booking.payment_due_at) return { error: UNPAID_HOLD_MESSAGE }

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
    .select('id, user_id, status, progress_status, suspended_for_upcharge_at, payment_due_at')
    .eq('id', bookingId)
    .eq('tidy_pro_id', session.profileId)
    .maybeSingle()

  if (!booking) return { error: 'Booking not found.' }
  if (booking.status !== 'scheduled' || booking.progress_status !== 'cleaning') {
    return { error: 'This booking has not started cleaning yet.' }
  }
  if (booking.suspended_for_upcharge_at) return { error: UPCHARGE_HOLD_MESSAGE }
  // A recurring visit the customer hasn't paid for yet (lib/recurringPayments).
  if (booking.payment_due_at) return { error: UNPAID_HOLD_MESSAGE }

  const { data: marked, error } = await admin
    .from('bookings')
    .update({ progress_status: 'done' })
    .eq('id', bookingId)
    .is('suspended_for_upcharge_at', null)
    .select('id')
  if (error) return { error: userFacingError(error) }
  // Put on hold between the check above and now.
  if (!marked?.length) return { error: UPCHARGE_HOLD_MESSAGE }

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
  const unsigned = await blockedByUnsignedAmendment(admin, session.profileId)
  if (unsigned) return { error: unsigned }
  const result = await declineRequestForTidyPro(admin, { bookingId, tidyProId: session.profileId })
  if ('error' in result) return result
  await checkAcceptanceRate(admin, session.profileId)

  revalidatePath(`/pro/messages/${bookingId}`)
  revalidatePath('/pro/messages')
  return { success: true }
}

// A cleaner backing out of a booking they accepted, any time before they arrive. The
// rules (replacements, refunds, unpaid recurring visits) are in lib/tidyProCancellation.
export async function cancelAcceptedBookingAction(
  bookingId: string,
  cancellation: Cancellation
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const chosen = parseCancellation(CLEANER_CANCEL_REASONS, cancellation)
  if ('error' in chosen) return chosen

  const admin = createAdminClient()
  const result = await cancelBookingForTidyPro(admin, {
    bookingId,
    tidyProId: session.profileId,
    reason: { cancellation_reason: chosen.reason, cancellation_note: chosen.note },
  })
  if ('error' in result) return result

  revalidateCancelled(bookingId)
  return { success: true }
}

// Dropping a whole recurring booking: no more visits go to this Tidy Pro, every visit of
// it already on their schedule is canceled, and the customer is asked to choose someone
// else (see dropSeriesForTidyPro).
export async function cancelRecurringSeriesAction(
  bookingId: string,
  cancellation: Cancellation
): Promise<{ success: true; cancelled: number } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const chosen = parseCancellation(CLEANER_CANCEL_REASONS, cancellation)
  if ('error' in chosen) return chosen

  const admin = createAdminClient()
  const { data: booking } = await admin
    .from('bookings')
    .select('recurring_booking_id')
    .eq('id', bookingId)
    .eq('tidy_pro_id', session.profileId)
    .maybeSingle()
  if (!booking?.recurring_booking_id) return { error: 'This booking isn\u2019t part of a recurring booking.' }

  const dropped = await dropSeriesForTidyPro(admin, booking.recurring_booking_id, session.profileId)
  if ('error' in dropped) return { error: userFacingError(dropped.error) }

  let cancelled = 0
  for (const visitId of await upcomingSeriesVisits(admin, booking.recurring_booking_id, session.profileId)) {
    const result = await cancelBookingForTidyPro(admin, {
      bookingId: visitId,
      tidyProId: session.profileId,
      reason: { cancellation_reason: chosen.reason, cancellation_note: chosen.note },
    })
    if ('error' in result) console.error(`Canceling recurring visit ${visitId}:`, result.error)
    else cancelled++
    revalidateCancelled(visitId)
  }

  revalidatePath('/dashboard/bookings')
  return { success: true, cancelled }
}

function revalidateCancelled(bookingId: string) {
  revalidatePath(`/pro/messages/${bookingId}`)
  revalidatePath('/pro/messages')
  revalidatePath('/pro/bookings')
  revalidatePath(`/dashboard/messages/${bookingId}`)
  revalidatePath(`/dashboard/bookings/${bookingId}`)
  revalidatePath('/dashboard')
}

// The cleaner arrived but couldn't get in, and has waited NO_ACCESS_WAIT_MINUTES past the
// start or when they pressed "Unable to access location", whichever was later. The booking is canceled with no money
// moved; the admin settles the refund and their pay (see lib/bookingIncidents).
// Before canceling they must take a photo of the location (house or apartment number and
// the whole front of the home). It's kept with the booking for the admin's review.
export async function reportNoAccessAction(bookingId: string, formData: FormData): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const admin = createAdminClient()
  const { data: booking } = await admin
    .from('bookings')
    .select('id, user_id, tidy_pro_id, status, progress_status, scheduled_date, scheduled_time, time_zone, arrived_at, no_access_reported_at, task_list')
    .eq('id', bookingId)
    .eq('tidy_pro_id', session.profileId)
    .maybeSingle()

  if (!booking) return { error: 'Booking not found.' }
  if (booking.status !== 'scheduled' || booking.progress_status !== 'arrived') {
    return { error: 'You can only report this once you’ve arrived.' }
  }
  if (!canReportNoAccess(booking.scheduled_date, booking.scheduled_time, booking.no_access_reported_at ?? booking.arrived_at, new Date(), booking.time_zone)) {
    return { error: `Please wait until the ${NO_ACCESS_WAIT_MINUTES}-minute timer is up before canceling.` }
  }

  const file = formData.get('photo')
  if (!(file instanceof File) || file.size === 0) return { error: 'Take a photo of the location before canceling.' }
  if (!NO_ACCESS_PHOTO_TYPES.includes(file.type)) return { error: 'Please take a JPG, PNG, or WEBP photo.' }
  if (file.size > NO_ACCESS_PHOTO_MAX_BYTES) return { error: 'Photo is too large — please take one under 10MB.' }

  const contentType = file.type === 'image/jpg' ? 'image/jpeg' : file.type
  let prepared: Awaited<ReturnType<typeof prepareTaskPhoto>>
  try {
    // Same handling as task photos: camera metadata comes off the public file, and the
    // location the phone recorded is kept privately on the booking.
    prepared = await prepareTaskPhoto(Buffer.from(await file.arrayBuffer()), contentType)
  } catch {
    return { error: "We couldn't read that photo — please take another." }
  }

  // In the booking's folder, so it's deleted with its other photos (lib/taskPhotoRetention.ts).
  const photoPath = `${bookingId}/no-access-${Date.now()}.${extensionForType(contentType)}`
  const { error: uploadError } = await admin.storage
    .from(COMPLETION_PHOTOS_BUCKET)
    .upload(photoPath, prepared.body, { contentType, upsert: true })
  if (uploadError) return { error: 'Photo upload failed — please try again.' }

  const { error: photoError } = await admin
    .from('bookings')
    .update({
      no_access_photo_url: admin.storage.from(COMPLETION_PHOTOS_BUCKET).getPublicUrl(photoPath).data.publicUrl,
      no_access_photo_latitude: prepared.location?.latitude ?? null,
      no_access_photo_longitude: prepared.location?.longitude ?? null,
    })
    .eq('id', bookingId)
  if (photoError) return { error: userFacingError(photoError) }

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

function revalidateTaskAddition(bookingId: string) {
  revalidatePath(`/pro/messages/${bookingId}`)
  revalidatePath('/pro/messages')
  revalidatePath(`/pro/bookings/${bookingId}`)
  revalidatePath('/pro/dashboard')
  revalidatePath(`/dashboard/bookings/${bookingId}`)
  // The customer's chat: its request card and Booking Summary banner (tasks, time, total).
  revalidatePath(`/dashboard/messages/${bookingId}`)
  revalidatePath('/dashboard')
}

// Accepting a customer's additional task request: the tasks join the booking and its pay
// (see lib/bookingTaskAdditions).
export async function acceptTaskAdditionAction(additionId: string): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const admin = createAdminClient()
  const suspended = await bookingBlockedBySuspension(admin, session.profileId)
  if (suspended) return { error: suspended }

  const result = await acceptTaskAddition(admin, { additionId, tidyProId: session.profileId })
  if ('error' in result) return result
  revalidateTaskAddition(result.bookingId)
  return { success: true }
}

// Declining one: the customer is refunded in full and the tasks go back on their dashboard.
export async function declineTaskAdditionAction(additionId: string): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const result = await declineTaskAddition(createAdminClient(), { additionId, tidyProId: session.profileId })
  if ('error' in result) return result
  revalidateTaskAddition(result.bookingId)
  return { success: true }
}
