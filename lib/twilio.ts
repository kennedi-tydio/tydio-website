import { NextResponse, type NextRequest } from 'next/server'
import Twilio from 'twilio'

export function twilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken || !process.env.TWILIO_PHONE_NUMBER) throw new Error('Twilio env vars are not set')
  return Twilio(accountSid, authToken)
}

// The site's public URL, which Twilio is given to call back on and signs requests with.
export function publicSiteUrl(): string | null {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || null
}

// Reads a Twilio webhook's form params, or returns the response to send if the
// request isn't signed by Twilio. Never act on an unsigned request: anyone could
// post to these routes.
export async function readTwilioWebhook(
  req: NextRequest
): Promise<{ params: Record<string, string> } | { response: NextResponse }> {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) return { response: NextResponse.json({ error: 'Webhook not configured' }, { status: 500 }) }

  const signature = req.headers.get('x-twilio-signature')
  if (!signature) return { response: NextResponse.json({ error: 'Missing signature' }, { status: 400 }) }

  const params = Object.fromEntries(
    [...(await req.formData()).entries()].map(([key, value]) => [key, String(value)])
  )

  // Twilio signs the exact URL it was configured with, query string included, which
  // behind a proxy can differ from req.url, so the public site URL is used when it's set.
  const siteUrl = publicSiteUrl()
  const url = siteUrl ? `${siteUrl}${req.nextUrl.pathname}${req.nextUrl.search}` : req.url
  if (!Twilio.validateRequest(authToken, signature, url, params)) {
    return { response: NextResponse.json({ error: 'Invalid signature' }, { status: 403 }) }
  }

  return { params }
}

export function twiml(response: { toString(): string }): NextResponse {
  return new NextResponse(response.toString(), { headers: { 'Content-Type': 'text/xml' } })
}
