'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { canSendSms, sendSmsForPayload } from '@/lib/sms'
import { sendPushForPayload } from '@/lib/push'
import { notifyNewReview, notifyNoShowReported, notifyNoShowReportedConfirmation } from '@/lib/notifications'
import { sendCleanerReportEscalation } from '@/lib/bookingIncidentEmail'
import { TIDY_PRO_REPORT_CATEGORIES, parseReportInput, reportDescription, reportSeverity } from '@/lib/reportCategories'
import { NO_SHOW_REPORT_AFTER_MINUTES, canReportNoShow } from '@/lib/bookingTime'
import { notifyIncidentCleaner, reportBookingIncident } from '@/lib/bookingIncidents'
import { restoreBookingTasks } from '@/lib/bookingRequestGroups'
import { notifyCustomer } from '@/lib/customerNotifications'
import type { TidyTask } from '@/app/dashboard/types'
import { userFacingError } from '@/lib/userFacingError'
import { blockUser } from '@/lib/userBlocks'
import { payUpcharge } from '@/lib/bookingUpcharges'
import { payForVisit } from '@/lib/recurringPayments'
import { chargeAndSendTip, isValidTipAttemptId } from '@/lib/tipPayout'

const MAX_TIP_PERCENT = 100

export async function reportTidyProAction(
  bookingId: string,
  categoryId: string,
  reasonId: string | null,
  details: string
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const input = parseReportInput(TIDY_PRO_REPORT_CATEGORIES, categoryId, reasonId, details)
  if ('error' in input) return input
  const { choice } = input

  const admin = createAdminClient()

  // "Cleaner didn't show up" on a booking that's still open becomes a no-show incident,
  // even if the cleaner has tapped "I've arrived": they could have tapped it without being
  // there. Too early, or once the job is done, it's logged like any other report.
  if (choice.reason?.id === 'no_show') {
    const noShow = await fileNoShowReport(admin, bookingId, session.profileId, input.details)
    if (noShow !== 'not_eligible') return noShow
  }

  const { data: booking } = await admin
    .from('bookings')
    .select('id, tidy_pro_id')
    .eq('id', bookingId)
    .eq('user_id', session.profileId)
    .maybeSingle()

  if (!booking) return { error: 'Booking not found.' }

  const { error } = await admin.from('risk_events').insert({
    event_type: 'customer_complaint',
    booking_id: bookingId,
    user_id: booking.tidy_pro_id,
    severity: reportSeverity(choice),
    description: reportDescription(choice, input.details),
    metadata: { category: choice.category.id, reason: choice.reason?.id ?? null, note: input.details || null },
    created_by: session.profileId,
  })

  if (error) return { error: userFacingError(error) }

  // The report is saved either way; a failed email shouldn't tell the customer it wasn't.
  await sendCleanerReportEscalation(admin, bookingId, choice, input.details).catch((err) => console.error('Cleaner report escalation email failed', bookingId, err))

  return { success: true }
}

// A no-show can be reported until the job is marked done: before the cleaner sets off, on
// the way, and after "I've arrived" or "Start cleaning", since a cleaner could tap those
// without being there.
const NO_SHOW_REPORTABLE_PROGRESS = new Set<string | null>([null, 'on_the_way', 'arrived', 'cleaning'])

// The booking is canceled and the cleaner flagged, with no money moved: the admin calls both
// sides and settles the refund (and the cleaner's pay) from /admin/incidents. 'not_eligible'
// means it isn't open or it's too early, for a caller that falls back to a plain report.
async function fileNoShowReport(
  admin: ReturnType<typeof createAdminClient>,
  bookingId: string,
  profileId: string,
  details: string | null
): Promise<{ success: true } | { error: string } | 'not_eligible'> {
  const { data: booking } = await admin
    .from('bookings')
    .select('id, user_id, tidy_pro_id, status, progress_status, scheduled_date, scheduled_time, time_zone, task_list')
    .eq('id', bookingId)
    .eq('user_id', profileId)
    .maybeSingle()

  if (!booking) return { error: 'Booking not found.' }
  if (booking.status !== 'scheduled' || !booking.tidy_pro_id || !NO_SHOW_REPORTABLE_PROGRESS.has(booking.progress_status)) return 'not_eligible'
  if (!canReportNoShow(booking.scheduled_date, booking.scheduled_time, new Date(), booking.time_zone)) return 'not_eligible'

  const result = await reportBookingIncident(admin, booking, 'cleaner_no_show', profileId, new Date(), {
    cleanerMarkedArrived: booking.progress_status === 'arrived' || booking.progress_status === 'cleaning',
    details,
  })
  if ('error' in result) return result

  await restoreBookingTasks(admin, booking.user_id, (booking.task_list as TidyTask[] | null) ?? [])
  await notifyCustomer(admin, booking.user_id, notifyNoShowReportedConfirmation())
  await notifyIncidentCleaner(admin, booking.tidy_pro_id, notifyNoShowReported(bookingId))

  revalidatePath(`/dashboard/bookings/${bookingId}`)
  revalidatePath(`/dashboard/messages/${bookingId}`)
  revalidatePath('/dashboard')
  revalidatePath(`/pro/messages/${bookingId}`)
  revalidatePath('/pro/bookings')
  return { success: true }
}

