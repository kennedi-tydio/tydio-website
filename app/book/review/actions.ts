'use server'

import { revalidatePath } from 'next/cache'
import Stripe from 'stripe'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { bookingBlockedBySuspension } from '@/lib/accountSuspension'
import { stripe } from '@/lib/stripe'
import { getOrCreateStripeCustomerId } from '@/lib/stripe/customer'
import { resolveStatePricing, priceTaskListForState, resolveLocationSquareFootage } from '@/app/dashboard/taskPricing'
import { computeIsTopTidyPro, hasBookingConflict, haversineDistanceMiles } from '@/lib/cleanerMatching'
import { cleanerPayoutForServicePrice, grossUpForStripeFee, servicePriceForCleaner } from '@/lib/pricingRules'
import type { TidyTask } from '@/app/dashboard/types'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import { DEFAULT_BOOKING_TIME_ZONE, hasAcceptanceWindowClosed, isValidTimeZone } from '@/lib/bookingTime'
import { stripePercentageForPaymentMethod } from '@/lib/stripe/cardFees'
import { canSendSms, sendSmsForPayload } from '@/lib/sms'
import { sendPushForPayload } from '@/lib/push'
import { notifyNewBookingRequest } from '@/lib/notifications'
import { userFacingError } from '@/lib/userFacingError'

async function loadOwnedDraftTasks(
  admin: ReturnType<typeof createAdminClient>,
  draftId: string,
  profileId: string
): Promise<TidyTask[]> {
  const { data } = await admin
    .from('booking_drafts')
    .select('task_list')
    .eq('id', draftId)
    .eq('customer_user_id', profileId)
    .maybeSingle()
  return (data?.task_list as TidyTask[] | null) ?? []
}

export async function updateTaskNoteAction(draftId: string, taskId: string, note: string): Promise<void> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return

  const admin = createAdminClient()
  const tasks = await loadOwnedDraftTasks(admin, draftId, session.profileId)
  const updated = tasks.map((t) => (t.id === taskId ? { ...t, notes: note } : t))

  await admin
    .from('booking_drafts')
    .update({ task_list: updated as never })
    .eq('id', draftId)
    .eq('customer_user_id', session.profileId)

  revalidatePath('/book/review')
}

// "Removing" a task from the booking just unmarks it as selected — the task
// itself stays on the draft so it still shows up (unselected) back on the
// dashboard task list.
export async function removeTaskFromBookingAction(draftId: string, taskId: string): Promise<void> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return

  const admin = createAdminClient()
  const tasks = await loadOwnedDraftTasks(admin, draftId, session.profileId)
  const updated = tasks.map((t) => (t.id === taskId ? { ...t, completed: false } : t))

  await admin
    .from('booking_drafts')
    .update({ task_list: updated as never })
    .eq('id', draftId)
    .eq('customer_user_id', session.profileId)

  revalidatePath('/book/review')
}

export interface DraftDetailsUpdate {
  pets?: string
  notes?: string
  suppliesProvided?: boolean
  giftCode?: string
}

export async function updateDraftDetailsAction(draftId: string, updates: DraftDetailsUpdate): Promise<void> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return

  const payload: { pets?: string; notes?: string; supplies_provided?: boolean; gift_code?: string } = {}
  if (updates.pets !== undefined) payload.pets = updates.pets
  if (updates.notes !== undefined) payload.notes = updates.notes
  if (updates.suppliesProvided !== undefined) payload.supplies_provided = updates.suppliesProvided
  if (updates.giftCode !== undefined) payload.gift_code = updates.giftCode
  if (Object.keys(payload).length === 0) return

  const admin = createAdminClient()
  await admin
    .from('booking_drafts')
    .update(payload)
    .eq('id', draftId)
    .eq('customer_user_id', session.profileId)

  revalidatePath('/book/review')
}

export async function applyPromoCodeAction(
  draftId: string,
  code: string
): Promise<{ error: string } | { success: true }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const trimmed = code.trim()
  if (!trimmed) return { error: 'Enter a promo code.' }

  const admin = createAdminClient()
  const { data: promo } = await admin
    .from('promo_codes')
    .select('id, code, active')
    .ilike('code', trimmed)
    .maybeSingle()

  if (!promo || !promo.active) return { error: 'Invalid promo code. Try again.' }

  await admin
    .from('booking_drafts')
    .update({ gift_code: promo.code })
    .eq('id', draftId)
    .eq('customer_user_id', session.profileId)

  revalidatePath('/book/review')
  return { success: true }
}

