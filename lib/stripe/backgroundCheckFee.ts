import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import type { createAdminClient } from '@/lib/supabase/admin'
import { getOrCreateStripeCustomerId } from '@/lib/stripe/customer'
import { emailAdminCleanerPaid } from '@/lib/backgroundCheck'
import { BACKGROUND_CHECK_FEE_KIND, hasPaidFee, isDuplicateFeePayment, paidFeeProId } from '@/lib/backgroundCheckFee'

type Admin = ReturnType<typeof createAdminClient>

// Server-side only — never import in client components.
export async function createFeeCheckoutSession(proId: string, amountCents: number): Promise<Stripe.Checkout.Session> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const metadata = { kind: BACKGROUND_CHECK_FEE_KIND, pro_id: proId }

  return stripe.checkout.sessions.create({
    mode: 'payment',
    customer: await getOrCreateStripeCustomerId(proId),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: { name: 'Tydio identity verification and background-screening fee' },
        },
      },
    ],
    custom_text: {
      submit: {
        message:
          'Non-refundable, except duplicate charges, Tydio ordering errors, or Tydio cancelling onboarding for its own business reasons. Payment does not guarantee approval, bookings, or earnings.',
      },
    },
    metadata,
    payment_intent_data: { metadata },
    success_url: `${siteUrl}/pro/onboarding/setup/background-check/paid`,
    cancel_url: `${siteUrl}/pro/onboarding/setup/background-check`,
  })
}

// Returns whether this session leaves the cleaner with a valid paid fee. Safe to
// call repeatedly, and from both the webhook and the return page: replays of a
// recorded payment change nothing, and a second, different payment is refunded
// on the spot rather than recorded, as a duplicate charge under the fee terms.
export async function recordFeePaymentIfPaid(admin: Admin, session: Stripe.Checkout.Session): Promise<boolean> {
  const proId = paidFeeProId(session)
  if (!proId) return false

  const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null

  const { data: check } = await admin
    .from('background_checks')
    .select('fee_paid_at, fee_refunded_at, stripe_payment_intent_id')
    .eq('pro_id', proId)
    .maybeSingle()

  if (isDuplicateFeePayment(check, paymentIntentId)) {
    await stripe.refunds.create({ payment_intent: paymentIntentId! }, { idempotencyKey: `fee-duplicate-${paymentIntentId}` })
    return true
  }

  if (hasPaidFee(check)) return true
  // A replayed event for a payment that has since been refunded.
  if (check?.fee_refunded_at && check.stripe_payment_intent_id === paymentIntentId) return false

  const { data: recorded, error } = await admin
    .from('background_checks')
    .update({
      // Payment is what puts them in the queue to be sent their form.
      requested_at: new Date().toISOString(),
      fee_paid_at: new Date().toISOString(),
      fee_amount_cents: session.amount_total,
      stripe_payment_intent_id: paymentIntentId,
      fee_refunded_at: null,
      fee_refund_reason: null,
      stripe_refund_id: null,
    })
    .eq('pro_id', proId)
    .or('fee_paid_at.is.null,fee_refunded_at.not.is.null')
    .select('pro_id')
  if (error) throw new Error(error.message)

  // Conditional on the update above, since the webhook and the return page can race
  // to record the same payment and the admin should only be emailed once.
  if (recorded && recorded.length > 0) await emailAdminCleanerPaid(admin, proId)

  return true
}

// Also clears the Checkout Session, so a cleaner who pays again gets a new one
// rather than being matched back to this refunded payment.
export async function recordFeeRefund(
  admin: Admin,
  paymentIntentId: string,
  refund: { reason: string; refundId: string | null }
): Promise<void> {
  const { error } = await admin
    .from('background_checks')
    .update({
      requested_at: null,
      fee_refunded_at: new Date().toISOString(),
      fee_refund_reason: refund.reason,
      stripe_refund_id: refund.refundId,
      stripe_checkout_session_id: null,
    })
    .eq('stripe_payment_intent_id', paymentIntentId)
  if (error) throw new Error(error.message)
}
