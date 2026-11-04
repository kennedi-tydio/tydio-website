import { NextRequest, NextResponse } from 'next/server'
import Twilio from 'twilio'
import { createAdminClient } from '@/lib/supabase/admin'
import { HELP_REPLY, setSmsConsentForPhone, smsKeyword } from '@/lib/sms'
import { readTwilioWebhook, twiml } from '@/lib/twilio'

// Twilio calls this for every text sent to our number (set as "A message comes in"
// on the number in the Twilio console). Twilio already blocks texts to anyone who
// replies STOP; this keeps sms_consent in step so the app's settings match, and
// answers HELP. Signature verification uses TWILIO_AUTH_TOKEN — never act on an
// unsigned request, or anyone could turn off someone else's texts.
export async function POST(req: NextRequest) {
  const request = await readTwilioWebhook(req)
  if ('response' in request) return request.response
  const { params } = request

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
  const response = new Twilio.twiml.MessagingResponse()
  if (keyword === 'HELP') response.message(HELP_REPLY)

  return twiml(response)
}