// Converts a booking_draft into a real `bookings` row — a pending request
// sent to the Tidy Pro — and clears the draft, matching the same pricing
// logic the review page itself uses so the charged total can't drift from
// what the customer saw. Callers should route to the resulting booking's
// message thread on success.
export async function confirmBookingAction(draftId: string, timeZone?: string): Promise<{ bookingId: string } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const admin = createAdminClient()

  const suspended = await bookingBlockedBySuspension(admin, session.profileId)
  if (suspended) return { error: suspended }

  const { data: draft } = await admin
    .from('booking_drafts')
    .select(
      'id, task_list, scheduled_location, scheduled_date, scheduled_time, selected_tidy_pro_id, pets, notes, supplies_provided, selected_payment_method_id'
    )
    .eq('id', draftId)
    .eq('customer_user_id', session.profileId)
    .maybeSingle()

  if (!draft) return { error: 'Booking request not found.' }
  if (!draft.selected_tidy_pro_id || !draft.scheduled_date || !draft.scheduled_time) {
    return { error: 'Finish scheduling before confirming.' }
  }
  if (!draft.selected_payment_method_id) return { error: 'Select a payment method before confirming.' }
  // A booking inside this window would be auto-canceled as soon as it was made.
  if (hasAcceptanceWindowClosed(draft.scheduled_date, draft.scheduled_time, new Date(), isValidTimeZone(timeZone) ? timeZone : DEFAULT_BOOKING_TIME_ZONE)) {
    return { error: 'Please choose a time at least an hour from now.' }
  }

  const allTasks = (draft.task_list as TidyTask[] | null) ?? []
  const tasks = allTasks.filter((t) => t.completed)
  if (tasks.length === 0) return { error: 'No tasks selected.' }

  const { data: profile } = await admin
    .from('profiles')
    .select('service_area_id, city, state, first_name')
    .eq('id', session.profileId)
    .single()

  const statePricing = await resolveStatePricing(admin, profile?.service_area_id ?? null, profile ?? undefined)
  if (!statePricing.configured) return { error: 'Pricing is not available for your area.' }

  const squareFootage = await resolveLocationSquareFootage(
    admin,
    session.profileId,
    draft.scheduled_location as ScheduledLocation | null
  )

  let breakdown
  try {
    breakdown = priceTaskListForState(tasks, statePricing.state, statePricing.medianFourHourPrice, squareFootage)
  } catch {
    return { error: 'Could not price one of your tasks.' }
  }

  const [{ data: tidyProStats }, { data: tidyProIdentity }] = await Promise.all([
    admin
      .from('tidypro_profiles')
      .select('rating, total_accepted_bookings, latitude, longitude, profile_photo_url, phone, sms_consent, is_away')
      .eq('id', draft.selected_tidy_pro_id)
      .maybeSingle(),
    admin.from('profiles').select('first_name, last_name').eq('id', draft.selected_tidy_pro_id).maybeSingle(),
  ])

  // They may have gone away after this customer picked them. Checked before the charge.
  if (tidyProStats?.is_away) {
    return { error: 'This Tidy Pro is away right now. Please go back and choose another Tidy Pro.' }
  }

  // Someone else may have booked this slot since it was picked.
  if (await hasBookingConflict(admin, draft.selected_tidy_pro_id, draft.scheduled_date, draft.scheduled_time, breakdown.total_task_minutes)) {
    return { error: 'This Tidy Pro was just booked at this time. Please go back and choose another time or Tidy Pro.' }
  }

  const location = draft.scheduled_location as ScheduledLocation | null
  const isTopTidyPro = tidyProStats ? computeIsTopTidyPro(tidyProStats.rating, tidyProStats.total_accepted_bookings) : false
  const distanceMiles =
    location?.latitude != null && location?.longitude != null && tidyProStats?.latitude != null && tidyProStats?.longitude != null
      ? haversineDistanceMiles(
          { latitude: location.latitude, longitude: location.longitude },
          { latitude: tidyProStats.latitude, longitude: tidyProStats.longitude }
        )
      : null

  const servicePrice = servicePriceForCleaner(breakdown.total_customer_charge, { isTopTidyPro, distanceMiles })

  const cleanerName = [tidyProIdentity?.first_name, tidyProIdentity?.last_name].filter(Boolean).join(' ') || 'your Tidy Pro'

  const { data: savedPaymentMethod } = await admin
    .from('payment_methods')
    .select('stripe_payment_method_id')
    .eq('id', draft.selected_payment_method_id)
    .eq('user_id', session.profileId)
    .maybeSingle()

  if (!savedPaymentMethod?.stripe_payment_method_id) return { error: 'Payment method not found.' }

  // Stripe's fee for this card, added up front. If the card can't be read, stop rather
  // than guess and charge the wrong amount.
  let totalPrice: number
  try {
    totalPrice = grossUpForStripeFee(servicePrice, await stripePercentageForPaymentMethod(savedPaymentMethod.stripe_payment_method_id))
  } catch {
    return { error: 'We could not verify your card. Please try again.' }
  }

  const stripeCustomerId = await getOrCreateStripeCustomerId(session.profileId)

  // Charged before the booking row exists — a declined card should never
  // leave behind a booking nobody paid for.
  let paymentIntent: Stripe.PaymentIntent
  try {
    paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalPrice * 100),
      currency: 'usd',
      customer: stripeCustomerId,
      payment_method: savedPaymentMethod.stripe_payment_method_id,
      off_session: true,
      confirm: true,
      metadata: { profile_id: session.profileId, draft_id: draftId },
    })
  } catch (err) {
    const message = err instanceof Stripe.errors.StripeError ? err.message : 'Payment failed. Please try a different card.'
    return { error: message }
  }

  const { data: booking, error } = await admin
    .from('bookings')
    .insert({
      user_id: session.profileId,
      tidy_pro_id: draft.selected_tidy_pro_id,
      tidy_pro_name: cleanerName,
      tidy_pro_photo_url: tidyProStats?.profile_photo_url ?? null,
      scheduled_date: draft.scheduled_date,
      scheduled_time: draft.scheduled_time,
      // The customer's time is the source of truth for when this booking happens.
      time_zone: isValidTimeZone(timeZone) ? timeZone : DEFAULT_BOOKING_TIME_ZONE,
      scheduled_location: draft.scheduled_location,
      estimated_duration_minutes: breakdown.total_task_minutes,
      task_list: tasks as never,
      pricing_version: breakdown.pricing_version,
      pricing_breakdown: breakdown as never,
      customer_subtotal: breakdown.total_customer_charge,
      total_customer_charge: totalPrice,
      cleaner_pay: cleanerPayoutForServicePrice(servicePrice),
      tip: 0,
      will_provide_supplies: draft.supplies_provided,
      pets: draft.pets,
      notes: draft.notes,
      decision_status: 'pending',
      status: 'pending',
      tidy_pro_unread: true,
      stripe_payment_intent_id: paymentIntent.id,
    })
    .select('id')
    .single()

  if (error || !booking) {
    // The charge succeeded but the booking couldn't be created — refund
    // rather than leave the customer charged for nothing.
    await stripe.refunds.create({ payment_intent: paymentIntent.id }).catch(() => {})
    return { error: userFacingError(error, 'Failed to create booking.') }
  }

  await admin.from('booking_tasks').insert(
    tasks.map((task) => ({
      booking_id: booking.id,
      task_name: task.name || task.room,
      task_category: task.room,
      task_icon: task.room.toLowerCase(),
      is_completed: false,
    })) as never
  )

  await admin.from('booking_drafts').delete().eq('id', draftId)

  const payload = notifyNewBookingRequest(profile?.first_name ?? 'A customer', booking.id)
  if (canSendSms(tidyProStats?.sms_consent ?? null, tidyProStats?.phone ?? null)) {
    await sendSmsForPayload(tidyProStats!.phone!, payload).catch(() => {})
  }
  await sendPushForPayload(draft.selected_tidy_pro_id, payload).catch(() => {})

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/messages')
  return { bookingId: booking.id }
}
