/* eslint-disable @typescript-eslint/no-explicit-any -- test-only chainable Supabase query mock */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  emailShell: (body: string) => body,
  escapeHtml: (value: string) => value,
  TYDIO_ADMIN_EMAIL: 'admin@example.com',
}))
vi.mock('@/lib/sms', () => ({
  canSendSms: (consent: string | null, phone: string | null) => consent === 'opted_in' && !!phone,
  sendSmsForPayload: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/push', () => ({ sendPushForPayload: vi.fn().mockResolvedValue(undefined) }))

import { sendEmail } from '@/lib/email'
import { sendSmsForPayload } from '@/lib/sms'
import { sendPushForPayload } from '@/lib/push'
import { expirationDateError, expireDueInsurance, formatExpirationDate, isInsuranceExpiryDue, isInsuranceReminderDue } from './insuranceExpiration'

const email = vi.mocked(sendEmail)
const sms = vi.mocked(sendSmsForPayload)
const push = vi.mocked(sendPushForPayload)

// 10am Eastern on Nov 3.
const morning = new Date('2026-11-03T15:00:00Z')
const zone = 'America/New_York'

function fakeAdmin(rows: any[], updateResult: any = { data: [{ id: 'p1' }], error: null }) {
  const updates: any[] = []
  const admin = {
    from: (table: string) => {
      let isUpdate = false
      const chain: any = {
        select: () => chain,
        update: (values: any) => {
          isUpdate = true
          updates.push(values)
          return chain
        },
        eq: () => chain,
        not: () => chain,
        is: () => chain,
        maybeSingle: async () => ({ data: table === 'profiles' ? { email: 'pro@example.com', first_name: 'Nia', last_name: 'T' } : null }),
        then: (resolve: any) => resolve(isUpdate ? updateResult : { data: rows }),
      }
      return chain
    },
  } as any
  return { admin, updates }
}

const dueRow = { id: 'p1', insurance_policy_expiration_date: '2026-11-03', insurance_expiry_reminder_sent_at: '2026-10-31T14:00:00Z', time_zone: zone, phone: '+15551234567', sms_consent: 'opted_in' }

beforeEach(() => {
  email.mockClear()
  sms.mockClear()
  push.mockClear()
})

describe('expirationDateError', () => {
  it('accepts a future date', () => {
    expect(expirationDateError('2026-11-04', morning)).toBeNull()
  })

  it('refuses a missing, malformed, or past date, or today', () => {
    expect(expirationDateError('', morning)).toContain('Enter')
    expect(expirationDateError(null, morning)).toContain('Enter')
    expect(expirationDateError('11/04/2026', morning)).toContain('Enter')
    expect(expirationDateError('2026-11-03', morning)).toContain('future')
    expect(expirationDateError('2026-01-01', morning)).toContain('future')
  })
})

describe('isInsuranceExpiryDue', () => {
  it('is not due before the date', () => {
    expect(isInsuranceExpiryDue('2026-11-04', zone, morning)).toBe(false)
  })

  it('waits until morning on the date', () => {
    expect(isInsuranceExpiryDue('2026-11-03', zone, new Date('2026-11-03T06:00:00Z'))).toBe(false)
    expect(isInsuranceExpiryDue('2026-11-03', zone, new Date('2026-11-03T13:59:00Z'))).toBe(false)
    expect(isInsuranceExpiryDue('2026-11-03', zone, new Date('2026-11-03T14:00:00Z'))).toBe(true)
  })

  it('goes straight away for a date already passed, whatever the hour', () => {
    expect(isInsuranceExpiryDue('2026-11-02', zone, new Date('2026-11-03T06:00:00Z'))).toBe(true)
  })

  it('uses the cleaner’s own zone', () => {
    expect(isInsuranceExpiryDue('2026-11-03', 'America/Los_Angeles', morning)).toBe(false)
    expect(isInsuranceExpiryDue('2026-11-03', 'America/Los_Angeles', new Date('2026-11-03T17:00:00Z'))).toBe(true)
  })
})

describe('formatExpirationDate', () => {
  it('reads the date without shifting it a day', () => {
    expect(formatExpirationDate('2026-11-03')).toBe('November 3, 2026')
  })
})

describe('expireDueInsurance', () => {
  it('marks it expired, removes the badge, and tells both the cleaner and admin', async () => {
    const { admin, updates } = fakeAdmin([dueRow])
    expect(await expireDueInsurance(admin, morning)).toEqual({ reminded: 0, expired: 1, failed: 0 })

    expect(updates[0]).toEqual({ insurance_status: 'expired', is_insured: false })
    expect(sms).toHaveBeenCalledOnce()
    expect(push).toHaveBeenCalledOnce()
    expect(email.mock.calls.map(([options]) => options.to[0].email)).toEqual(['pro@example.com', 'admin@example.com'])
  })

  it('leaves a date still to come alone', async () => {
    const { admin, updates } = fakeAdmin([{ ...dueRow, insurance_policy_expiration_date: '2026-12-01' }])
    expect(await expireDueInsurance(admin, morning)).toEqual({ reminded: 0, expired: 0, failed: 0 })
    expect(updates).toEqual([])
    expect(email).not.toHaveBeenCalled()
  })

  it('tells nobody if another run got there first', async () => {
    const { admin } = fakeAdmin([dueRow], { data: [], error: null })
    expect(await expireDueInsurance(admin, morning)).toEqual({ reminded: 0, expired: 0, failed: 0 })
    expect(email).not.toHaveBeenCalled()
  })

  it('counts a failure and carries on', async () => {
    const { admin } = fakeAdmin([dueRow], { data: null, error: { message: 'db down' } })
    expect(await expireDueInsurance(admin, morning)).toEqual({ reminded: 0, expired: 0, failed: 1 })
  })
})

describe('isInsuranceReminderDue', () => {
  it('is due from 9am on the day 3 days before', () => {
    expect(isInsuranceReminderDue('2026-11-06', zone, new Date('2026-11-03T13:59:00Z'))).toBe(false)
    expect(isInsuranceReminderDue('2026-11-06', zone, morning)).toBe(true)
  })

  it('is not due earlier than 3 days before', () => {
    expect(isInsuranceReminderDue('2026-11-07', zone, morning)).toBe(false)
  })

  it('still goes out for a policy approved with fewer than 3 days left', () => {
    expect(isInsuranceReminderDue('2026-11-04', zone, morning)).toBe(true)
  })

  it('leaves the day itself to the expiry notice', () => {
    expect(isInsuranceReminderDue('2026-11-03', zone, morning)).toBe(false)
  })
})

describe('expireDueInsurance reminders', () => {
  const upcoming = { ...dueRow, insurance_policy_expiration_date: '2026-11-06', insurance_expiry_reminder_sent_at: null }

  it('reminds only the cleaner, 3 days ahead, without expiring anything', async () => {
    const { admin, updates } = fakeAdmin([upcoming])
    expect(await expireDueInsurance(admin, morning)).toEqual({ reminded: 1, expired: 0, failed: 0 })
    expect(Object.keys(updates[0])).toEqual(['insurance_expiry_reminder_sent_at'])
    expect(email.mock.calls.map(([options]) => options.to[0].email)).toEqual(['pro@example.com'])
    expect(email.mock.calls[0][0].subject).toBe('Your insurance expires soon')
    expect(sms.mock.calls[0][1].body).toContain('November 6, 2026')
  })

  it('does not remind twice', async () => {
    const { admin, updates } = fakeAdmin([{ ...upcoming, insurance_expiry_reminder_sent_at: '2026-11-03T14:00:00Z' }])
    expect(await expireDueInsurance(admin, morning)).toEqual({ reminded: 0, expired: 0, failed: 0 })
    expect(updates).toEqual([])
    expect(email).not.toHaveBeenCalled()
  })

  it('tells nobody if another run already sent it', async () => {
    const { admin } = fakeAdmin([upcoming], { data: [], error: null })
    expect(await expireDueInsurance(admin, morning)).toEqual({ reminded: 0, expired: 0, failed: 0 })
    expect(email).not.toHaveBeenCalled()
  })
})
