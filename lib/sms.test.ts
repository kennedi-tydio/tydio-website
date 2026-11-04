/* eslint-disable @typescript-eslint/no-explicit-any -- test-only chainable Supabase query mock */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const create = vi.fn<(msg: object) => Promise<object>>(async () => ({}))
vi.mock('twilio', () => ({ default: () => ({ messages: { create: (msg: object) => create(msg) } }) }))

const tables: Record<string, { id: string; phone: string | null; sms_consent?: string }[]> = {}
const fakeAdmin = {
  from: (table: string) => {
    let pattern = ''
    const chain: any = {
      select: () => chain,
      ilike: async (_column: string, p: string) => {
        pattern = p.replace('%', '')
        return { data: tables[table].filter(r => r.phone?.endsWith(pattern)) }
      },
      update: (values: { sms_consent: string }) => ({
        in: async (_column: string, ids: string[]) => {
          for (const row of tables[table]) if (ids.includes(row.id)) row.sms_consent = values.sms_consent
          return { error: null }
        },
      }),
    }
    return chain
  },
} as any
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeAdmin }))

import { sendSms, setSmsConsentForPhone, smsKeyword } from './sms'

beforeEach(() => {
  tables.profiles = [
    { id: 'c1', phone: '(555) 123-4567', sms_consent: 'opted_in' },
    { id: 'c2', phone: '555-999-4567', sms_consent: 'opted_in' },
  ]
  tables.tidypro_profiles = [{ id: 't1', phone: '+15551234567', sms_consent: 'opted_in' }]
  create.mockReset()
  process.env.TWILIO_ACCOUNT_SID = 'AC1'
  process.env.TWILIO_AUTH_TOKEN = 'token'
  process.env.TWILIO_PHONE_NUMBER = '+15550000000'
})

describe('smsKeyword', () => {
  it('reads opt-out, opt-in, and help keywords in any case', () => {
    expect(smsKeyword(' stop ')).toBe('STOP')
    expect(smsKeyword('Unsubscribe')).toBe('STOP')
    expect(smsKeyword('START')).toBe('START')
    expect(smsKeyword('unstop')).toBe('START')
    expect(smsKeyword('help')).toBe('HELP')
  })

  it('ignores keywords inside a longer message', () => {
    expect(smsKeyword('please stop')).toBeNull()
    expect(smsKeyword('')).toBeNull()
    expect(smsKeyword(undefined)).toBeNull()
  })
})

describe('setSmsConsentForPhone', () => {
  it('updates every account with the number, whatever its format, and no one else', async () => {
    expect(await setSmsConsentForPhone(fakeAdmin, '+15551234567', 'declined')).toBe(2)
    expect(tables.profiles.map(r => r.sms_consent)).toEqual(['declined', 'opted_in'])
    expect(tables.tidypro_profiles[0].sms_consent).toBe('declined')
  })
})

describe('sendSms', () => {
  it('records an opt-out when Twilio says the number replied STOP', async () => {
    create.mockRejectedValueOnce(Object.assign(new Error('Attempt to send to unsubscribed recipient'), { code: 21610 }))
    await expect(sendSms('+15551234567', 'hi')).rejects.toThrow('SMS send failed')
    expect(tables.profiles[0].sms_consent).toBe('declined')
  })

  it('leaves consent alone on other send errors', async () => {
    create.mockRejectedValueOnce(Object.assign(new Error('Invalid number'), { code: 21211 }))
    await expect(sendSms('+15551234567', 'hi')).rejects.toThrow('SMS send failed')
    expect(tables.profiles[0].sms_consent).toBe('opted_in')
  })
})
