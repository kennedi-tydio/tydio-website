/* eslint-disable @typescript-eslint/no-explicit-any -- test-only chainable Supabase query mock */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  emailShell: (body: string) => body,
  escapeHtml: (value: string) => value.replace(/</g, '&lt;'),
  TYDIO_ADMIN_EMAIL: 'admin@example.com',
}))
vi.mock('@/lib/cleanerMatching', () => ({ findAvailableCleaners: vi.fn(), MAX_TRAVEL_RADIUS_MILES: 25 }))
vi.mock('@/lib/customerNotifications', () => ({ notifyCustomer: vi.fn() }))

import { sendEmail } from '@/lib/email'
import {
  abandonedQuoteEmailHtml,
  checkAbandonedQuotes,
  markQuoteBooked,
  quotedPrice,
  recordPricingView,
  statsByPriceBucket,
  summarizeQuotes,
  type PricingView,
  type QuoteRow,
} from './pricingQuotes'

const email = vi.mocked(sendEmail)

// Records every write; reads return what each table was given.
function fakeAdmin(opts: { existing?: any; insertError?: any; quotes?: any[]; claimed?: boolean; customer?: any; pro?: any }) {
  const writes: { table: string; op: string; values: any; filters: [string, string, any][] }[] = []
  const admin = {
    from: (table: string) => {
      let op = 'select'
      const filters: [string, string, any][] = []
      const write = (o: string, values: any) => {
        op = o
        writes.push({ table, op, values, filters })
        return chain
      }
      const result = () => {
        if (op === 'insert') return { data: null, error: opts.insertError ?? null }
        if (op === 'update') return { data: opts.claimed === false ? [] : [{ id: 'q1' }], error: null }
        if (table === 'pricing_quotes') return { data: opts.quotes ?? null, error: null }
        return { data: null, error: null }
      }
      const chain: any = {
        select: () => chain,
        insert: (v: any) => write('insert', v),
        update: (v: any) => write('update', v),
        eq: (col: string, v: any) => (filters.push(['eq', col, v]), chain),
        is: (col: string, v: any) => (filters.push(['is', col, v]), chain),
        lt: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => {
          if (table === 'pricing_quotes') return { data: opts.existing ?? null, error: null }
          if (table === 'profiles') {
            const id = filters.find((f) => f[1] === 'id')?.[2]
            return { data: id === 'pro1' ? opts.pro ?? null : opts.customer ?? null, error: null }
          }
          return { data: null, error: null }
        },
        then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject),
      }
      return chain
    },
  }
  return { admin: admin as any, writes }
}

const now = new Date('2026-11-17T15:00:00Z')

const view: PricingView = {
  customerId: 'cust1',
  draftId: 'draft1',
  stage: 'cleaners',
  taskNames: ['Clean bathroom (Main bath)', 'Vacuum floors'],
  durationMinutes: 150,
  date: '2026-11-20',
  time: '09:00',
  locationLabel: 'Home · 1 Main St',
  cleanerPrices: [129.5, 110, 145.25],
}

function quote(overrides: Partial<QuoteRow> = {}): QuoteRow {
  return {
    id: 'q1',
    customer_user_id: 'cust1',
    draft_id: 'draft1',
    stage: 'review',
    task_names: ['Clean bathroom (Main bath)', 'Vacuum floors'],
    duration_minutes: 150,
    scheduled_date: '2026-11-20',
    scheduled_time: '09:00',
    location_label: 'Home · 1 Main St',
    cleaner_count: 3,
    lowest_price: 110,
    highest_price: 145.25,
    selected_tidy_pro_id: 'pro1',
    review_service_price: 129.5,
    review_total_price: 134.0,
    view_count: 2,
    first_viewed_at: '2026-11-17T12:00:00Z',
    last_viewed_at: '2026-11-17T13:00:00Z',
    booked_at: null,
    abandoned_at: null,
    ...overrides,
  }
}

beforeEach(() => {
  email.mockClear()
})

describe('recordPricingView', () => {
  it('saves a new quote with the Tidy Pro price range', async () => {
    const { admin, writes } = fakeAdmin({})
    await recordPricingView(admin, view, now)
    const insert = writes.find((w) => w.op === 'insert')!
    expect(insert.values).toMatchObject({
      customer_user_id: 'cust1',
      draft_id: 'draft1',
      stage: 'cleaners',
      cleaner_count: 3,
      lowest_price: 110,
      highest_price: 145.25,
      task_names: view.taskNames,
      first_viewed_at: now.toISOString(),
    })
  })

  it('keeps the review stage when they go back to the list, and counts the view', async () => {
    const { admin, writes } = fakeAdmin({ existing: { id: 'q1', stage: 'review', view_count: 2, booked_at: null } })
    await recordPricingView(admin, view, now)
    const update = writes.find((w) => w.op === 'update')!
    expect(update.values).toMatchObject({ stage: 'review', view_count: 3, last_viewed_at: now.toISOString() })
  })

  it('records the review total', async () => {
    const { admin, writes } = fakeAdmin({ existing: { id: 'q1', stage: 'cleaners', view_count: 1, booked_at: null } })
    await recordPricingView(admin, { ...view, stage: 'review', cleanerPrices: undefined, review: { tidyProId: 'pro1', servicePrice: 129.5, totalPrice: 134.004 } }, now)
    const update = writes.find((w) => w.op === 'update')!
    expect(update.values).toMatchObject({ stage: 'review', selected_tidy_pro_id: 'pro1', review_service_price: 129.5, review_total_price: 134 })
    expect(update.values).not.toHaveProperty('lowest_price')
  })

  it('leaves a booked quote alone', async () => {
    const { admin, writes } = fakeAdmin({ existing: { id: 'q1', stage: 'review', view_count: 2, booked_at: '2026-11-17T14:00:00Z' } })
    await recordPricingView(admin, view, now)
    expect(writes).toHaveLength(0)
  })

  it('never throws', async () => {
    const { admin } = fakeAdmin({ insertError: { code: 'XX000', message: 'boom' } })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(recordPricingView(admin, view, now)).resolves.toBeUndefined()
    spy.mockRestore()
  })
})

