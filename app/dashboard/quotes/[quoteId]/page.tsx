import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import { expireIfDue, loadForCustomer, priceQuoteTasks, quoteRequestTasks } from '@/lib/quoteRequests'
import { signedTaskPhotoUrls } from '@/lib/customerTaskPhotos'
import { stripePercentageForPaymentMethod } from '@/lib/stripe/cardFees'
import { grossUpForStripeFee } from '@/lib/pricingRules'
import { findPromoForCustomer } from '@/lib/promoCodesData'
import { describePromoDiscount, promoDiscountAmount } from '@/lib/promoCodes'
import { bookableSelection } from '@/lib/fullServiceBooking'
import { selectionLabel } from '@/lib/fullService'
import { isRecurrenceFrequency } from '@/lib/recurrence'
import QuoteView, { type QuotePricing } from './QuoteView'

export const metadata: Metadata = { title: 'Your Quote — Tydio' }

export default async function CustomerQuotePage({ params }: { params: Promise<{ quoteId: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'USER') redirect('/login')

  const { quoteId } = await params
  const admin = createAdminClient()

  const loaded = await loadForCustomer(admin, quoteId, session.profileId)
  if (!loaded) redirect('/dashboard/messages')
  const row = await expireIfDue(admin, loaded)
  if (row.user_unread) await admin.from('booking_quote_requests').update({ user_unread: false }).eq('id', row.id)

  const tasks = quoteRequestTasks(row)
  const location = row.scheduled_location as ScheduledLocation | null

  const [{ data: tidyProIdentity }, { data: tidyProStats }, { data: paymentMethods }, { data: me }] = await Promise.all([
    admin.from('profiles').select('first_name, last_name').eq('id', row.tidy_pro_id).maybeSingle(),
    admin.from('tidypro_profiles').select('profile_photo_url').eq('id', row.tidy_pro_id).maybeSingle(),
    admin
      .from('payment_methods')
      .select('id, brand:card_brand, last4:card_last4, is_default')
      .eq('user_id', session.profileId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true }),
    admin.from('profiles').select('first_name').eq('id', session.profileId).maybeSingle(),
  ])

  const selectedPaymentMethodId =
    row.selected_payment_method_id ?? (paymentMethods ?? []).find((pm) => pm.is_default)?.id ?? null
  const selectedCard = (paymentMethods ?? []).find((pm) => pm.id === selectedPaymentMethodId) ?? null

  // The full price, worked out the same way Approve & Pay charges it.
  let pricing: QuotePricing | null = null
  if (row.status === 'quoted') {
    const priced = await priceQuoteTasks(admin, row, tasks)
    if (priced) {
      const promo = row.gift_code ? await findPromoForCustomer(admin, row.gift_code, session.profileId) : null
      const discount = promo && 'promo' in promo ? promoDiscountAmount(priced.servicePrice, promo.promo) : 0
      const discounted = Math.round((priced.servicePrice - discount) * 100) / 100
      const { data: card } = selectedPaymentMethodId
        ? await admin
            .from('payment_methods')
            .select('stripe_payment_method_id')
            .eq('id', selectedPaymentMethodId)
            .eq('user_id', session.profileId)
            .maybeSingle()
        : { data: null }
      const percentage = card?.stripe_payment_method_id
        ? await stripePercentageForPaymentMethod(card.stripe_payment_method_id).catch(() => undefined)
        : undefined
      const total = grossUpForStripeFee(discounted, percentage)
      pricing = {
        servicePrice: priced.servicePrice,
        promo: promo && 'promo' in promo ? { code: promo.promo.code, label: describePromoDiscount(promo.promo), discount } : null,
        promoProblem: promo && 'error' in promo ? promo.error : null,
        discountedPrice: discounted,
        processingFee: Math.round((total - discounted) * 100) / 100,
        totalPrice: total,
      }
    }
  }

  const fullService = bookableSelection(row.full_service)

  return (
    <QuoteView
      quoteId={row.id}
      status={row.status}
      bookingId={row.booking_id}
      tasks={tasks}
      fullServiceLabel={fullService ? selectionLabel(fullService) : null}
      photoUrls={await signedTaskPhotoUrls(admin, tasks)}
      date={row.scheduled_date}
      time={row.scheduled_time.slice(0, 5)}
      recurring={isRecurrenceFrequency(row.recurrence_frequency)}
      addressName={location?.type === 'address' ? `${me?.first_name ?? 'Your'}'s ${location.label}` : 'Your home'}
      addressLine={location?.type === 'address' ? location.line : null}
      cleanerName={[tidyProIdentity?.first_name, tidyProIdentity?.last_name].filter(Boolean).join(' ') || 'Your Tidy Pro'}
      cleanerPhotoUrl={tidyProStats?.profile_photo_url ?? null}
      tidyProNote={row.tidy_pro_note}
      declineReason={row.decline_reason}
      pricing={pricing}
      selectedCard={selectedCard ? { brand: selectedCard.brand, last4: selectedCard.last4 } : null}
      hasPaymentMethods={(paymentMethods ?? []).length > 0}
    />
  )
}
