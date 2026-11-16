/* eslint-disable @typescript-eslint/no-explicit-any -- test-only chainable Supabase query mock */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/stripe', () => ({ stripe: {} }))
vi.mock('@/lib/email', () => ({ TYDIO_ADMIN_EMAIL: 'admin@example.com', sendEmail: vi.fn(async () => {}), emailShell: (b: string) => b, escapeHtml: (s: string) => s }))
vi.mock('@/lib/bookingRequestGroups', () => ({
  refundBookingTotal: vi.fn(async (_admin: unknown, _booking: unknown, policy: string) => ({ refundId: policy === 'full' ? 're_full' : 're_half', refunded: 0 })),
}))
vi.mock('@/lib/bookings', () => ({ completeBookingPayout: vi.fn(async () => ({ success: true })) }))
vi.mock('@/lib/cleanerStatus', () => ({ pauseCleaner: vi.fn(async () => {}) }))

import { refundBookingTotal } from '@/lib/bookingRequestGroups'
import { completeBookingPayout } from '@/lib/bookings'
import { pauseCleaner } from '@/lib/cleanerStatus'
import { sendEmail } from '@/lib/email'
import { resolveBookingIncident } from './bookingIncidents'

const BOOKING = {
  id: 'b1',
  user_id: 'c1',
  tidy_pro_id: 'p1',
  incident_type: 'cleaner_no_show',
  incident_resolved_at: null as string | null,
  stripe_payment_intent_id: 'pi_1',
  total_customer_charge: 100,
  cleaner_pay: 80,
  scheduled_date: '2026-12-01',
  time_zone: 'America/New_York',
}

function fakeAdmin(booking = BOOKING, { claimWins = true } = {}) {
  const updates: { table: string; values: Record<string, unknown> }[] = []
  const admin = {
    from: (table: string) => {
      let update: Record<string, unknown> | null = null
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        is: () => chain,
        update: (values: Record<string, unknown>) => {
          update = values
          updates.push({ table, values })
          return chain
        },
        maybeSingle: async () => {
          if (table === 'bookings') return { data: booking }
          if (table === 'profiles') return { data: { email: `${table}@example.com`, first_name: 'Sam' } }
          return { data: null }
        },
        then: (resolve: (v: unknown) => void) => {
          const claiming = update && 'incident_resolved_at' in update && update.incident_resolved_at != null
          resolve({ data: claiming ? (claimWins ? [{ id: booking.id }] : []) : null, error: null })
        },
      }
      return chain
    },
  } as any
  return { admin, updates }
}

beforeEach(() => vi.clearAllMocks())

describe('resolveBookingIncident', () => {
  it('refunds half, pays the cleaner half their pay, and emails both', async () => {
    const { admin, updates } = fakeAdmin()
    const result = await resolveBookingIncident(admin, 'b1', 'half', 'Sorry about this', false)

    expect(result).toEqual({ success: true, refund: 50, cleanerPay: 40 })
    expect(refundBookingTotal).toHaveBeenCalledWith(admin, expect.objectContaining({ stripe_payment_intent_id: 'pi_1' }), 'half')
    expect(updates.find((u) => u.values.incident_refund_level)?.values).toMatchObject({ incident_refund_level: 'half', cleaner_pay: 40, incident_note: 'Sorry about this' })
    expect(updates.some((u) => u.values.stripe_refund_id === 're_half')).toBe(true)
    expect(completeBookingPayout).toHaveBeenCalledWith(admin, 'b1')
    expect(sendEmail).toHaveBeenCalledTimes(2)
  })

  it('refunds in full, pays nothing, and pauses the cleaner when asked', async () => {
    const { admin } = fakeAdmin()
    const result = await resolveBookingIncident(admin, 'b1', 'full', null, true)

    expect(result).toMatchObject({ refund: 100, cleanerPay: 0 })
    expect(refundBookingTotal).toHaveBeenCalledWith(admin, expect.objectContaining({ stripe_payment_intent_id: 'pi_1' }), 'full')
    expect(completeBookingPayout).not.toHaveBeenCalled()
    expect(pauseCleaner).toHaveBeenCalledWith(admin, 'p1', expect.stringContaining('no-show'), expect.any(Date))
  })

  it('settles a reported no-show automatically: refund less the fee, no pay, flag left open', async () => {
    vi.mocked(refundBookingTotal).mockResolvedValueOnce({ refundId: 're_net', refunded: 96.8 })
    const { admin, updates } = fakeAdmin()
    const result = await resolveBookingIncident(admin, 'b1', 'minus_fee', null, false, new Date(), { automatic: true })

    expect(result).toEqual({ success: true, refund: 96.8, cleanerPay: 0 })
    expect(refundBookingTotal).toHaveBeenCalledWith(admin, expect.objectContaining({ stripe_payment_intent_id: 'pi_1' }), 'minus_fee')
    expect(completeBookingPayout).not.toHaveBeenCalled()
    expect(pauseCleaner).not.toHaveBeenCalled()
    // The admin still decides whether to pause them.
    expect(updates.some((u) => u.table === 'risk_events')).toBe(false)
  })

  it('moves no money back to the customer when there is no refund', async () => {
    const { admin } = fakeAdmin()
    const result = await resolveBookingIncident(admin, 'b1', 'none', null, false)

    expect(result).toMatchObject({ refund: 0, cleanerPay: 80 })
    expect(refundBookingTotal).not.toHaveBeenCalled()
    expect(completeBookingPayout).toHaveBeenCalled()
  })

  it('unclaims the incident when the refund fails, so it can be tried again', async () => {
    vi.mocked(refundBookingTotal).mockRejectedValueOnce(new Error('card_declined'))
    const { admin, updates } = fakeAdmin()
    const result = await resolveBookingIncident(admin, 'b1', 'full', null, false)

    expect(result).toEqual({ error: 'Refund failed: card_declined' })
    expect(updates.at(-1)?.values).toMatchObject({ incident_resolved_at: null, cleaner_pay: 80 })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('refuses an incident that is already settled', async () => {
    const { admin } = fakeAdmin({ ...BOOKING, incident_resolved_at: '2026-12-01T15:00:00Z' })
    expect(await resolveBookingIncident(admin, 'b1', 'full', null, false)).toEqual({ error: 'This incident has already been settled.' })
    expect(refundBookingTotal).not.toHaveBeenCalled()
  })

  it('refuses when another admin settles it first', async () => {
    const { admin } = fakeAdmin(BOOKING, { claimWins: false })
    expect(await resolveBookingIncident(admin, 'b1', 'half', null, false)).toEqual({ error: 'This incident has already been settled.' })
    expect(refundBookingTotal).not.toHaveBeenCalled()
  })
})
