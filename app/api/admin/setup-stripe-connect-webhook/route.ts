import { NextRequest, NextResponse } from 'next/server'
import { ensureAccountEventDestination } from '@/lib/stripe/connect'

// POST /api/admin/setup-stripe-connect-webhook
// Body: { secret: string, webhookUrl?: string }
//
// One-time setup: registers the v2 Event Destination that lets Stripe notify
// this app when a Tidy Pro's payout capability changes status. Idempotent —
// safe to call again (it no-ops if a destination for this URL already
// exists). On first success, copy the returned signingSecret into
// .env.local as STRIPE_CONNECT_WEBHOOK_SECRET and restart the server.
//
// Stripe requires the destination URL to be a real, publicly reachable
// HTTPS address — a plain localhost NEXT_PUBLIC_SITE_URL will be rejected.
// Pass `webhookUrl` explicitly (e.g. an ngrok/tunnel URL) to register a
// working destination without touching NEXT_PUBLIC_SITE_URL, which is also
// used for the (browser-facing, not Stripe-facing) onboarding return/refresh
// URLs and doesn't need to be publicly reachable.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const { secret, webhookUrl: webhookUrlOverride } = body as { secret?: string; webhookUrl?: string }
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const webhookUrl = webhookUrlOverride ?? `${siteUrl}/api/webhooks/stripe-connect`

  try {
    const result = await ensureAccountEventDestination(webhookUrl)
    if (!result.created) {
      return NextResponse.json({ ok: true, message: 'Event destination already exists', webhookUrl })
    }
    return NextResponse.json({
      ok: true,
      message: 'Event destination created — copy signingSecret into .env.local as STRIPE_CONNECT_WEBHOOK_SECRET and restart the server.',
      webhookUrl,
      signingSecret: result.signingSecret,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Setup failed' }, { status: 500 })
  }
}
