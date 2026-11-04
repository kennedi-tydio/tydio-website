import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import Twilio from 'twilio'

let booking: Record<string, unknown> | null
const phones: Record<string, string | null> = {}
vi.mock('@/lib/maskedCalls', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/maskedCalls')>()),
  loadCallableBooking: async () => booking,
  partyPhone: async (_admin: unknown, _booking: unknown, role: string) => phones[role] ?? null,
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { POST } from './route'

const BASE = 'https://tydio.example/api/webhooks/twilio/voice'

function voiceRequest(query: string, params: Record<string, string> = {}, { sign = true } = {}) {
  const url = query ? `${BASE}?${query}` : BASE
  const body = { CallSid: 'CA1', From: '+15551234567', ...params }
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' }
  if (sign) headers['X-Twilio-Signature'] = Twilio.getExpectedTwilioSignature('token', url, body)
  return new NextRequest(url, { method: 'POST', headers, body: new URLSearchParams(body).toString() })
}

beforeEach(() => {
  process.env.TWILIO_AUTH_TOKEN = 'token'
  process.env.TWILIO_PHONE_NUMBER = '+15550000000'
  process.env.NEXT_PUBLIC_SITE_URL = 'https://tydio.example/'
  booking = {
    id: 'b1',
    user_id: 'c1',
    tidy_pro_id: 't1',
    status: 'scheduled',
    scheduled_date: '2999-01-01',
    scheduled_time: '10:00',
    estimated_duration_minutes: 60,
    time_zone: 'America/New_York',
  }
  phones.USER = '+15551234567'
  phones.TIDYPRO = '+15559990000'
})

describe('POST /api/webhooks/twilio/voice', () => {
  it('rejects requests not signed by Twilio, including a forged booking', async () => {
    expect((await POST(voiceRequest('booking=b1&leg=USER&step=connect', { Digits: '1' }, { sign: false }))).status).toBe(400)
    const forged = voiceRequest('booking=b1&leg=USER', { Digits: '1' })
    const tampered = new NextRequest(`${BASE}?booking=b1&leg=USER&step=connect`, {
      method: 'POST',
      headers: forged.headers,
      body: new URLSearchParams({ CallSid: 'CA1', From: '+15551234567', Digits: '1' }).toString(),
    })
    expect((await POST(tampered)).status).toBe(403)
  })

  it('asks the caller to press 1 before connecting anyone', async () => {
    const xml = await (await POST(voiceRequest('booking=b1&leg=USER'))).text()
    expect(xml).toContain('<Gather')
    expect(xml).toContain('step=connect')
    expect(xml).not.toContain('<Dial')
    expect(xml).not.toContain('5559990000')
  })

  it("dials the other side from Tydio's number once they press 1", async () => {
    const xml = await (await POST(voiceRequest('booking=b1&leg=USER&step=connect', { Digits: '1' }))).text()
    expect(xml).toContain('callerId="+15550000000"')
    expect(xml).toContain('<Number>+15559990000</Number>')
  })

  it('hangs up on any other key', async () => {
    const xml = await (await POST(voiceRequest('booking=b1&leg=USER&step=connect', { Digits: '2' }))).text()
    expect(xml).not.toContain('<Dial')
    expect(xml).toContain('<Hangup/>')
  })

  it('hangs up once the booking can no longer be called', async () => {
    booking = { ...booking, status: 'cancelled' }
    const xml = await (await POST(voiceRequest('booking=b1&leg=TIDYPRO&step=connect', { Digits: '1' }))).text()
    expect(xml).not.toContain('<Dial')
    expect(xml).toContain('no longer available')
  })

  it('points people who dial the Tydio number back to the app instead of forwarding', async () => {
    const xml = await (await POST(voiceRequest(''))).text()
    expect(xml).toContain('Tydio app')
    expect(xml).not.toContain('<Dial')
    expect(xml).toContain('<Hangup/>')
  })
})
