import { NextRequest } from 'next/server'
import Twilio from 'twilio'
import { createAdminClient } from '@/lib/supabase/admin'
import { bridgeUrl, canCall, loadCallableBooking, otherRole, partyPhone, type CallerRole } from '@/lib/maskedCalls'
import { publicSiteUrl, readTwilioWebhook, twiml } from '@/lib/twilio'

const VOICE = { voice: 'Polly.Joanna' } as const

// Two kinds of request arrive here, both signed by Twilio:
// - A masked call started from the app (see startMaskedCall). The caller has just
//   answered their own phone; the query says which booking and which side they are.
//   They press 1 first, so a call that went to their voicemail is never connected
//   to the other person, then we dial the other side from Tydio's number.
// - Someone dialing Tydio's number directly (set as "A call comes in" on the number),
//   usually calling back a masked call. There's no booking to go on, and a person
//   can have several, so they're pointed back to the app rather than forwarded.
export async function POST(req: NextRequest) {
  const request = await readTwilioWebhook(req)
  if ('response' in request) return request.response
  const { params } = request

  const response = new Twilio.twiml.VoiceResponse()
  const bookingId = req.nextUrl.searchParams.get('booking')
  const leg = req.nextUrl.searchParams.get('leg')

  if (!bookingId || (leg !== 'USER' && leg !== 'TIDYPRO')) {
    response.say(VOICE, "Thanks for calling Tydio. To reach your Tidy Pro or customer, open your booking's messages in the Tydio app and tap Call. Goodbye.")
    response.hangup()
    return twiml(response)
  }

  const admin = createAdminClient()
  const booking = await loadCallableBooking(admin, bookingId)
  if (!booking || !canCall(booking)) {
    response.say(VOICE, 'Calling is no longer available for this booking. Please use messages in the Tydio app. Goodbye.')
    response.hangup()
    return twiml(response)
  }

  const callerRole: CallerRole = leg
  const them = callerRole === 'USER' ? 'your Tidy Pro' : 'your customer'

  if (req.nextUrl.searchParams.get('step') !== 'connect') {
    const siteUrl = publicSiteUrl() ?? req.nextUrl.origin
    const gather = response.gather({ numDigits: 1, timeout: 8, action: bridgeUrl(siteUrl, bookingId, callerRole, 'connect') })
    gather.say(VOICE, `This is Tydio, connecting your call to ${them}. Press 1 to connect.`)
    response.say(VOICE, 'We did not hear from you. Goodbye.')
    response.hangup()
    return twiml(response)
  }

  if (params.Digits !== '1') {
    response.say(VOICE, 'Call canceled. Goodbye.')
    response.hangup()
    return twiml(response)
  }

  const callee = await partyPhone(admin, booking, otherRole(callerRole))
  if (!callee) {
    response.say(VOICE, `Sorry, we can't reach ${them} by phone. Please send them a message in the Tydio app. Goodbye.`)
    response.hangup()
    return twiml(response)
  }

  response.say(VOICE, 'Connecting you now.')
  const dial = response.dial({ callerId: process.env.TWILIO_PHONE_NUMBER, timeout: 25, answerOnBridge: true })
  dial.number(callee)
  return twiml(response)
}
