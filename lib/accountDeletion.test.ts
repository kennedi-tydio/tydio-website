/* eslint-disable @typescript-eslint/no-explicit-any -- test-only chainable Supabase query mock */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const customersDel = vi.fn<(id: string) => Promise<object>>(async () => ({}))
vi.mock('@/lib/stripe', () => ({ stripe: { customers: { del: (id: string) => customersDel(id) } } }))

import { OPEN_BOOKINGS_MESSAGE, UNPAID_PAYOUT_MESSAGE, deleteOwnAccount } from './accountDeletion'

type Options = {
  openBookings?: number
  openGroups?: number
  openIncidents?: number
  unpaidBookings?: number
  deleteError?: boolean
  stripeCustomerId?: string | null
  ownBookingIds?: string[]
}

function fakeAdmin(opts: Options = {}) {
  const deletedProfiles: string[] = []
  const removed: { bucket: string; paths: string[] }[] = []
  const rows = (n = 0) => Array.from({ length: n }, (_, i) => ({ id: `row-${i}` }))

  const admin = {
    from: (table: string) => {
      const filters: Record<string, unknown> = {}
      let deleting = false
      const result = () => {
        if (deleting) return opts.deleteError ? { data: null, error: { message: 'boom' } } : { data: [{ id: 'p1' }], error: null }
        if (table === 'booking_request_groups') return { data: rows(opts.openGroups) }
        if (table === 'bookings' && filters.status === 'completed') return { data: rows(opts.unpaidBookings) }
        if (table === 'bookings' && filters.incident) return { data: rows(opts.openIncidents) }
        if (table === 'bookings' && filters.in) return { data: rows(opts.openBookings) }
        if (table === 'bookings') return { data: (opts.ownBookingIds ?? []).map(id => ({ id })) }
        return { data: null }
      }
      const chain: any = {
        select: () => chain,
        or: (expr: string) => {
          if (expr.includes('status.eq.completed')) filters.status = 'completed'
          return chain
        },
        is: () => chain,
        gt: () => chain,
        not: (column: string) => {
          if (column === 'incident_type') filters.incident = true
          return chain
        },
        in: () => { filters.in = true; return chain },
        eq: (column: string, value: unknown) => {
          filters[column] = value
          if (deleting) deletedProfiles.push(value as string)
          return chain
        },
        delete: () => { deleting = true; return chain },
        limit: async () => result(),
        maybeSingle: async () => ({ data: table === 'profiles' ? { stripe_customer_id: opts.stripeCustomerId ?? null } : null }),
        then: (resolve: (v: unknown) => void) => resolve(result()),
      }
      return chain
    },
    storage: {
      from: (bucket: string) => ({
        list: async (prefix: string) => ({ data: [{ name: `${prefix}-file.jpg` }] }),
        remove: async (paths: string[]) => { removed.push({ bucket, paths }); return { error: null } },
      }),
    },
  } as any

  return { admin, deletedProfiles, removed }
}

beforeEach(() => customersDel.mockClear())

describe('deleteOwnAccount', () => {
  it('refuses while a booking is pending or scheduled', async () => {
    const { admin, deletedProfiles } = fakeAdmin({ openBookings: 1 })
    expect(await deleteOwnAccount(admin, 'p1')).toEqual({ error: OPEN_BOOKINGS_MESSAGE })
    expect(deletedProfiles).toEqual([])
  })

  it('refuses while a reported incident is still unsettled', async () => {
    const { admin, deletedProfiles } = fakeAdmin({ openIncidents: 1 })
    expect(await deleteOwnAccount(admin, 'p1')).toEqual({ error: OPEN_BOOKINGS_MESSAGE })
    expect(deletedProfiles).toEqual([])
  })

  it('refuses while a booking request is still open', async () => {
    const { admin, deletedProfiles } = fakeAdmin({ openGroups: 1 })
    expect(await deleteOwnAccount(admin, 'p1')).toEqual({ error: OPEN_BOOKINGS_MESSAGE })
    expect(deletedProfiles).toEqual([])
  })

  it('refuses while a completed booking has not been paid out', async () => {
    const { admin, deletedProfiles } = fakeAdmin({ unpaidBookings: 1 })
    expect(await deleteOwnAccount(admin, 'p1')).toEqual({ error: UNPAID_PAYOUT_MESSAGE })
    expect(deletedProfiles).toEqual([])
  })

  it('deletes the profile, its files, and the Stripe customer', async () => {
    const { admin, deletedProfiles, removed } = fakeAdmin({ stripeCustomerId: 'cus_1', ownBookingIds: ['b1'] })
    expect(await deleteOwnAccount(admin, 'p1')).toEqual({ success: true })
    expect(deletedProfiles).toEqual(['p1'])
    expect(removed).toEqual(expect.arrayContaining([
      { bucket: 'profile-photos', paths: ['p1/p1-file.jpg'] },
      { bucket: 'insurance-documents', paths: ['p1/p1-file.jpg'] },
      { bucket: 'task-photos', paths: ['b1/b1-file.jpg'] },
    ]))
    expect(customersDel).toHaveBeenCalledWith('cus_1')
  })

  it('reports a failed delete and leaves files and Stripe alone', async () => {
    const { admin, removed } = fakeAdmin({ deleteError: true, stripeCustomerId: 'cus_1' })
    expect(await deleteOwnAccount(admin, 'p1')).toEqual({ error: expect.any(String) })
    expect(removed).toEqual([])
    expect(customersDel).not.toHaveBeenCalled()
  })
})
