import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { STRIPE_DASHBOARD_REFUND } from '@/lib/backgroundCheckFee'
import { recordFeePaymentIfPaid, recordFeeRefund } from '@/lib/stripe/backgroundCheckFee'

// Records a cleaner's background check payment even if they never make it back
// to the app after paying. Also covers payment methods that settle later, which
// are still unpaid when the cleaner returns from Checkout. Signature
// verification uses STRIPE_WEBHOOK_SECRET — never process a payload without it.
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })

  const signature = req.headers.get('stripe-signature')
  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })

  const payload = await req.text()

  let event
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    await recordFeePaymentIfPaid(createAdminClient(), event.data.object)
  } else if (event.type === 'charge.refunded') {
    // Picks up refunds made directly in the Stripe dashboard. The refund action
    // on the admin page records its own, so it's left alone here to keep the
    // reason chosen there. Partial refunds don't undo the fee.
    const charge = event.data.object
    const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
    if (charge.refunded && paymentIntentId) {
      const admin = createAdminClient()
      const { data: check } = await admin
        .from('background_checks')
        .select('fee_refunded_at')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .maybeSingle()
      if (check && !check.fee_refunded_at) {
        await recordFeeRefund(admin, paymentIntentId, { reason: STRIPE_DASHBOARD_REFUND, refundId: null })
      }
    }
  }

  return NextResponse.json({ received: true })
}
