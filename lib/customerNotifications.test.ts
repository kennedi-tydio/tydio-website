/* eslint-disable @typescript-eslint/no-explicit-any -- test-only Supabase mock */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(),
  emailShell: (body: string) => body,
  escapeHtml: (value: string) => value.replace(/</g, '&lt;'),
}))
vi.mock('@/lib/sms', () => ({
  canSendSms: (consent: string | null, phone: string | null) => consent === 'opted_in' && !!phone,
  sendSmsForPayload: vi.fn(),
}))
vi.mock('@/lib/push', () => ({ sendPushForPayload: vi.fn() }))

import { sendEmail } from '@/lib/email'
import { sendSmsForPayload } from '@/lib/sms'
import { sendPushForPayload } from '@/lib/push'
import { notifyCustomer } from './customerNotifications'

const email = vi.mocked(sendEmail)
const sms = vi.mocked(sendSmsForPayload)
const push = vi.mocked(sendPushForPayload)

const payload = { title: 'Booking declined', body: 'Choose <3> others', url: 'https://tydio.test/x' }
const customer = { email: 'c@example.com', first_name: 'Ana', phone: '+15551234567', sms_consent: 'opted_in', email_notifications_enabled: true }

function adminWith(data: any) {
  const chain: any = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data }) }
  return { from: () => chain } as any
}

beforeEach(() => {
  for (const mock of [email, sms, push]) {
    mock.mockReset()
    mock.mockResolvedValue(undefined)
  }
})

describe('notifyCustomer', () => {
  it('sends by text, push, and email', async () => {
    await notifyCustomer(adminWith(customer), 'c1', payload)
    expect(sms).toHaveBeenCalledWith('+15551234567', payload)
    expect(push).toHaveBeenCalledWith('c1', payload)
    expect(email).toHaveBeenCalledOnce()
    const sent = email.mock.calls[0][0]
    expect(sent.to[0].email).toBe('c@example.com')
    expect(sent.subject).toBe('Booking declined')
    expect(sent.htmlContent).toContain('https://tydio.test/x')
  })

  it('escapes the message in the email', async () => {
    await notifyCustomer(adminWith(customer), 'c1', payload)
    expect(email.mock.calls[0][0].htmlContent).toContain('Choose &lt;3>')
  })

  it('still emails someone who has not opted in to texts', async () => {
    await notifyCustomer(adminWith({ ...customer, sms_consent: null }), 'c1', payload)
    expect(sms).not.toHaveBeenCalled()
    expect(email).toHaveBeenCalledOnce()
  })

  it('respects email being turned off', async () => {
    await notifyCustomer(adminWith({ ...customer, email_notifications_enabled: false }), 'c1', payload)
    expect(email).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledOnce()
  })

  it('still emails when another channel fails', async () => {
    sms.mockRejectedValue(new Error('twilio down'))
    push.mockRejectedValue(new Error('push down'))
    await notifyCustomer(adminWith(customer), 'c1', payload)
    expect(email).toHaveBeenCalledOnce()
  })

  it('skips email for chat messages, but still sends the text and push', async () => {
    await notifyCustomer(adminWith(customer), 'c1', payload, { email: false })
    expect(email).not.toHaveBeenCalled()
    expect(sms).toHaveBeenCalledOnce()
    expect(push).toHaveBeenCalledOnce()
  })

  it('does not throw when email fails', async () => {
    email.mockRejectedValue(new Error('brevo down'))
    await expect(notifyCustomer(adminWith(customer), 'c1', payload)).resolves.toBeUndefined()
  })
})
