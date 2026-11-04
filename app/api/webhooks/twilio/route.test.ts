import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import Twilio from 'twilio'

const setSmsConsentForPhone = vi.fn<(admin: unknown, phone: string, consent: string) => Promise<number>>(async () => 1)
vi.mock('@/lib/sms', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/sms')>()),
  setSmsConsentForPhone: (admin: unknown, phone: string, consent: string) => setSmsConsentForPhone(admin, phone, consent),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { POST } from './route'

const URL = 'https://tydio.example/api/webhooks/twilio'

function inbound(body: string, { sign = true } = {}) {
  const params = { From: '+15551234567', Body: body }
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' }
  if (sign) headers['X-Twilio-Signature'] = Twilio.getExpectedTwilioSignature('token', URL, params)
  return new NextRequest(URL, { method: 'POST', headers, body: new URLSearchParams(params).toString() })
}

beforeEach(() => {
  process.env.TWILIO_AUTH_TOKEN = 'token'
  process.env.NEXT_PUBLIC_SITE_URL = 'https://tydio.example/'
  setSmsConsentForPhone.mockClear()
})

describe('POST /api/webhooks/twilio', () => {
  it('rejects requests not signed by Twilio', async () => {
    const res = await POST(inbound('STOP', { sign: false }))
    expect(res.status).toBe(400)
    const forged = inbound('STOP')
    forged.headers.set('X-Twilio-Signature', 'forged')
    expect((await POST(forged)).status).toBe(403)
    expect(setSmsConsentForPhone).not.toHaveBeenCalled()
  })

  it('turns texts off on STOP and back on on START, without replying', async () => {
    const stop = await POST(inbound('stop'))
    expect(setSmsConsentForPhone).toHaveBeenLastCalledWith(expect.anything(), '+15551234567', 'declined')
    expect(await stop.text()).not.toContain('<Message>')

    await POST(inbound('START'))
    expect(setSmsConsentForPhone).toHaveBeenLastCalledWith(expect.anything(), '+15551234567', 'opted_in')
  })

  it('answers HELP and leaves consent alone', async () => {
    const res = await POST(inbound('Help'))
    expect(await res.text()).toContain('Reply STOP to opt out')
    expect(setSmsConsentForPhone).not.toHaveBeenCalled()
  })

  it('ignores ordinary replies', async () => {
    const res = await POST(inbound('Thanks, see you Tuesday'))
    expect(res.status).toBe(200)
    expect(await res.text()).not.toContain('<Message>')
    expect(setSmsConsentForPhone).not.toHaveBeenCalled()
  })
})