// The "My Tidy Pro didn't show up" button, shown before the cleaner has marked themselves
// arrived. After that, the customer reports it from Report Tidy Pro (see reportTidyProAction).
export async function reportNoShowAction(bookingId: string): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const result = await fileNoShowReport(createAdminClient(), bookingId, session.profileId, null)
  if (result !== 'not_eligible') return result
  return { error: `You can report a no-show ${NO_SHOW_REPORT_AFTER_MINUTES} minutes after your booking’s start time, until the job is complete.` }
}

export async function submitReviewAction(
  bookingId: string,
  rating: number,
  reviewText: string,
  tipPercent: number,
  // One per attempt from the form, so a double tap can't charge the tip twice.
  tipAttemptId?: string
): Promise<{ success: true; tipWarning?: string } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: 'Please choose a star rating.' }
  // Charged off-session to the customer's saved card, so a typo in the custom
  // amount must not go through.
  if (!Number.isFinite(tipPercent) || tipPercent < 0) return { error: 'Please enter a valid tip.' }
  if (tipPercent > MAX_TIP_PERCENT) return { error: "A tip can't be more than the cost of the cleaning." }

  const admin = createAdminClient()

  const { data: booking } = await admin
    .from('bookings')
    .select('id, tidy_pro_id, status, total_customer_charge, stripe_payment_intent_id')
    .eq('id', bookingId)
    .eq('user_id', session.profileId)
    .maybeSingle()

  if (!booking) return { error: 'Booking not found.' }
  if (booking.status !== 'completed') return { error: 'This booking is not complete yet.' }
  if (!booking.tidy_pro_id) return { error: 'This booking has no Tidy Pro on file.' }

  const { data: existingReview } = await admin
    .from('reviews')
    .select('id')
    .eq('booking_id', bookingId)
    .maybeSingle()
  if (existingReview) return { error: 'This booking has already been reviewed.' }

  const trimmedText = reviewText.trim() || null
  const tipAmount =
    tipPercent > 0 && booking.total_customer_charge
      ? Math.round(((booking.total_customer_charge * tipPercent) / 100) * 100) / 100
      : 0

  const { error: reviewError } = await admin.from('reviews').insert({
    booking_id: bookingId,
    user_id: session.profileId,
    tidypro_id: booking.tidy_pro_id,
    rating,
    review_text: trimmedText,
    // Set by chargeAndSendTip once the tip is actually paid.
    tip_amount: 0,
  })
  if (reviewError) return { error: userFacingError(reviewError) }

  const { data: tidyPro } = await admin
    .from('tidypro_profiles')
    .select('rating, review_count, stripe_account_id, stripe_onboarding_completed, phone, sms_consent')
    .eq('id', booking.tidy_pro_id)
    .maybeSingle()

  if (tidyPro) {
    const newCount = tidyPro.review_count + 1
    const newAverage = (tidyPro.rating * tidyPro.review_count + rating) / newCount
    await admin
      .from('tidypro_profiles')
      .update({ rating: newAverage, review_count: newCount })
      .eq('id', booking.tidy_pro_id)
  }

  const reviewPayload = notifyNewReview(bookingId)
  if (canSendSms(tidyPro?.sms_consent ?? null, tidyPro?.phone ?? null)) {
    await sendSmsForPayload(tidyPro!.phone!, reviewPayload).catch(() => {})
  }
  await sendPushForPayload(booking.tidy_pro_id, reviewPayload).catch(() => {})

  // The review/rating stands even if the tip charge fails; they can send it again
  // from the booking (sendTipAction).
  let tipWarning: string | undefined
  if (tipAmount > 0) {
    const tip = await chargeAndSendTip(admin, {
      bookingId,
      customerId: session.profileId,
      tipAmount,
      paymentIntentId: booking.stripe_payment_intent_id,
      attemptId: isValidTipAttemptId(tipAttemptId) ? tipAttemptId : crypto.randomUUID(),
    })
    if ('error' in tip) tipWarning = tip.error
  }

  revalidatePath(`/dashboard/bookings/${bookingId}`)
  revalidatePath('/dashboard')

  return tipWarning ? { success: true, tipWarning } : { success: true }
}

