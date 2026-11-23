import { customerPetsSummary } from '@/lib/customerPetsData'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveStatePricing, ensurePriceableTasks, resolveLocationSquareFootage } from '@/app/dashboard/taskPricing'
import { bookingDurationMinutes, combineWithFullService, priceTasksPart } from '@/lib/bookingPricing'
import { selectionLabel } from '@/lib/fullService'
import { bookableSelection, buildSnapshot, fullServiceMinutes, quoteForTidyPro } from '@/lib/fullServiceBooking'
import { computeIsTopTidyPro, haversineDistanceMiles, type CleanerMatch } from '@/lib/cleanerMatching'
import { stripePercentageForPaymentMethod } from '@/lib/stripe/cardFees'
import { grossUpForStripeFee, servicePriceForCleaner } from '@/lib/pricingRules'
import type { TidyTask } from '@/app/dashboard/types'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import ReviewRequestView from './ReviewRequestView'
import { dropUnmatchedLaundryLinks } from '@/lib/laundry'
import { signedTaskPhotoUrls } from '@/lib/customerTaskPhotos'
import { getReplacementOptions } from '@/lib/bookingRequestGroups'
import { savedEntryInstructionsForLocation } from '@/lib/entryInstructionsData'
import { recordPricingView, taskLabel } from '@/lib/pricingQuotes'
import { PROMO_UNFUNDED_MESSAGE, describePromoDiscount, promoDiscountAmount } from '@/lib/promoCodes'
import { ensurePromoFunded } from '@/lib/promoFunding'
import { findPromoForCustomer } from '@/lib/promoCodesData'
import { needsQuote } from '@/lib/taskQuotes'

export const metadata: Metadata = { title: 'Review Your Request — Tydio' }