describe('markQuoteBooked', () => {
  it('marks the draft’s open quote booked', async () => {
    const { admin, writes } = fakeAdmin({})
    await markQuoteBooked(admin, 'draft1', 'booking1', now)
    expect(writes[0].values).toMatchObject({ booked_at: now.toISOString(), booking_id: 'booking1' })
    expect(writes[0].filters).toContainEqual(['eq', 'draft_id', 'draft1'])
    expect(writes[0].filters).toContainEqual(['is', 'booked_at', null])
  })
})

describe('checkAbandonedQuotes', () => {
  it('marks idle quotes abandoned and emails the admin the tasks and price', async () => {
    const { admin, writes } = fakeAdmin({
      quotes: [quote()],
      customer: { first_name: 'Ana', last_name: 'Lee', email: 'ana@example.com', phone: null, city: 'Atlanta', state: 'GA' },
      pro: { first_name: 'Sam', last_name: 'Pro' },
    })
    const result = await checkAbandonedQuotes(admin, now)
    expect(result).toEqual({ checked: 1, abandoned: 1, emailed: 1 })
    expect(writes[0].values).toMatchObject({ abandoned_at: now.toISOString() })
    expect(email).toHaveBeenCalledOnce()
    const sent = email.mock.calls[0][0]
    expect(sent.subject).toBe('Abandoned cart: Ana Lee left at $134.00 (2 tasks)')
    expect(sent.htmlContent).toContain('Vacuum floors')
    expect(sent.htmlContent).toContain('Sam Pro')
  })

  it('does not email a quote another run already claimed', async () => {
    const { admin } = fakeAdmin({ quotes: [quote()], claimed: false })
    const result = await checkAbandonedQuotes(admin, now)
    expect(result.emailed).toBe(0)
    expect(email).not.toHaveBeenCalled()
  })
})

describe('abandonedQuoteEmailHtml', () => {
  it('shows the price range when they left at the Tidy Pro list', () => {
    const html = abandonedQuoteEmailHtml(
      quote({ stage: 'cleaners', review_total_price: null, review_service_price: null, selected_tidy_pro_id: null }),
      null,
      null
    )
    expect(html).toContain('Abandoned cart: $110.00')
    expect(html).toContain('$110.00 – $145.25 across 3 Tidy Pros')
    expect(html).toContain('Choosing a Tidy Pro')
    expect(html).not.toContain('Total shown')
  })
})

describe('analysis', () => {
  it('uses the review total, else the cheapest Tidy Pro', () => {
    expect(quotedPrice({ review_total_price: 134, lowest_price: 110 })).toBe(134)
    expect(quotedPrice({ review_total_price: null, lowest_price: 110 })).toBe(110)
    expect(quotedPrice({ review_total_price: null, lowest_price: null })).toBeNull()
  })

  it('summarizes booking rate and average prices, leaving in-progress quotes out of the rate', () => {
    const rows = [
      quote({ booked_at: 'x', review_total_price: 80 }),
      quote({ booked_at: 'x', review_total_price: 100 }),
      quote({ abandoned_at: 'x', review_total_price: 160 }),
      quote({}),
    ]
    expect(summarizeQuotes(rows)).toEqual({
      quotes: 4,
      booked: 2,
      abandoned: 1,
      open: 1,
      bookingRate: 2 / 3,
      avgBookedPrice: 90,
      avgAbandonedPrice: 160,
    })
  })

  it('groups quotes into price bands', () => {
    const buckets = statsByPriceBucket([
      quote({ booked_at: 'x', review_total_price: 80 }),
      quote({ abandoned_at: 'x', review_total_price: 99.99 }),
      quote({ abandoned_at: 'x', review_total_price: 350 }),
    ])
    expect(buckets.find((b) => b.label === '$75 – $100')).toMatchObject({ quotes: 2, booked: 1, abandoned: 1, bookingRate: 0.5 })
    expect(buckets.find((b) => b.label === '$300+')).toMatchObject({ quotes: 1, abandoned: 1, bookingRate: 0 })
  })
})
