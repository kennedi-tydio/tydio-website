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
vi.mock('@/lib/stripe', () => ({
  stripe: {
    paymentIntents: {
      retrieve: vi.fn().mockResolvedValue({
        status: 'succeeded',
        amount_received: 12000,
        payment_method: { card: { brand: 'visa', last4: '4242', exp_month: 4, exp_year: 2029 } },
      }),
    },
  },
}))

import { sendEmail } from '@/lib/email'
import { sendSmsForPayload } from '@/lib/sms'
import { sendPushForPayload } from '@/lib/push'
import { checkUnresponsiveCleaners, unresponsiveStepDue } from './unresponsiveCleaners'

const email = vi.mocked(sendEmail)
const sms = vi.mocked(sendSmsForPayload)
const push = vi.mocked(sendPushForPayload)

const zone = 'America/New_York'
// Booking starts 10am Eastern on Nov 3, which is 15:00 UTC.
const base = { scheduled_date: '2026-11-03', scheduled_time: '10:00', time_zone: zone, on_the_way_reminder_sent_at: null, unresponsive_alert_sent_at: null }
const at = (utc: string) => new Date(`2026-11-03T${utc}Z`)

const bookingRow = {
  id: 'b1',
  user_id: 'u1',
  tidy_pro_id: 'p1',
  tidy_pro_name: 'Nia',
  scheduled_date: '2026-11-03',
  scheduled_time: '10:00',
  time_zone: zone,
  estimated_duration_minutes: 90,
  scheduled_location: { type: 'address', addressId: 'a1', label: 'Home', line: '1 Main St, Atlanta, GA, 30303', latitude: 1, longitude: 2 },
  entry_instructions: 'Code 1234',
  notes: null,
  unusual_notes: null,
  pets: 'One cat',
  will_provide_supplies: false,
  task_description: null,
  customer_subtotal: 100,
  task_amount: 100,
  service_fee: 15,
  tip: 5,
  total_customer_charge: 120,
  total_amount: 120,
  cleaner_pay: 80,
  stripe_payment_intent_id: 'pi_1',
  created_at: '2026-11-01T12:00:00Z',
}

const profiles: Record<string, any> = {
  p1: { first_name: 'Nia', last_name: 'Thomas', email: 'nia@example.com', phone: '+15550001111' },
  u1: { first_name: 'Sam', last_name: 'Lee', email: 'sam@example.com', phone: '+15550002222', street_address: '1 Main St', zip_code: '30303', stripe_customer_id: 'cus_1' },
}

function fakeAdmin(candidates: any[], claimResult: any = { data: [{ id: 'b1' }], error: null }) {
  const updates: any[] = []
  const admin = {
    from: (table: string) => {
      let isUpdate = false
      let selected = ''
      let id = ''
      const chain: any = {
        select: (cols: string) => {
          selected = cols
          return chain
        },
        update: (values: any) => {
          isUpdate = true
          updates.push(values)
          return chain
        },
        eq: (col: string, value: string) => {
          if (col === 'id') id = value
          return chain
        },
        is: () => chain,
        not: () => chain,
        gte: () => chain,
        lte: () => chain,
        maybeSingle: async () => {
          if (table === 'profiles') return { data: profiles[id] ?? null }
          if (table === 'tidypro_profiles') return { data: { phone: '+15550001111', sms_consent: 'opted_in', street_address: '9 Elm St', city: 'Decatur', state: 'GA', zip_code: '30030' } }
          if (table === 'bookings') return { data: bookingRow }
          return { data: null }
        },
        then: (resolve: any) => {
          if (isUpdate) return resolve(claimResult)
          if (table === 'booking_tasks') return resolve({ data: [{ task_name: 'Dishes', task_category: 'Kitchen' }] })
          return resolve({ data: selected.includes('on_the_way_reminder_sent_at') ? candidates : [] })
        },
      }
      return chain
    },
  } as any
  return { admin, updates }
}

beforeEach(() => {
  email.mockClear()
  sms.mockClear()
  push.mockClear()
})