export default async function ReviewPage() {
  const session = await getSession()
  if (!session || session.role !== 'USER') redirect('/login')

  const admin = createAdminClient()

  const { data: draft, error: draftError } = await admin
    .from('booking_drafts')
    .select(
      'id, task_list, full_service, scheduled_location, scheduled_date, scheduled_time, selected_tidy_pro_id, notes, entry_instructions, supplies_provided, gift_code, selected_payment_method_id, recurrence_frequency'
    )
    .eq('customer_user_id', session.profileId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (draftError) throw new Error(`Failed to load booking draft: ${draftError.message}`)
  if (!draft) redirect('/dashboard')

  const allTasks = (draft.task_list as TidyTask[] | null) ?? []
  let tasks = dropUnmatchedLaundryLinks(allTasks.filter((t) => t.completed))
  const fullService = bookableSelection(draft.full_service)
  if (tasks.length === 0 && !fullService) redirect('/dashboard')
  if (!draft.selected_tidy_pro_id || !draft.scheduled_date || !draft.scheduled_time) redirect('/book/schedule')

  const [
    { data: profile, error: profileError },
    { data: tidyProStats },
    { data: tidyProIdentity },
    { data: paymentMethods },
  ] = await Promise.all([
    admin.from('profiles').select('first_name, service_area_id, city, state, booking_access_status').eq('id', session.profileId).single(),
    admin
      .from('tidypro_profiles')
      .select('rating, review_count, is_verified, profile_photo_url, total_accepted_bookings, latitude, longitude')
      .eq('id', draft.selected_tidy_pro_id)
      .maybeSingle(),
    admin.from('profiles').select('first_name, last_name').eq('id', draft.selected_tidy_pro_id).maybeSingle(),
    admin
      .from('payment_methods')
      .select('id, brand:card_brand, last4:card_last4, exp_month:card_exp_month, exp_year:card_exp_year, is_default')
      .eq('user_id', session.profileId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true }),
  ])

  if (profileError) throw new Error(`Failed to load profile: ${profileError.message}`)
  if (!profile) redirect('/login')
  if (profile.booking_access_status !== 'booking_allowed') redirect('/dashboard')

  const statePricing = await resolveStatePricing(admin, profile.service_area_id, profile)
  if (!statePricing.configured) redirect('/dashboard?priceError=state_pricing_not_configured')

  // Backfill any task that's missing a price estimate instead of failing
  // the whole booking over it.
  const repaired = await ensurePriceableTasks(admin, draft.id, allTasks)
  tasks = dropUnmatchedLaundryLinks(repaired.filter((t) => t.completed))

  const location = draft.scheduled_location as ScheduledLocation | null
  // Bookings need a full saved address; send older drafts back to pick one.
  if (location?.type !== 'address') redirect('/book/schedule')
  const squareFootage = await resolveLocationSquareFootage(admin, session.profileId, location)
  // Every booking needs the home's size; the schedule step asks for it.
  if (!squareFootage) redirect('/book/schedule')

  // The chosen Tidy Pro's own price for the Standard / Deep Cleaning. If they
  // can't do it any more (stopped offering it, switched off an add-on), the
  // customer picks someone else.
  const fullServiceQuote = fullService ? await quoteForTidyPro(admin, draft.selected_tidy_pro_id, fullService, squareFootage) : null
  if (fullService && !fullServiceQuote) redirect('/book/schedule')
  const fullServiceDuration = fullService ? await fullServiceMinutes(fullService, squareFootage) : null

  let breakdown
  try {
    breakdown = combineWithFullService(
      priceTasksPart(tasks, statePricing.state, statePricing.medianFourHourPrice, squareFootage),
      fullServiceQuote,
      bookingDurationMinutes(tasks, squareFootage, fullServiceDuration?.minutes ?? 0)
    )
  } catch {
    redirect('/dashboard?priceError=1')
  }

  const savedEntryInstructions = await savedEntryInstructionsForLocation(admin, session.profileId, location)

  const addressName = `${profile.first_name ?? 'Your'}'s ${location.label}`
  const addressLine = location.line

  const isTopTidyPro = tidyProStats ? computeIsTopTidyPro(tidyProStats.rating, tidyProStats.total_accepted_bookings) : false
  const distanceMiles =
    location?.latitude != null && location?.longitude != null && tidyProStats?.latitude != null && tidyProStats?.longitude != null
      ? haversineDistanceMiles(
          { latitude: location.latitude, longitude: location.longitude },
          { latitude: tidyProStats.latitude, longitude: tidyProStats.longitude }
        )
      : null
  const servicePrice = servicePriceForCleaner(breakdown.total_customer_charge, { isTopTidyPro, distanceMiles })

  // The card picked for this booking, or else their default, which confirmBookingAction
  // falls back to the same way.
  const selectedPaymentMethodId = draft.selected_payment_method_id ?? (paymentMethods ?? []).find((pm) => pm.is_default)?.id ?? null

  // The fee depends on the card, so it's worked out for the one they've actually chosen.
  const { data: selectedCard } = selectedPaymentMethodId
    ? await admin.from('payment_methods').select('stripe_payment_method_id').eq('id', selectedPaymentMethodId).eq('user_id', session.profileId).maybeSingle()
    : { data: null }
  const cardPercentage = selectedCard?.stripe_payment_method_id
    ? await stripePercentageForPaymentMethod(selectedCard.stripe_payment_method_id).catch(() => undefined)
    : undefined

  // An applied code that can't be used any more (expired, used up) is shown with why,
  // and the price goes back to full; confirmBookingAction would refuse it the same way.
  let promo = draft.gift_code ? await findPromoForCustomer(admin, draft.gift_code, session.profileId) : null
  // Also if Tydio's Stripe balance can no longer cover the difference (no email from here:
  // it's sent when they apply the code or confirm).
  if (promo && 'promo' in promo) {
    const funded = await ensurePromoFunded(
      admin,
      {
        promo: promo.promo,
        customerId: session.profileId,
        tidyProId: draft.selected_tidy_pro_id,
        date: draft.scheduled_date,
        time: draft.scheduled_time,
        tasks,
        servicePrice,
      },
      null
    )
    if (!funded) promo = { error: PROMO_UNFUNDED_MESSAGE }
  }
  const promoDiscount = promo && 'promo' in promo ? promoDiscountAmount(servicePrice, promo.promo) : 0
  const discountedPrice = Math.round((servicePrice - promoDiscount) * 100) / 100

  const totalPrice = grossUpForStripeFee(discountedPrice, cardPercentage)
  const processingFee = Math.round((totalPrice - discountedPrice) * 100) / 100

  // For abandoned-cart tracking: the final price they were just shown.
  await recordPricingView(admin, {
    customerId: session.profileId,
    draftId: draft.id,
    stage: 'review',
    taskNames: [...(fullService ? [selectionLabel(fullService)] : []), ...tasks.map(taskLabel)],
    durationMinutes: breakdown.total_task_minutes,
    date: draft.scheduled_date,
    time: draft.scheduled_time,
    locationLabel: location?.type === 'address' ? `${location.label} · ${location.line}` : null,
    review: { tidyProId: draft.selected_tidy_pro_id, servicePrice, totalPrice },
  })

  // Others free at the same time who can do everything, offered as optional extras.
  // With Standard / Deep Cleaning, only Tidy Pros whose own price for it is no more
  // than the chosen one's (whoever accepts is paid what this booking pays).
  // Some tasks were added while automatic pricing was down: the request goes to the
  // chosen Tidy Pro for a quote (lib/quoteRequests.ts), so nobody else is asked.
  const quoteTaskCount = tasks.filter(needsQuote).length
  const extraCleanerOptions = quoteTaskCount > 0 ? [] : await getReplacementOptions(admin, {
    user_id: session.profileId,
    tidy_pro_id: draft.selected_tidy_pro_id,
    scheduled_location: draft.scheduled_location,
    scheduled_date: draft.scheduled_date,
    scheduled_time: draft.scheduled_time,
    estimated_duration_minutes: breakdown.total_task_minutes,
    task_list: tasks,
    full_service: fullService && fullServiceQuote && fullServiceDuration ? buildSnapshot(fullService, fullServiceQuote, fullServiceDuration) : null,
  })

  const cleanerName = [tidyProIdentity?.first_name, tidyProIdentity?.last_name].filter(Boolean).join(' ') || 'your Tidy Pro'
  const selectedCleaner: CleanerMatch = {
    id: draft.selected_tidy_pro_id,
    name: [tidyProIdentity?.first_name, tidyProIdentity?.last_name].filter(Boolean).join(' ') || 'Tidy Pro',
    photoUrl: tidyProStats?.profile_photo_url ?? null,
    rating: tidyProStats?.rating ?? 0,
    reviewCount: tidyProStats?.review_count ?? 0,
    isVerified: tidyProStats?.is_verified ?? false,
    isTopTidyPro,
    distanceMiles: distanceMiles == null ? 0 : Math.round(distanceMiles * 10) / 10,
  }

  return (
    <ReviewRequestView
      draftId={draft.id}
      tasks={tasks}
      fullService={
        fullService && fullServiceQuote
          ? { selection: fullService, lines: fullServiceQuote.lines, customerTotal: fullServiceQuote.customer_total }
          : null
      }
      photoUrls={await signedTaskPhotoUrls(admin, tasks)}
      date={draft.scheduled_date}
      time={draft.scheduled_time}
      recurrence={draft.recurrence_frequency}
      durationMinutes={breakdown.total_task_minutes}
      addressName={addressName}
      addressLine={addressLine}
      cleanerName={cleanerName}
      selectedCleaner={selectedCleaner}
      extraCleanerOptions={extraCleanerOptions}
      pets={(await customerPetsSummary(admin, session.profileId)) ?? ''}
      notes={draft.notes ?? ''}
      entryInstructions={draft.entry_instructions ?? savedEntryInstructions ?? ''}
      savedEntryInstructions={savedEntryInstructions}
      addressLabel={location?.type === 'address' ? location.label : null}
      suppliesProvided={draft.supplies_provided ?? false}
      giftCode={draft.gift_code ?? ''}
      promo={
        promo && 'promo' in promo
          ? { code: promo.promo.code, label: describePromoDiscount(promo.promo), discount: promoDiscount }
          : null
      }
      promoProblem={promo && 'error' in promo ? promo.error : null}
      servicePrice={servicePrice}
      discountedPrice={discountedPrice}
      processingFee={processingFee}
      totalPrice={totalPrice}
      paymentMethods={paymentMethods ?? []}
      selectedPaymentMethodId={selectedPaymentMethodId}
      quoteTaskCount={quoteTaskCount}
    />
  )
}
