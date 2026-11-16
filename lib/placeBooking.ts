import Stripe from 'stripe'
import type { createAdminClient } from '@/lib/supabase/admin'
import { customerPetsSummary } from '@/lib/customerPetsData'
import { stripe } from '@/lib/stripe'
import { getOrCreateStripeCustomerId } from '@/lib/stripe/customer'
import { resolveStatePricing, priceTaskListForState, resolveLocationSquareFootage } from '@/app/dashboard/taskPricing'
import { computeIsTopTidyPro, hasBookingConflict, haversineDistanceMiles } from '@/lib/cleanerMatching'
import type { CleanerMatch } from '@/lib/cleanerMatching'
import { overlapsTimeOff, parseTimeOff } from '@/lib/timeOff'
import { cleanerPayoutForServicePrice, grossUpForStripeFee, servicePriceForCleaner } from '@/lib/pricingRules'
import { stripePercentageForPaymentMethod } from '@/lib/stripe/cardFees'
import { stripePercentageForCardCountry } from '@/lib/pricingRules'
import { cardFailureMessage } from '@/lib/stripe/paymentFailure'
import { canSendSms, sendSmsForPayload } from '@/lib/sms'
import { sendPushForPayload } from '@/lib/push'
import { notifyNewBookingRequest, notifyRecurringVisitScheduled } from '@/lib/notifications'
import { userFacingError } from '@/lib/userFacingError'
import { bookedTaskName, dropUnmatchedLaundryLinks } from '@/lib/laundry'
import { SERVICES_NOT_OFFERED_MESSAGE, providesServices, requiredServicesForTasks } from '@/lib/tidyProServices'
import { getReplacementOptions, validateExtraCleanerSelection } from '@/lib/bookingRequestGroups'
import type { TidyTask } from '@/app/dashboard/types'
import type { ScheduledLocation } from '@/app/book/schedule/actions'

type Admin = ReturnType<typeof createAdminClient>

export interface BookingToPlace {
  customerId: string
  tidyProId: string
  date: string
  time: string
  timeZone: string
  location: ScheduledLocation | null
  // Every task on the draft; only the selected ones are booked.
  taskList: TidyTask[]
  notes: string | null
  entryInstructions: string | null
  suppliesProvided: boolean
  paymentMethodId: string
  // Other Tidy Pros asked at the same time (see lib/bookingRequestGroups).
  extraCleanerIds?: string[]
  // Set when this is one visit of a recurring booking (see lib/recurringBookings).
  recurringBookingId?: string | null
  // Stops a retried run charging the card twice for the same visit.
  idempotencyKey?: string
  stripeMetadata?: Record<string, string>
  // A visit of a recurring booking whose Tidy Pro already accepted the series: it goes
  // straight on their schedule, accepted, and the card is charged at dueAt instead of
  // now (see lib/recurringPayments).
  deferPayment?: { dueAt: Date }
}

