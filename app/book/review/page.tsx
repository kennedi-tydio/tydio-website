import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveStatePricing, priceTaskListForState, ensurePriceableTasks, resolveLocationSquareFootage } from '@/app/dashboard/taskPricing'
import { computeIsTopTidyPro, haversineDistanceMiles } from '@/lib/cleanerMatching'
import { stripePercentageForPaymentMethod } from '@/lib/stripe/cardFees'
import { TOP_TIDY_PRO_SURCHARGE, FAR_DISTANCE_SURCHARGE_MILES, FAR_DISTANCE_SURCHARGE, grossUpForStripeFee } from '@/lib/pricingRules'
import type { TidyTask } from '@/app/dashboard/types'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import ReviewRequestView from './ReviewRequestView'

export const metadata: Metadata = { title: 'Review Your Request — Tydio' }

export default async function ReviewPage() {
  const session = await getSession()
  if (!session || session.role !== 'USER') redirect('/login')

  const admin = createAdminClient()

  const { data: draft, error: draftError } = await admin
    .from('booking_drafts')
    .select(
      'id, task_list, scheduled_location, scheduled_date, scheduled_time, selected_tidy_pro_id, pets, notes, supplies_provided, gift_code, selected_payment_method_id'
    )
    .eq('customer_user_id', session.profileId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (draftError) throw new Error(`Failed to load booking draft: ${draftError.message}`)
  if (!draft) redirect('/dashboard')

  const allTasks = (draft.task_list as TidyTask[] | null) ?? []
  let tasks = allTasks.filter((t) => t.completed)
  if (tasks.length === 0) redirect('/dashboard')
  if (!draft.selected_tidy_pro_id || !draft.scheduled_date || !draft.scheduled_time) redirect('/book/schedule')

  const [
    { data: profile, error: profileError },
    { data: tidyProStats },
    { data: tidyProIdentity },
    { data: paymentMethods },
  ] = await Promise.all([
    admin.from('profiles').select('first_name, service_area_id, pets').eq('id', session.profileId).single(),
    admin
      .from('tidypro_profiles')
      .select('rating, total_accepted_bookings, latitude, longitude')
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

  const statePricing = await resolveStatePricing(admin, profile.service_area_id)
  if (!statePricing.configured) redirect('/dashboard?priceError=state_pricing_not_configured')

  // Backfill any task that's missing a price estimate instead of failing
  // the whole booking over it.
  const repaired = await ensurePriceableTasks(admin, draft.id, allTasks)
  tasks = repaired.filter((t) => t.completed)

  const location = draft.scheduled_location as ScheduledLocation | null
  const squareFootage = await resolveLocationSquareFootage(admin, session.profileId, location)

  let breakdown
  try {
    breakdown = priceTaskListForState(tasks, statePricing.state, statePricing.medianFourHourPrice, squareFootage)
  } catch {
    redirect('/dashboard?priceError=1')
  }

  const addressName = location?.type === 'address' ? `${profile.first_name ?? 'Your'}'s ${location.label}` : 'Current Location'
  const addressLine = location?.type === 'address' ? location.line : null

  const isTopTidyPro = tidyProStats ? computeIsTopTidyPro(tidyProStats.rating, tidyProStats.total_accepted_bookings) : false
  const distanceMiles =
    location?.latitude != null && location?.longitude != null && tidyProStats?.latitude != null && tidyProStats?.longitude != null
      ? haversineDistanceMiles(
          { latitude: location.latitude, longitude: location.longitude },
          { latitude: tidyProStats.latitude, longitude: tidyProStats.longitude }
        )
      : null
  const servicePrice =
    breakdown.total_customer_charge +
    (isTopTidyPro ? TOP_TIDY_PRO_SURCHARGE : 0) +
    (distanceMiles != null && distanceMiles > FAR_DISTANCE_SURCHARGE_MILES ? FAR_DISTANCE_SURCHARGE : 0)

  // The fee depends on the card, so it's worked out for the one they've actually chosen.
  const { data: selectedCard } = draft.selected_payment_method_id
    ? await admin.from('payment_methods').select('stripe_payment_method_id').eq('id', draft.selected_payment_method_id).eq('user_id', session.profileId).maybeSingle()
    : { data: null }
  const cardPercentage = selectedCard?.stripe_payment_method_id
    ? await stripePercentageForPaymentMethod(selectedCard.stripe_payment_method_id).catch(() => undefined)
    : undefined

  const totalPrice = grossUpForStripeFee(servicePrice, cardPercentage)
  const processingFee = Math.round((totalPrice - servicePrice) * 100) / 100

  const cleanerName = [tidyProIdentity?.first_name, tidyProIdentity?.last_name].filter(Boolean).join(' ') || 'your Tidy Pro'

  return (
    <ReviewRequestView
      draftId={draft.id}
      tasks={tasks}
      date={draft.scheduled_date}
      time={draft.scheduled_time}
      durationMinutes={breakdown.total_task_minutes}
      addressName={addressName}
      addressLine={addressLine}
      cleanerName={cleanerName}
      pets={draft.pets ?? profile.pets ?? ''}
      notes={draft.notes ?? ''}
      suppliesProvided={draft.supplies_provided ?? false}
      giftCode={draft.gift_code ?? ''}
      servicePrice={servicePrice}
      processingFee={processingFee}
      totalPrice={totalPrice}
      paymentMethods={paymentMethods ?? []}
      selectedPaymentMethodId={draft.selected_payment_method_id}
    />
  )
}