describe('unresponsiveStepDue', () => {
  it('does nothing before the start time', () => {
    expect(unresponsiveStepDue(base, at('14:59:00'))).toBeNull()
  })

  it('reminds the cleaner at the start time', () => {
    expect(unresponsiveStepDue(base, at('15:00:00'))).toBe('remind')
    expect(unresponsiveStepDue(base, at('15:14:00'))).toBe('remind')
  })

  it("doesn't remind twice", () => {
    expect(unresponsiveStepDue({ ...base, on_the_way_reminder_sent_at: '2026-11-03T15:00:00Z' }, at('15:05:00'))).toBeNull()
  })

  it('alerts the admin 15 minutes after the start', () => {
    expect(unresponsiveStepDue({ ...base, on_the_way_reminder_sent_at: '2026-11-03T15:00:00Z' }, at('15:15:00'))).toBe('alert')
  })

  it('still alerts if the reminder was missed', () => {
    expect(unresponsiveStepDue(base, at('15:20:00'))).toBe('alert')
  })

  it("doesn't alert twice", () => {
    expect(unresponsiveStepDue({ ...base, unresponsive_alert_sent_at: '2026-11-03T15:15:00Z' }, at('15:30:00'))).toBeNull()
  })

  it('leaves long-past bookings alone', () => {
    expect(unresponsiveStepDue(base, at('18:01:00'))).toBeNull()
  })

  it('skips Anytime bookings', () => {
    expect(unresponsiveStepDue({ ...base, scheduled_time: null }, at('15:20:00'))).toBeNull()
  })

  it("uses the booking's own time zone", () => {
    // 10am Pacific is 18:00 UTC.
    const pacific = { ...base, time_zone: 'America/Los_Angeles' }
    expect(unresponsiveStepDue(pacific, at('15:00:00'))).toBeNull()
    expect(unresponsiveStepDue(pacific, at('18:00:00'))).toBe('remind')
  })
})

describe('checkUnresponsiveCleaners', () => {
  it('reminds the cleaner by text, push, and email at the start time', async () => {
    const { admin, updates } = fakeAdmin([{ id: 'b1', tidy_pro_id: 'p1', ...base }])
    const result = await checkUnresponsiveCleaners(admin, at('15:01:00'))

    expect(result).toEqual({ reminded: 1, alerted: 0, failed: 0 })
    expect(updates[0]).toHaveProperty('on_the_way_reminder_sent_at')
    expect(sms).toHaveBeenCalledWith('+15550001111', expect.objectContaining({ title: 'Your booking has started' }))
    expect(push).toHaveBeenCalledWith('p1', expect.objectContaining({ title: 'Your booking has started' }))
    expect(email).toHaveBeenCalledTimes(1)
    expect(email.mock.calls[0][0].to).toEqual([{ email: 'nia@example.com', name: 'Nia' }])
    expect(email.mock.calls[0][0].htmlContent).toContain("I'm on the way")
  })

  it('emails the admin with the cleaner, customer, booking, and payment details', async () => {
    const { admin, updates } = fakeAdmin([{ id: 'b1', tidy_pro_id: 'p1', ...base, on_the_way_reminder_sent_at: '2026-11-03T15:00:00Z' }])
    const result = await checkUnresponsiveCleaners(admin, at('15:16:00'))

    expect(result).toEqual({ reminded: 0, alerted: 1, failed: 0 })
    expect(updates[0]).toHaveProperty('unresponsive_alert_sent_at')
    expect(sms).not.toHaveBeenCalled()
    expect(email).toHaveBeenCalledTimes(1)
    const sent = email.mock.calls[0][0]
    expect(sent.to).toEqual([{ email: 'admin@example.com' }])
    expect(sent.subject).toBe('URGENT: CLEANER UNRESPONSIVE')
    for (const detail of [
      'Nia Thomas', '+15550001111', 'nia@example.com', '9 Elm St, Decatur, GA, 30030',
      'Sam Lee', 'sam@example.com', '+15550002222', '1 Main St, Atlanta, GA, 30303',
      'Code 1234', 'One cat', 'Dishes (Kitchen)', '$120.00', 'visa ending 4242', 'pi_1',
    ]) {
      expect(sent.htmlContent).toContain(detail)
    }
  })

  it("does nothing when another run already claimed the step", async () => {
    const { admin } = fakeAdmin([{ id: 'b1', tidy_pro_id: 'p1', ...base }], { data: [], error: null })
    const result = await checkUnresponsiveCleaners(admin, at('15:01:00'))

    expect(result).toEqual({ reminded: 0, alerted: 0, failed: 0 })
    expect(email).not.toHaveBeenCalled()
  })

  it('unclaims the alert if the admin email fails, so it retries', async () => {
    email.mockRejectedValueOnce(new Error('Brevo down'))
    const { admin, updates } = fakeAdmin([{ id: 'b1', tidy_pro_id: 'p1', ...base }])
    const result = await checkUnresponsiveCleaners(admin, at('15:16:00'))

    expect(result).toEqual({ reminded: 0, alerted: 0, failed: 1 })
    expect(updates.at(-1)).toEqual({ unresponsive_alert_sent_at: null })
  })
})