// Prices the booking, checks the Tidy Pro can still take it, charges the card, and
// sends the request(s) — the same steps whether the customer is confirming a booking
// themselves or a recurring booking's next visit is being booked for them. Checks that
// need the customer present (push, pets, access) are left to the caller.
//
// Charged before the booking row exists — a declined card should never leave behind a
// booking nobody paid for — and refunded if the row can't be created.
export async function placeBooking(
  admin: Admin,
  input: BookingToPlace
): Promise<{ bookingId: string; total: number; tidyProName: string } | { error: string; paymentFailed?: true }> {
  const deferred = input.deferPayment ?? null
  // An accepted visit has one Tidy Pro, so there's nobody else to ask.
  const extraCleanerIds = deferred ? [] : input.extraCleanerIds ?? []
  const tasks = dropUnmatchedLaundryLinks(input.taskList.filter((t) => t.completed))
  if (tasks.length === 0) return { error: 'No tasks selected.' }

  const { data: profile } = await admin
    .from('profiles')
    .select('service_area_id, city, state, first_name')
    .eq('id', input.customerId)
    .single()

  const statePricing = await resolveStatePricing(admin, profile?.service_area_id ?? null, profile ?? undefined)
  if (!statePricing.configured) return { error: 'Pricing is not available for your area.' }

  // The Tidy Pro sees the pets as they were when the booking was requested.
  const petsText = await customerPetsSummary(admin, input.customerId)

  const squareFootage = await resolveLocationSquareFootage(admin, input.customerId, input.location)

  let breakdown
  try {
    breakdown = priceTaskListForState(tasks, statePricing.state, statePricing.medianFourHourPrice, squareFootage)
  } catch {
    return { error: 'Could not price one of your tasks.' }
  }

  const [{ data: tidyProStats }, { data: tidyProIdentity }] = await Promise.all([
    admin
      .from('tidypro_profiles')
      .select('rating, total_accepted_bookings, latitude, longitude, profile_photo_url, phone, sms_consent, is_away, time_off, services_provided')
      .eq('id', input.tidyProId)
      .maybeSingle(),
    admin.from('profiles').select('first_name, last_name').eq('id', input.tidyProId).maybeSingle(),
  ])

  // They may have gone away after this customer picked them. Checked before the charge.
  if (tidyProStats?.is_away) {
    return { error: 'This Tidy Pro is away right now. Please go back and choose another Tidy Pro.' }
  }

  // Or stopped offering something this booking needs.
  if (tidyProStats && !providesServices(tidyProStats.services_provided, requiredServicesForTasks(tasks))) {
    return { error: SERVICES_NOT_OFFERED_MESSAGE }
  }

  // Or marked this time off.
  if (tidyProStats && overlapsTimeOff(parseTimeOff(tidyProStats.time_off), input.date, input.time, breakdown.total_task_minutes)) {
    return { error: 'This Tidy Pro isn’t available at this time anymore. Please go back and choose another time or Tidy Pro.' }
  }

  // Someone else may have booked this slot since it was picked.
  if (await hasBookingConflict(admin, input.tidyProId, input.date, input.time, breakdown.total_task_minutes)) {
    return { error: 'This Tidy Pro was just booked at this time. Please go back and choose another time or Tidy Pro.' }
  }

  // The others must still be free and able to do everything, checked the same way they
  // were offered. Before the charge, so nobody pays for a request that can't be sent.
  let extraCleaners: CleanerMatch[] = []
  if (extraCleanerIds.length > 0) {
    const options = await getReplacementOptions(admin, {
      tidy_pro_id: input.tidyProId,
      scheduled_location: input.location,
      scheduled_date: input.date,
      scheduled_time: input.time,
      estimated_duration_minutes: breakdown.total_task_minutes,
      task_list: tasks,
    })
    const selectionError = validateExtraCleanerSelection(extraCleanerIds, input.tidyProId, options.map((o) => o.id))
    if (selectionError) return { error: selectionError }
    extraCleaners = extraCleanerIds.map((id) => options.find((o) => o.id === id)!)
  }

  const location = input.location
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

  // An accepted visit may have no card on file any more; it's paid later either way.
  const { data: savedPaymentMethod } = input.paymentMethodId
    ? await admin
        .from('payment_methods')
        .select('stripe_payment_method_id')
        .eq('id', input.paymentMethodId)
        .eq('user_id', input.customerId)
        .maybeSingle()
    : { data: null }

  if (deferred) {
    // Nothing is charged yet. The total is what the series' card would be charged, for
    // showing the customer; the charge itself is worked out for whichever card pays.
    // Without that card (removed since), it's shown at a US card's rate.
    const percentage = savedPaymentMethod?.stripe_payment_method_id
      ? await stripePercentageForPaymentMethod(savedPaymentMethod.stripe_payment_method_id).catch(() => stripePercentageForCardCountry('US'))
      : stripePercentageForCardCountry('US')
    return insertAcceptedVisit(admin, input, deferred.dueAt, {
      tasks,
      breakdown,
      servicePrice,
      totalPrice: grossUpForStripeFee(servicePrice, percentage),
      petsText,
      cleanerName,
      tidyProPhotoUrl: tidyProStats?.profile_photo_url ?? null,
      tidyProContact: tidyProStats,
      customerFirstName: profile?.first_name ?? 'A customer',
    })
  }

  if (!savedPaymentMethod?.stripe_payment_method_id) return { error: 'Payment method not found.' }

  // Stripe's fee for this card, added up front. If the card can't be read, stop rather
  // than guess and charge the wrong amount.
  let totalPrice: number
  try {
    totalPrice = grossUpForStripeFee(servicePrice, await stripePercentageForPaymentMethod(savedPaymentMethod.stripe_payment_method_id))
  } catch {
    return { error: 'We could not verify your card. Please try again.' }
  }

  const stripeCustomerId = await getOrCreateStripeCustomerId(input.customerId)

  let paymentIntent: Stripe.PaymentIntent
  try {
    paymentIntent = await stripe.paymentIntents.create(
      {
        amount: Math.round(totalPrice * 100),
        currency: 'usd',
        customer: stripeCustomerId,
        payment_method: savedPaymentMethod.stripe_payment_method_id,
        off_session: true,
        confirm: true,
        metadata: { profile_id: input.customerId, ...(input.stripeMetadata ?? {}) },
      },
      input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined
    )
  } catch (err) {
    // A problem with the card itself: the customer is prompted to add or pick another.
    const cardMessage = cardFailureMessage(err)
    if (cardMessage) return { error: cardMessage, paymentFailed: true }
    return { error: userFacingError(err, 'Payment failed. Please try again.') }
  }

  // Several cleaners share the one payment through a group, created first so each
  // request can point at it.
  let groupId: string | null = null
  if (extraCleaners.length > 0) {
    const { data: group, error: groupError } = await admin
      .from('booking_request_groups')
      .insert({
        user_id: input.customerId,
        stripe_payment_intent_id: paymentIntent.id,
        amount_cents: Math.round(totalPrice * 100),
      })
      .select('id')
      .single()
    if (groupError || !group) {
      await stripe.refunds.create({ payment_intent: paymentIntent.id }).catch(() => {})
      return { error: userFacingError(groupError, 'Failed to create booking.') }
    }
    groupId = group.id
  }

  const cleaners = [
    { id: input.tidyProId, name: cleanerName, photoUrl: tidyProStats?.profile_photo_url ?? null },
    ...extraCleaners.map((c) => ({ id: c.id, name: c.name, photoUrl: c.photoUrl })),
  ]

  const { data: requests, error } = await admin
    .from('bookings')
    .insert(cleaners.map((cleaner) => ({
      user_id: input.customerId,
      tidy_pro_id: cleaner.id,
      tidy_pro_name: cleaner.name,
      tidy_pro_photo_url: cleaner.photoUrl,
      scheduled_date: input.date,
      scheduled_time: input.time,
      // The customer's time is the source of truth for when this booking happens.
      time_zone: input.timeZone,
      scheduled_location: input.location as never,
      estimated_duration_minutes: breakdown.total_task_minutes,
      task_list: tasks as never,
      pricing_version: breakdown.pricing_version,
      pricing_breakdown: breakdown as never,
      customer_subtotal: breakdown.total_customer_charge,
      total_customer_charge: totalPrice,
      cleaner_pay: cleanerPayoutForServicePrice(servicePrice),
      tip: 0,
      will_provide_supplies: input.suppliesProvided,
      pets: petsText,
      notes: input.notes,
      entry_instructions: input.entryInstructions,
      decision_status: 'pending',
      status: 'pending',
      tidy_pro_unread: true,
      stripe_payment_intent_id: paymentIntent.id,
      request_group_id: groupId,
      recurring_booking_id: input.recurringBookingId ?? null,
    })))
    .select('id, tidy_pro_id')

  const booking = requests?.find((r) => r.tidy_pro_id === input.tidyProId)
  if (error || !requests || !booking) {
    // The charge succeeded but the booking couldn't be created — refund
    // rather than leave the customer charged for nothing.
    await stripe.refunds.create({ payment_intent: paymentIntent.id }).catch(() => {})
    if (groupId) await admin.from('booking_request_groups').delete().eq('id', groupId)
    return { error: userFacingError(error, 'Failed to create booking.') }
  }

  if (groupId) await admin.from('booking_request_groups').update({ primary_booking_id: booking.id }).eq('id', groupId)

  await admin.from('booking_tasks').insert(
    requests.flatMap((request) =>
      tasks.map((task) => ({
        booking_id: request.id,
        task_name: bookedTaskName(task),
        task_category: task.room,
        task_icon: task.room.toLowerCase(),
        is_completed: false,
      }))
    ) as never
  )

  await Promise.all(
    requests.map(async (request) => {
      if (!request.tidy_pro_id) return
      const payload = notifyNewBookingRequest(profile?.first_name ?? 'A customer', request.id)
      const contact =
        request.tidy_pro_id === input.tidyProId
          ? tidyProStats
          : (await admin.from('tidypro_profiles').select('phone, sms_consent').eq('id', request.tidy_pro_id).maybeSingle()).data
      if (canSendSms(contact?.sms_consent ?? null, contact?.phone ?? null)) {
        await sendSmsForPayload(contact!.phone!, payload).catch(() => {})
      }
      await sendPushForPayload(request.tidy_pro_id, payload).catch(() => {})
    })
  )

  return { bookingId: booking.id, total: totalPrice, tidyProName: cleanerName }
}

