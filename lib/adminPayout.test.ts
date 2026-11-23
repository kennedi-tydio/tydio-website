/* eslint-disable @typescript-eslint/no-explicit-any -- test-only chainable Supabase query mock */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/bookings', () => ({ completeBookingPayout: vi.fn(async () => ({ success: true })) }))
vi.mock('@/lib/stripe', () => ({ stripe: { transfers: { list: vi.fn() } } }))

import { completeBookingPayout } from '@/lib/bookings'
import { canAdminPayNow, canHoldPayout, payTidyProNow } from './adminPayout'

const BOOKING = { id: 'b1', status: 'completed', tidy_pro_id: 'p1', cleaner_pay: 80, stripe_transfer_id: null as string | null }
const PAYABLE_PRO = { stripe_account_id: 'acct_1', stripe_onboarding_completed: true }

// Each read of the booking returns the next entry: before paying, then after.
function fakeAdmin(bookingReads: unknown[], tidyPro: unknown = PAYABLE_PRO, updates: unknown[] = []) {
  const reads = [...bookingReads]
  return {
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        update: (values: unknown) => {
          updates.push(values)
          return chain
        },
        eq: () => chain,
        maybeSingle: async () => {
          if (table === 'bookings') return { data: reads.shift() ?? null, error: null }
          if (table === 'tidypro_profiles') return { data: tidyPro, error: null }
          return { data: null, error: null }
        },
      }
      return chain
    },
  } as any
}

beforeEach(() => vi.clearAllMocks())

describe('canAdminPayNow', () => {
  it('allows a completed booking with pay owed and no transfer yet', () => {
    expect(canAdminPayNow(BOOKING)).toBe(true)
  })

  it('refuses one already paid, not completed, without a Tidy Pro or with nothing owed', () => {
    expect(canAdminPayNow({ ...BOOKING, stripe_transfer_id: 'tr_1' })).toBe(false)
    expect(canAdminPayNow({ ...BOOKING, status: 'scheduled' })).toBe(false)
    expect(canAdminPayNow({ ...BOOKING, tidy_pro_id: null })).toBe(false)
    expect(canAdminPayNow({ ...BOOKING, cleaner_pay: 0 })).toBe(false)
  })
})

describe('canHoldPayout', () => {
  const open = { status: 'scheduled', tidy_pro_id: 'p1', stripe_transfer_id: null, payout_held_at: null, payout_adjusted_at: null }

  it('allows an accepted or completed booking whose payout hasn’t gone out', () => {
    expect(canHoldPayout(open)).toBe(true)
    expect(canHoldPayout({ ...open, status: 'completed' })).toBe(true)
  })

  it('refuses one already paid, held, set by a refund, unassigned or canceled', () => {
    expect(canHoldPayout({ ...open, status: 'completed', stripe_transfer_id: 'tr_1' })).toBe(false)
    expect(canHoldPayout({ ...open, payout_held_at: '2026-11-22T15:00:00Z' })).toBe(false)
    expect(canHoldPayout({ ...open, payout_adjusted_at: '2026-11-22T15:00:00Z' })).toBe(false)
    expect(canHoldPayout({ ...open, tidy_pro_id: null })).toBe(false)
    expect(canHoldPayout({ ...open, status: 'cancelled' })).toBe(false)
  })
})

describe('payTidyProNow', () => {
  it('pays now', async () => {
    const updates: unknown[] = []
    const admin = fakeAdmin([BOOKING, { stripe_transfer_id: 'tr_1' }], PAYABLE_PRO, updates)
    expect(await payTidyProNow(admin, 'b1')).toEqual({ success: true, amount: 80 })
    expect(completeBookingPayout).toHaveBeenCalledWith(admin, 'b1')
    expect(updates).toEqual([])
  })

  it('releases a held payout before paying it', async () => {
    const updates: unknown[] = []
    const admin = fakeAdmin([{ ...BOOKING, payout_held_at: '2026-11-22T15:00:00Z' }, { stripe_transfer_id: 'tr_1' }], PAYABLE_PRO, updates)
    expect(await payTidyProNow(admin, 'b1')).toEqual({ success: true, amount: 80 })
    expect(updates).toEqual([{ payout_held_at: null, payout_hold_note: null }])
    expect(completeBookingPayout).toHaveBeenCalledWith(admin, 'b1')
  })

  it('won’t pay twice', async () => {
    const result = await payTidyProNow(fakeAdmin([{ ...BOOKING, stripe_transfer_id: 'tr_1' }]), 'b1')
    expect(result).toEqual({ error: expect.stringContaining('already been paid') })
    expect(completeBookingPayout).not.toHaveBeenCalled()
  })

  it('says so when the Tidy Pro hasn’t finished payout setup', async () => {
    const result = await payTidyProNow(fakeAdmin([BOOKING], { stripe_account_id: 'acct_1', stripe_onboarding_completed: false }), 'b1')
    expect(result).toEqual({ error: expect.stringContaining('setting up payouts') })
    expect(completeBookingPayout).not.toHaveBeenCalled()
  })

  it('reports a transfer that didn’t go out', async () => {
    const result = await payTidyProNow(fakeAdmin([BOOKING, { stripe_transfer_id: null }]), 'b1')
    expect(result).toEqual({ error: expect.stringContaining('wasn’t sent') })
  })

  it('passes on a failed transfer', async () => {
    vi.mocked(completeBookingPayout).mockResolvedValueOnce({ error: 'Card declined' })
    expect(await payTidyProNow(fakeAdmin([BOOKING]), 'b1')).toEqual({ error: 'Card declined' })
  })
})
