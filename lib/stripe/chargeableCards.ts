import type { createAdminClient } from '@/lib/supabase/admin'
import { stripePercentageForPaymentMethod } from '@/lib/stripe/cardFees'

// What a saved card would be charged, Stripe's fee for it included.
export type ChargeableCard = { id: string; label: string; chargeCents: number }

// The customer's saved cards, each with what it would be charged (its own Stripe fee
// included), so the total shown is exactly what that card pays.
export async function chargeableCards(
  admin: ReturnType<typeof createAdminClient>,
  customerId: string,
  chargeFor: (cardFeePercentage: number) => number
): Promise<{ cards: ChargeableCard[]; defaultCardId: string | null }> {
  const { data: paymentMethods } = await admin
    .from('payment_methods')
    .select('id, stripe_payment_method_id, card_brand, card_last4, is_default')
    .eq('user_id', customerId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
  const cards = (
    await Promise.all(
      (paymentMethods ?? []).map(async (pm) => {
        const percentage = await stripePercentageForPaymentMethod(pm.stripe_payment_method_id).catch(() => null)
        if (percentage == null) return null
        const brand = pm.card_brand ? pm.card_brand.charAt(0).toUpperCase() + pm.card_brand.slice(1) : 'Card'
        return { id: pm.id, label: `${brand} •••• ${pm.card_last4}`, chargeCents: Math.round(chargeFor(percentage) * 100) }
      })
    )
  ).filter((c): c is ChargeableCard => c != null)
  return { cards, defaultCardId: (paymentMethods ?? []).find((pm) => pm.is_default)?.id ?? null }
}
