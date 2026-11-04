import { stripe } from '@/lib/stripe'
import { stripePercentageForCardCountry } from '@/lib/pricingRules'

// Server-side only. Reads the card itself, so the fee a customer is charged up front is
// the one Stripe will actually take for that card.
export async function stripePercentageForPaymentMethod(paymentMethodId: string): Promise<number> {
  const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId)
  return stripePercentageForCardCountry(paymentMethod.card?.country)
}
