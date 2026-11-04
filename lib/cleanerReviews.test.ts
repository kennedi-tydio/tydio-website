/* eslint-disable @typescript-eslint/no-explicit-any -- test-only chainable Supabase query mock */
import { describe, expect, it } from 'vitest'
import { getHiddenReviews, listCleanerReviews } from './cleanerReviews'

const reviews = [
  { id: 'r_new', booking_id: 'b_new', user_id: 'u1', rating: 2, review_text: 'Hidden for now', created_at: '2026-11-03T10:00:00Z' },
  { id: 'r_old', booking_id: 'b_old', user_id: 'u2', rating: 5, review_text: 'Great', created_at: '2026-10-01T10:00:00Z' },
]

function fakeAdmin(data: { recentBookingIds: string[]; ownReviewBookingIds: string[] }) {
  const results: Record<string, unknown[]> = {
    bookings: data.recentBookingIds.map((id) => ({ id })),
    reviews,
    cleaner_reviews_of_customers: data.ownReviewBookingIds.map((booking_id) => ({ booking_id })),
    profiles: [
      { id: 'u1', first_name: 'Ana' },
      { id: 'u2', first_name: null },
    ],
  }
  return {
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        gt: () => chain,
        in: () => chain,
        order: () => chain,
        limit: () => chain,
        then: (resolve: any) => resolve({ data: results[table], error: null }),
      }
      return chain
    },
  } as any
}

describe('getHiddenReviews', () => {
  it('hides a recent review until the cleaner has left theirs', async () => {
    const admin = fakeAdmin({ recentBookingIds: ['b_new'], ownReviewBookingIds: [] })
    expect((await getHiddenReviews(admin, 'pro_1')).map((r) => r.booking_id)).toContain('b_new')
  })

  it('reveals it once the cleaner has reviewed', async () => {
    const admin = fakeAdmin({ recentBookingIds: ['b_new'], ownReviewBookingIds: ['b_new'] })
    expect((await getHiddenReviews(admin, 'pro_1')).map((r) => r.booking_id)).not.toContain('b_new')
  })

  it('hides nothing when no booking is inside the window', async () => {
    const admin = fakeAdmin({ recentBookingIds: [], ownReviewBookingIds: [] })
    expect(await getHiddenReviews(admin, 'pro_1')).toEqual([])
  })
})

describe('listCleanerReviews', () => {
  const admin = fakeAdmin({ recentBookingIds: ['b_new'], ownReviewBookingIds: [] })

  it('shows customers everything', async () => {
    const list = await listCleanerReviews(admin, 'pro_1', { forTidyProThemself: false })
    expect(list.map((r) => r.id)).toEqual(['r_new', 'r_old'])
  })

  it('leaves out reviews still hidden from the cleaner', async () => {
    const list = await listCleanerReviews(fakeAdmin({ recentBookingIds: ['b_new'], ownReviewBookingIds: ['b_old'] }), 'pro_1', { forTidyProThemself: true })
    expect(list.map((r) => r.id)).not.toContain('r_new')
    expect(list.map((r) => r.id)).toContain('r_old')
  })

  it('names reviewers by first name, with a fallback', async () => {
    const list = await listCleanerReviews(admin, 'pro_1', { forTidyProThemself: false })
    expect(list.map((r) => r.reviewerFirstName)).toEqual(['Ana', 'Customer'])
  })
})
