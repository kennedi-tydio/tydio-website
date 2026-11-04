import { NextRequest, NextResponse } from 'next/server'
import Twilio from 'twilio'
import { createAdminClient } from '@/lib/supabase/admin'
import { HELP_REPLY, setSmsConsentForPhone, smsKeyword } from '@/lib/sms'

// Twilio calls this for every text sent to our number (set as "A message comes in"
// on the number in the Twilio console). Twilio already blocks texts to anyone who
// replies STOP; this keeps sms_consent in step so the app's settings match, and
// answers HELP. Signature verification uses TWILIO_AUTH_TOKEN — never act on an
// unsigned request, or anyone could turn off someone else's texts.
export async function POST(req: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })

  const signature = req.headers.get('x-twilio-signature')
  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })

  const params = Object.fromEntries(
    [...(await req.formData()).entries()].map(([key, value]) => [key, String(value)])
  )

  // Twilio signs the exact URL it was configured with, which behind a proxy can
  // differ from req.url, so the public site URL is used when it's set.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
  const url = siteUrl ? `${siteUrl}${req.nextUrl.pathname}` : req.url
  if (!Twilio.validateRequest(authToken, signature, url, params)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  // OptOutType is only sent when Advanced Opt-Out is on in Twilio; otherwise the
  // keyword is read from the message itself.
  const keyword = smsKeyword(params.OptOutType) ?? smsKeyword(params.Body)
  const from = params.From

  if (from && (keyword === 'STOP' || keyword === 'START')) {
    try {
      await setSmsConsentForPhone(createAdminClient(), from, keyword === 'STOP' ? 'declined' : 'opted_in')
    } catch (err) {
      // Twilio still blocks the number; the failure shows in its webhook logs, and
      // the 21610 check in sendSms catches the mismatch on the next text.
      console.error('[Tydio] Inbound SMS consent update failed:', err)
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }
  }

  // Twilio sends its own confirmation for STOP and START, so only HELP gets a reply.
  const twiml = new Twilio.twiml.MessagingResponse()
  if (keyword === 'HELP') twiml.message(HELP_REPLY)

  return new NextResponse(twiml.toString(), { headers: { 'Content-Type': 'text/xml' } })
}
