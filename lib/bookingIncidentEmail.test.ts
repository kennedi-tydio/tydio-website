/* eslint-disable @typescript-eslint/no-explicit-any -- test-only chainable Supabase query mock */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  emailShell: (body: string) => body,
  escapeHtml: (value: string) => value,
  TYDIO_ADMIN_EMAIL: 'admin@example.com',
}))
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
import { sendCleanerReportEscalation } from './bookingIncidentEmail'

const email = vi.mocked(sendEmail)

const bookingRow = {
  id: 'b1',
  user_id: 'u1',
  tidy_pro_id: 'p1',
  tidy_pro_name: 'Nia',
  status: 'scheduled',
  progress_status: 'cleaning',
  scheduled_date: '2026-11-03',
  scheduled_time: '10:00',
  time_zone: 'America/New_York',
  estimated_duration_minutes: 90,
  scheduled_location: { type: 'address', addressId: 'a1', label: 'Home', line: '1 Main St, Atlanta, GA, 30303', latitude: 1, longitude: 2 },
  entry_instructions: 'Code 1234',
  pets: 'One cat',
  will_provide_supplies: false,
  customer_subtotal: 100,
  service_fee: 15,
  tip: 5,
  total_customer_charge: 120,
  cleaner_pay: 80,
  stripe_payment_intent_id: 'pi_1',
  created_at: '2026-11-01T12:00:00Z',
}

const profiles: Record<string, any> = {
  p1: { first_name: 'Nia', last_name: 'Thomas', email: 'nia@example.com', phone: '+15550001111' },
  u1: { first_name: 'Sam', last_name: 'Lee', email: 'sam@example.com', phone: '+15550002222', street_address: '1 Main St', zip_code: '30303', stripe_customer_id: 'cus_1' },
}

function fakeAdmin(booking: any = bookingRow) {
  return {
    from: (table: string) => {
      let id = ''
      const chain: any = {
        select: () => chain,
        eq: (col: string, value: string) => {
          if (col === 'id') id = value
          return chain
        },
        maybeSingle: async () => {
          if (table === 'bookings') return { data: booking }
          if (table === 'profiles') return { data: profiles[id] ?? null }
          if (table === 'tidypro_profiles') return { data: { phone: '+15550001111', street_address: '9 Elm St', city: 'Decatur', state: 'GA', zip_code: '30030' } }
          return { data: null }
        },
        then: (resolve: any) => resolve({ data: table === 'booking_tasks' ? [{ task_name: 'Dishes', task_category: 'Kitchen' }] : [] }),
      }
      return chain
    },
  } as any
}

beforeEach(() => {
  email.mockClear()
})

describe('sendCleanerReportEscalation', () => {
  it('emails the admin the report, the reporting customer, the cleaner, the booking, and the payment', async () => {
    await sendCleanerReportEscalation(fakeAdmin(), 'b1', 'Left halfway through', new Date('2026-11-03T16:00:00Z'))

    expect(email).toHaveBeenCalledTimes(1)
    const sent = email.mock.calls[0][0]
    expect(sent.to).toEqual([{ email: 'admin@example.com' }])
    expect(sent.subject).toBe('ESCALATION: CLEANER REPORTED')
    for (const detail of [
      'Left halfway through', 'Nov 3, 2026, 11:00 AM', 'Reported by (customer)',
      'Sam Lee', 'sam@example.com', '+15550002222', '1 Main St, 30303', 'u1',
      'Nia Thomas', 'nia@example.com', '+15550001111', '9 Elm St, Decatur, GA, 30030',
      '1 Main St, Atlanta, GA, 30303', 'Code 1234', 'One cat', 'Dishes (Kitchen)', 'scheduled / cleaning',
      '$120.00', 'visa ending 4242', 'pi_1', 'cus_1',
    ]) {
      expect(sent.htmlContent).toContain(detail)
    }
  })

  it('sends nothing if the booking is gone', async () => {
    await sendCleanerReportEscalation(fakeAdmin(null), 'b1', 'Rude')
    expect(email).not.toHaveBeenCalled()
  })
})
