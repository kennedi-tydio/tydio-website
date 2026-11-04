import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readTwilioWebhook } from '@/lib/twilio'

// Twilio posts here when a masked call ends (the statusCallback set in
// startMaskedCall), so the call log has how it ended and how long it ran.
export async function POST(req: NextRequest) {
  const request = await readTwilioWebhook(req)
  if ('response' in request) return request.response
  const { CallSid, CallStatus, CallDuration } = request.params

  if (CallSid) {
    const duration = Number(CallDuration)
    const { error } = await createAdminClient()
      .from('booking_calls')
      .update({ status: CallStatus ?? null, duration_seconds: Number.isFinite(duration) ? duration : null })
      .eq('twilio_call_sid', CallSid)
    if (error) {
      console.error('[Tydio] Updating masked call status failed:', error.message)
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }
  }

  return new NextResponse(null, { status: 204 })
}
