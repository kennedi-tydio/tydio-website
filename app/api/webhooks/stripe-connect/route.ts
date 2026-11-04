import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { PAYOUT_CAPABILITY_EVENT_TYPE, refreshPayoutOnboardingStatusByAccountId } from '@/lib/stripe/connect'

// Receives "thin event" notifications from the v2 Core Event Destination
// registered by ensureAccountEventDestination(). Signature verification uses
// stripe.parseEventNotification (the v2 counterpart of stripe.webhooks.
// constructEvent) against STRIPE_CONNECT_WEBHOOK_SECRET — never process a
// payload without it.
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })

  const signature = req.headers.get('stripe-signature')
  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })

  const payload = await req.text()

  let notification
  try {
    notification = await stripe.parseEventNotificationAsync(payload, signature, secret)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid signature' }, { status: 400 })
  }

  if (notification.type === PAYOUT_CAPABILITY_EVENT_TYPE) {
    await refreshPayoutOnboardingStatusByAccountId(notification.related_object.id)
  }

  return NextResponse.json({ received: true })
}