// A tip sent from a completed booking after the review: the first one didn't go
// through, or they didn't tip then. Once a tip is on the booking there's no second one.
export async function sendTipAction(
  bookingId: string,
  tipPercent: number,
  attemptId: string
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }
  if (!Number.isFinite(tipPercent) || tipPercent <= 0) return { error: 'Please choose a tip.' }
  if (tipPercent > MAX_TIP_PERCENT) return { error: "A tip can't be more than the cost of the cleaning." }
  if (!isValidTipAttemptId(attemptId)) return { error: 'Please refresh the page and try again.' }

  const admin = createAdminClient()
  const { data: booking } = await admin
    .from('bookings')
    .select('id, tidy_pro_id, status, total_customer_charge, stripe_payment_intent_id, tip')
    .eq('id', bookingId)
    .eq('user_id', session.profileId)
    .maybeSingle()

  if (!booking) return { error: 'Booking not found.' }
  if (booking.status !== 'completed') return { error: 'This booking is not complete yet.' }
  if (!booking.tidy_pro_id) return { error: 'This booking has no Tidy Pro on file.' }
  if ((booking.tip ?? 0) > 0) return { error: 'You’ve already tipped for this booking. Thank you!' }

  const tipAmount = booking.total_customer_charge ? Math.round(((booking.total_customer_charge * tipPercent) / 100) * 100) / 100 : 0
  if (tipAmount <= 0) return { error: 'Please choose a tip.' }

  const result = await chargeAndSendTip(admin, {
    bookingId,
    customerId: session.profileId,
    tipAmount,
    paymentIntentId: booking.stripe_payment_intent_id,
    attemptId,
  })
  if ('error' in result) return result

  revalidatePath(`/dashboard/bookings/${bookingId}`)
  revalidatePath('/dashboard')
  return { success: true }
}

// The customer paying an upcharge the Tydio team added (see lib/bookingUpcharges).
// paymentFailed means the card itself was declined, so they're asked to pick another.
export async function payUpchargeAction(
  bookingId: string,
  upchargeId: string,
  paymentMethodId: string,
  expectedCents: number,
  attemptId: string
): Promise<{ success: true } | { error: string; paymentFailed?: true }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }
  if (!Number.isInteger(expectedCents) || expectedCents <= 0 || !/^[\w-]{8,64}$/.test(attemptId)) return { error: 'Please refresh the page and try again.' }

  const result = await payUpcharge(createAdminClient(), { customerId: session.profileId, upchargeId, paymentMethodId, expectedCents, attemptId })
  if ('error' in result) return result

  revalidatePath(`/dashboard/bookings/${bookingId}`)
  revalidatePath('/dashboard/bookings')
  revalidatePath('/dashboard')
  revalidatePath(`/pro/bookings/${bookingId}`)
  revalidatePath(`/pro/messages/${bookingId}`)
  revalidatePath('/pro/dashboard')
  return { success: true }
}

// The customer paying for a recurring visit whose automatic charge failed (see
// lib/recurringPayments). A visit on hold also needs the new date and time they chose,
// checked again against the Tidy Pro's schedule before anything is charged.
export async function payRecurringVisitAction(
  bookingId: string,
  paymentMethodId: string,
  expectedCents: number,
  attemptId: string,
  newSlot: { date: string; time: string } | null
): Promise<{ success: true } | { error: string; paymentFailed?: true }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }
  if (!Number.isInteger(expectedCents) || expectedCents <= 0 || !/^[\w-]{8,64}$/.test(attemptId)) return { error: 'Please refresh the page and try again.' }

  const result = await payForVisit(createAdminClient(), {
    bookingId,
    paymentMethodId,
    attemptId,
    customer: { id: session.profileId, expectedCents, newSlot },
  })
  if ('error' in result) return result

  revalidatePath(`/dashboard/bookings/${bookingId}`)
  revalidatePath('/dashboard/bookings')
  revalidatePath('/dashboard')
  revalidatePath(`/pro/bookings/${bookingId}`)
  revalidatePath(`/pro/messages/${bookingId}`)
  revalidatePath('/pro/dashboard')
  return { success: true }
}

// "Block Tidy Pro" at the bottom of the report sheet (lib/userBlocks): from then on,
// neither of them can message the other, and this customer can't send them requests.
export async function blockTidyProAction(bookingId: string): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const admin = createAdminClient()
  const { data: booking } = await admin
    .from('bookings')
    .select('id, tidy_pro_id')
    .eq('id', bookingId)
    .eq('user_id', session.profileId)
    .maybeSingle()
  if (!booking?.tidy_pro_id) return { error: 'Booking not found.' }

  const result = await blockUser(admin, session.profileId, booking.tidy_pro_id, bookingId)
  if ('error' in result) return result

  revalidatePath(`/dashboard/bookings/${bookingId}`)
  revalidatePath(`/dashboard/messages/${bookingId}`)
  revalidatePath(`/pro/messages/${bookingId}`)
  return { success: true }
}
