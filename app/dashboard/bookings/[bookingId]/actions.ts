'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import { grossUpForStripeFee } from '@/lib/pricingRules'
import { stripePercentageForPaymentMethod } from '@/lib/stripe/cardFees'
import { canSendSms, sendSmsForPayload } from '@/lib/sms'
import { sendPushForPayload } from '@/lib/push'
import { notifyNewReview, notifyNoShowReported, notifyNoShowReportedConfirmation } from '@/lib/notifications'
import { sendCleanerReportEscalation } from '@/lib/bookingIncidentEmail'
import { findCleanerReportCategory } from '@/lib/cleanerReportCategories'
import { canReportNoShow } from '@/lib/bookingTime'
import { notifyIncidentCleaner, reportBookingIncident } from '@/lib/bookingIncidents'
import { restoreBookingTasks } from '@/lib/bookingRequestGroups'
import { notifyCustomer } from '@/lib/customerNotifications'
import type { TidyTask } from '@/app/dashboard/types'
import { userFacingError } from '@/lib/userFacingError'

const MAX_TIP_PERCENT = 100

export async function reportTidyProAction(
  bookingId: string,
  categoryId: string,
  reason: string
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const category = findCleanerReportCategory(categoryId)
  if (!category) return { error: 'Please choose what the issue is about.' }
  const trimmed = reason.trim()
  if (!trimmed) return { error: 'Please describe the issue.' }

  const admin = createAdminClient()

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
    severity: 'medium',
    description: trimmed,
    metadata: { category: category.id },
    created_by: session.profileId,
  })

  if (error) return { error: userFacingError(error) }

  // The report is saved either way; a failed email shouldn't tell the customer it wasn't.
  await sendCleanerReportEscalation(admin, bookingId, category, trimmed).catch((err) => console.error('Cleaner report escalation email failed', bookingId, err))

  return { success: true }
}

// The cleaner still hasn't arrived NO_SHOW_REPORT_AFTER_MINUTES after the start. The
// booking is canceled and the cleaner flagged, with no money moved; the admin settles the
// refund and decides whether to pause them (see lib/bookingIncidents).
export async function reportNoShowAction(bookingId: string): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const admin = createAdminClient()
  const { data: booking } = await admin
    .from('bookings')
    .select('id, user_id, tidy_pro_id, status, progress_status, scheduled_date, scheduled_time, time_zone, task_list')
    .eq('id', bookingId)
    .eq('user_id', session.profileId)
    .maybeSingle()

  if (!booking) return { error: 'Booking not found.' }
  if (booking.status !== 'scheduled' || !booking.tidy_pro_id || (booking.progress_status != null && booking.progress_status !== 'on_the_way')) {
    return { error: 'This booking can no longer be reported as a no-show.' }
  }
  if (!canReportNoShow(booking.scheduled_date, booking.scheduled_time, new Date(), booking.time_zone)) {
    return { error: 'You can report a no-show 30 minutes after your booking’s start time.' }
  }

  const result = await reportBookingIncident(admin, booking, 'cleaner_no_show', session.profileId)
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

export async function submitReviewAction(
  bookingId: string,
  rating: number,
  reviewText: string,
  tipPercent: number
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
    tip_amount: tipAmount,
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

  let tipWarning: string | undefined
  if (tipAmount > 0) {
    try {
      let paymentMethodId: string | undefined
      if (booking.stripe_payment_intent_id) {
        const originalIntent = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id)
        paymentMethodId =
          typeof originalIntent.payment_method === 'string'
            ? originalIntent.payment_method
            : originalIntent.payment_method?.id
      }
      if (!paymentMethodId) throw new Error('No payment method on file for the original booking.')

      const { data: profile } = await admin
        .from('profiles')
        .select('stripe_customer_id')
        .eq('id', session.profileId)
        .single()
      if (!profile?.stripe_customer_id) throw new Error('No Stripe customer on file.')

      // The cleaner gets 100% of tipAmount — Stripe's processing fee is
      // passed through on top rather than taken out of the tip, same as the
      // booking charge (see grossUpForStripeFee).
      const tipChargeAmount = grossUpForStripeFee(tipAmount, await stripePercentageForPaymentMethod(paymentMethodId))
      await stripe.paymentIntents.create({
        amount: Math.round(tipChargeAmount * 100),
        currency: 'usd',
        customer: profile.stripe_customer_id,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        metadata: { booking_id: bookingId, kind: 'tip' },
      })

      if (tidyPro?.stripe_account_id && tidyPro.stripe_onboarding_completed) {
        await stripe.transfers.create({
          amount: Math.round(tipAmount * 100),
          currency: 'usd',
          destination: tidyPro.stripe_account_id,
          transfer_group: `${bookingId}-tip`,
        })
      }

      await admin.from('bookings').update({ tip: tipAmount }).eq('id', bookingId)
    } catch (err) {
      // The review/rating must still succeed even if the tip charge fails.
      tipWarning = userFacingError(err, 'Could not charge the tip.')
    }
  }

  revalidatePath(`/dashboard/bookings/${bookingId}`)
  revalidatePath('/dashboard')

  return tipWarning ? { success: true, tipWarning } : { success: true }
}
