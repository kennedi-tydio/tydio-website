/* eslint-disable @typescript-eslint/no-explicit-any -- test-only chainable Supabase query mock */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  emailShell: (body: string) => body,
  escapeHtml: (value: string) => value,
  TYDIO_ADMIN_EMAIL: 'admin@example.com',
}))
vi.mock('@/lib/stripe', () => ({
  stripe: { paymentIntents: { retrieve: vi.fn() } },
}))

import { sendEmail } from '@/lib/email'
import { stripe } from '@/lib/stripe'
import { recordChargeback } from './disputes'

const email = vi.mocked(sendEmail)
const retrieveIntent = vi.mocked(stripe.paymentIntents.retrieve)

const bookingRow = {
  id: 'b1',
  user_id: 'u1',
  tidy_pro_id: 'p1',
  status: 'completed',
  time_zone: 'America/New_York',
  scheduled_date: '2026-11-03',
  scheduled_time: '10:00',
  total_customer_charge: 120,
  cleaner_pay: 80,
  stripe_payment_intent_id: 'pi_booking',
  stripe_transfer_id: 'tr_1',
  created_at: '2026-11-01T12:00:00Z',
}

function dispute(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'dp_1',
    amount: 12000,
    reason: 'product_not_received',
    charge: 'ch_1',
    payment_intent: 'pi_booking',
    evidence_details: { due_by: Date.parse('2026-11-20T04:59:00Z') / 1000 },
    ...overrides,
  }
}

// Each query records its filters; `bookings` matches by id or payment id.
function fakeAdmin({ existingDispute = false, insertError = null as string | null } = {}) {
  const inserted: any[] = []
  const admin = {
    from: (table: string) => {
      const filters: Record<string, string> = {}
      const chain: any = {
        select: () => chain,
        eq: (col: string, value: string) => {
          filters[col] = value
          return chain
        },
        insert: async (row: any) => {
          inserted.push(row)
          return { error: insertError ? { message: insertError } : null }
        },
        maybeSingle: async () => {
          if (table === 'risk_events') return { data: existingDispute ? { id: 'r1' } : null }
          if (table === 'bookings') {
            const match = filters.id === bookingRow.id || filters.stripe_payment_intent_id === bookingRow.stripe_payment_intent_id
            return { data: match ? bookingRow : null }
          }
          return { data: null }
        },
        then: (resolve: any) => resolve({ data: [] }),
      }
      return chain
    },
  } as any
  return { admin, inserted }
}

beforeEach(() => {
  email.mockClear()
  retrieveIntent.mockReset().mockResolvedValue({ status: 'succeeded', amount_received: 12000, payment_method: null, metadata: {} } as any)
})

describe('recordChargeback', () => {
  it('saves a disputed booking charge as a chargeback against the customer and emails the admin', async () => {
    const { admin, inserted } = fakeAdmin()
    await recordChargeback(admin, dispute(), 'evt_1')

    expect(inserted).toEqual([
      expect.objectContaining({
        event_type: 'chargeback',
        booking_id: 'b1',
        user_id: 'u1',
        severity: 'high',
        metadata: expect.objectContaining({ dispute_id: 'dp_1', stripe_event_id: 'evt_1', kind: 'booking', amount_cents: 12000, charge_id: 'ch_1' }),
      }),
    ])
    expect(email).toHaveBeenCalledTimes(1)
    const sent = email.mock.calls[0][0]
    expect(sent.subject).toBe('ESCALATION: CHARGEBACK')
    for (const detail of ['$120.00', 'product not received', 'Nov 19, 2026, 11:59 PM', 'Already paid (tr_1)', 'dp_1']) {
      expect(sent.htmlContent).toContain(detail)
    }
  })

  it('ties a disputed tip back to its booking', async () => {
    retrieveIntent.mockResolvedValue({ metadata: { kind: 'tip', booking_id: 'b1' } } as any)
    const { admin, inserted } = fakeAdmin()
    await recordChargeback(admin, dispute({ payment_intent: 'pi_tip', amount: 500 }), 'evt_2')

    expect(inserted[0]).toMatchObject({ booking_id: 'b1', user_id: 'u1', metadata: { kind: 'tip' } })
    expect(email.mock.calls[0][0].htmlContent).toContain('Tip')
  })

  it('records a disputed background check fee against the cleaner', async () => {
    retrieveIntent.mockResolvedValue({ metadata: { kind: 'background_check_fee', pro_id: 'p9' } } as any)
    const { admin, inserted } = fakeAdmin()
    await recordChargeback(admin, dispute({ payment_intent: 'pi_fee', amount: 3500 }), 'evt_3')

    expect(inserted[0]).toMatchObject({ booking_id: null, user_id: 'p9', metadata: { kind: 'background_check_fee' } })
    expect(email).toHaveBeenCalledTimes(1)
    expect(email.mock.calls[0][0].htmlContent).toContain('pi_fee')
  })

  it('does nothing for a dispute already recorded, so retried webhooks are harmless', async () => {
    const { admin, inserted } = fakeAdmin({ existingDispute: true })
    await recordChargeback(admin, dispute(), 'evt_1')

    expect(inserted).toEqual([])
    expect(email).not.toHaveBeenCalled()
  })

  it('throws when the dispute cannot be saved, so Stripe retries the webhook', async () => {
    const { admin } = fakeAdmin({ insertError: 'db down' })
    await expect(recordChargeback(admin, dispute(), 'evt_1')).rejects.toThrow('db down')
    expect(email).not.toHaveBeenCalled()
  })

  it('keeps the saved dispute when the email fails', async () => {
    email.mockRejectedValueOnce(new Error('smtp down'))
    const { admin, inserted } = fakeAdmin()
    await expect(recordChargeback(admin, dispute(), 'evt_1')).resolves.toBeUndefined()
    expect(inserted).toHaveLength(1)
  })
})