type PricedVisit = {
  tasks: TidyTask[]
  breakdown: ReturnType<typeof priceTaskListForState>
  servicePrice: number
  totalPrice: number
  petsText: string | null
  cleanerName: string
  tidyProPhotoUrl: string | null
  tidyProContact: { phone: string | null; sms_consent: Parameters<typeof canSendSms>[0] } | null
  customerFirstName: string
}

// A visit of an accepted series: on the Tidy Pro's schedule straight away, accepted, and
// unpaid until dueAt (see lib/recurringPayments).
async function insertAcceptedVisit(
  admin: Admin,
  input: BookingToPlace,
  dueAt: Date,
  visit: PricedVisit
): Promise<{ bookingId: string; total: number; tidyProName: string } | { error: string }> {
  const { data: booking, error } = await admin
    .from('bookings')
    .insert({
      user_id: input.customerId,
      tidy_pro_id: input.tidyProId,
      tidy_pro_name: visit.cleanerName,
      tidy_pro_photo_url: visit.tidyProPhotoUrl,
      scheduled_date: input.date,
      scheduled_time: input.time,
      time_zone: input.timeZone,
      scheduled_location: input.location as never,
      estimated_duration_minutes: visit.breakdown.total_task_minutes,
      task_list: visit.tasks as never,
      pricing_version: visit.breakdown.pricing_version,
      pricing_breakdown: visit.breakdown as never,
      customer_subtotal: visit.breakdown.total_customer_charge,
      total_customer_charge: visit.totalPrice,
      cleaner_pay: cleanerPayoutForServicePrice(visit.servicePrice),
      tip: 0,
      will_provide_supplies: input.suppliesProvided,
      pets: visit.petsText,
      notes: input.notes,
      entry_instructions: input.entryInstructions,
      decision_status: 'accepted',
      status: 'scheduled',
      auto_accepted: true,
      tidy_pro_unread: true,
      user_unread: false,
      amount_due: visit.servicePrice,
      payment_due_at: dueAt.toISOString(),
      recurring_booking_id: input.recurringBookingId ?? null,
    })
    .select('id')
    .single()
  if (error || !booking) return { error: userFacingError(error, 'Failed to create booking.') }

  await admin.from('booking_tasks').insert(
    visit.tasks.map((task) => ({
      booking_id: booking.id,
      task_name: bookedTaskName(task),
      task_category: task.room,
      task_icon: task.room.toLowerCase(),
      is_completed: false,
    })) as never
  )

  const payload = notifyRecurringVisitScheduled(visit.customerFirstName, input.date, booking.id)
  if (canSendSms(visit.tidyProContact?.sms_consent ?? null, visit.tidyProContact?.phone ?? null)) {
    await sendSmsForPayload(visit.tidyProContact!.phone!, payload).catch(() => {})
  }
  await sendPushForPayload(input.tidyProId, payload).catch(() => {})

  return { bookingId: booking.id, total: visit.totalPrice, tidyProName: visit.cleanerName }
}
