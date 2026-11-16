/* eslint-disable @typescript-eslint/no-explicit-any -- test-only chainable Supabase query mock */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/bookingRequestGroups', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/bookingRequestGroups')>()),
  cancelBookingAsAdmin: vi.fn(),
}))
vi.mock('@/lib/recurringBookings', () => ({ dropSeriesForTidyPro: vi.fn() }))
vi.mock('@/lib/tidyProCancellation', () => ({ cancelBookingForTidyPro: vi.fn(), declineRequestForTidyPro: vi.fn() }))

import { cancelBookingAsAdmin } from '@/lib/bookingRequestGroups'
import { dropSeriesForTidyPro } from '@/lib/recurringBookings'
import { cancelBookingForTidyPro, declineRequestForTidyPro } from '@/lib/tidyProCancellation'
import { cancelBookingsForAccounts, describeAccountCancellations } from './accountBookingCancellation'

type Row = Record<string, unknown>

function booking(id: string, fields: Row = {}): Row {
  return {
    id,
    status: 'scheduled',
    progress_status: null,
    request_group_id: null,
    cancelled_reason: null,
    stripe_payment_intent_id: `pi_${id}`,
    stripe_refund_id: null,
    cleaner_marked_complete_at: null,
    ...fields,
  }
}

// Answers selects from the given tables and records updates.
function fakeAdmin(tables: { profiles: Row[]; bookings?: Row[]; recurring_bookings?: Row[] }, statusAfter: Record<string, string> = {}) {
  const updates: { table: string; values: Row; filters: string[] }[] = []
  const admin = {
    from: (table: string) => {
      let values: Row | null = null
      const filters: string[] = []
      const rows = () => (tables as Record<string, Row[] | undefined>)[table] ?? []
      const chain: any = {
        select: () => chain,
        update: (v: Row) => { values = v; return chain },
        eq: (c: string, v: unknown) => { filters.push(`${c}=${v}`); return chain },
        neq: () => chain,
        in: () => chain,
        maybeSingle: async () => ({ data: { status: statusAfter[filters.find(f => f.startsWith('id='))!.slice(3)] ?? 'scheduled' } }),
        then: (resolve: (v: unknown) => void) => {
          if (values) updates.push({ table, values, filters })
          return Promise.resolve({ data: values ? null : rows(), error: null }).then(resolve)
        },
      }
      return chain
    },
  }
  return { admin: admin as any, updates }
}

beforeEach(() => {
  vi.mocked(cancelBookingAsAdmin).mockReset().mockResolvedValue({ success: true })
  vi.mocked(dropSeriesForTidyPro).mockReset().mockResolvedValue({ userId: 'u1' })
  vi.mocked(cancelBookingForTidyPro).mockReset().mockResolvedValue({ success: true })
  vi.mocked(declineRequestForTidyPro).mockReset().mockResolvedValue({ success: true })
})

describe('cancelBookingsForAccounts', () => {
  it('cancels a customer’s upcoming bookings with a full refund and stops their recurring series', async () => {
    const { admin, updates } = fakeAdmin({
      profiles: [{ id: 'u1', role: 'USER' }],
      bookings: [
        booking('b1'),
        booking('b2', { status: 'pending' }),
        booking('b3', { stripe_payment_intent_id: null }),
        booking('b4', { progress_status: 'in_progress' }),
        booking('b5', { cleaner_marked_complete_at: '2026-11-01' }),
        booking('b6', { status: 'declined' }),
        booking('b7', { status: 'declined', request_group_id: 'g9' }),
      ],
    })

    const result = await cancelBookingsForAccounts(admin, ['u1'], 'suspend')

    expect(result).toEqual({ cancelled: 4, released: 0, inProgress: 1, failed: 0 })
    const calls = vi.mocked(cancelBookingAsAdmin).mock.calls
    expect(calls.map(c => [c[1], c[2]])).toEqual([['b1', 'full'], ['b2', 'full'], ['b3', 'none'], ['b6', 'full']])
    expect(calls[0][3]).toMatch(/suspended/)
    expect(updates).toContainEqual(expect.objectContaining({
      table: 'recurring_bookings',
      values: expect.objectContaining({ status: 'cancelled' }),
      filters: ['user_id=u1', 'status=active'],
    }))
  })

  it('handles a Tidy Pro as if they had declined their requests and canceled their bookings', async () => {
    const { admin } = fakeAdmin({
      profiles: [{ id: 'p1', role: 'TIDYPRO' }],
      recurring_bookings: [{ id: 's1' }],
      bookings: [
        booking('b1', { status: 'pending', request_group_id: 'g1' }),
        booking('b2', { status: 'pending' }),
        booking('b3', { progress_status: 'on_the_way' }),
        booking('b4', { progress_status: 'cleaning' }),
      ],
    })

    const result = await cancelBookingsForAccounts(admin, ['p1'], 'ban')

    expect(result).toEqual({ cancelled: 0, released: 3, inProgress: 1, failed: 0 })
    // Only their own request is declined; others asked alongside them can still accept.
    expect(vi.mocked(declineRequestForTidyPro).mock.calls.map(c => c[1])).toEqual([
      { bookingId: 'b1', tidyProId: 'p1' },
      { bookingId: 'b2', tidyProId: 'p1' },
    ])
    expect(cancelBookingForTidyPro).toHaveBeenCalledWith(admin, {
      bookingId: 'b3',
      tidyProId: 'p1',
      reason: { cancellation_reason: 'no_longer_available', cancellation_note: 'Account banned' },
    })
    expect(cancelBookingAsAdmin).not.toHaveBeenCalled()
    expect(dropSeriesForTidyPro).toHaveBeenCalledWith(admin, 's1', 'p1')
  })

  it('counts a booking as failed only if it is still open afterwards', async () => {
    vi.mocked(cancelBookingAsAdmin).mockResolvedValue({ error: 'nope' })
    const { admin } = fakeAdmin(
      { profiles: [{ id: 'u1', role: 'USER' }], bookings: [booking('b1'), booking('b2')] },
      { b1: 'cancelled' }
    )
    expect(await cancelBookingsForAccounts(admin, ['u1'], 'ban')).toEqual({ cancelled: 0, released: 0, inProgress: 0, failed: 1 })
  })

  it('does nothing for no accounts', async () => {
    const { admin } = fakeAdmin({ profiles: [] })
    expect(await cancelBookingsForAccounts(admin, [], 'ban')).toEqual({ cancelled: 0, released: 0, inProgress: 0, failed: 0 })
  })
})

describe('describeAccountCancellations', () => {
  it('is empty when nothing happened', () => {
    expect(describeAccountCancellations({ cancelled: 0, released: 0, inProgress: 0, failed: 0 })).toBe('')
  })
})
