/* eslint-disable @typescript-eslint/no-explicit-any -- test-only chainable Supabase query mock */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  emailShell: (body: string) => body,
  escapeHtml: (value: string) => value.replace(/</g, '&lt;'),
  TYDIO_ADMIN_EMAIL: 'admin@example.com',
}))
vi.mock('@/lib/cleanerMatching', () => ({ findAvailableCleaners: vi.fn(), MAX_TRAVEL_RADIUS_MILES: 25 }))
vi.mock('@/lib/customerNotifications', () => ({ notifyCustomer: vi.fn().mockResolvedValue(undefined) }))

import { sendEmail } from '@/lib/email'
import { findAvailableCleaners } from '@/lib/cleanerMatching'
import { notifyCustomer } from '@/lib/customerNotifications'
import {
  cleanerAvailableEmailHtml,
  describeSearchTime,
  hasSearchTimePassed,
  notifyCustomersOfNewCleaner,
  recordUnmetSearch,
  searchTimePhrase,
  unmetSearchAdminEmailHtml,
  type UnmetSearchInput,
} from './unmetBookingSearches'

const email = vi.mocked(sendEmail)
const find = vi.mocked(findAvailableCleaners)
const notify = vi.mocked(notifyCustomer)

const zone = 'America/New_York'

// Records every write; reads return what each table was given.
function fakeAdmin(opts: {
  open?: any
  insertError?: any
  searches?: any[]
  claimed?: boolean
  customer?: any
  pro?: any
}) {
  const writes: { table: string; op: string; values: any }[] = []
  const admin = {
    from: (table: string) => {
      let op = 'select'
      let values: any = null
      let selected = false
      const chain: any = {
        select: () => {
          selected = true
          return chain
        },
        insert: (v: any) => {
          op = 'insert'
          values = v
          writes.push({ table, op, values: v })
          return chain
        },
        update: (v: any) => {
          op = 'update'
          values = v
          writes.push({ table, op, values: v })
          return chain
        },
        eq: () => chain,
        is: () => chain,
        in: () => chain,
        gte: () => chain,
        lte: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => {
          if (table === 'profiles') return { data: opts.customer ?? null }
          if (table === 'tidypro_profiles') return { data: opts.pro ?? null }
          return { data: opts.open ?? null, error: null }
        },
        single: async () => (opts.insertError ? { data: null, error: opts.insertError } : { data: { id: 'new1' }, error: null }),
        then: (resolve: any) => {
          if (op === 'update' && selected) return resolve({ data: opts.claimed === false ? [] : [{ id: 'x' }], error: null })
          if (op === 'select') return resolve({ data: opts.searches ?? [], error: null })
          return resolve({ data: null, error: null, values })
        },
      }
      return chain
    },
  } as any
  return { admin, writes }
}

const input: UnmetSearchInput = {
  customerId: 'c1',
  draftId: 'd1',
  location: { latitude: 33.75, longitude: -84.39, label: 'Home · 1 Main St, Atlanta, GA, 30303' },
  date: '2026-11-20',
  time: '09:00',
  timeZone: zone,
  durationMinutes: 210,
  requiredServices: ['taskBased', 'laundry'],
  tasks: [{ name: 'Wipe counters', room: 'Kitchen' }, { name: 'Wash & fold' }],
  estimatedPrice: 142.5,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('search time wording', () => {
  it('describes a date and time, or the lack of one', () => {
    expect(describeSearchTime('2026-11-20', '09:00')).toBe('Fri, Nov 20 at 9:00 AM')
    expect(describeSearchTime('2026-11-20', null)).toBe('Fri, Nov 20')
    expect(describeSearchTime(null, '13:30')).toBe('any day at 1:30 PM')
    expect(describeSearchTime(null, null)).toBe('any day')
  })

  it('builds the phrase for the customer message', () => {
    expect(searchTimePhrase('2026-11-20', '09:00')).toBe(' on Fri, Nov 20 at 9:00 AM')
    expect(searchTimePhrase(null, '09:00')).toBe(' at 9:00 AM')
    expect(searchTimePhrase(null, null)).toBe('')
  })

  it('describes date ranges and time windows', () => {
    expect(describeSearchTime('2026-11-20', '09:00', '2026-11-25', '13:00')).toBe('Fri, Nov 20 – Wed, Nov 25, starting 9:00 AM – 1:00 PM')
    expect(describeSearchTime('2026-11-20', null, '2026-11-25', null)).toBe('Fri, Nov 20 – Wed, Nov 25')
    expect(searchTimePhrase('2026-11-20', '09:00', '2026-11-25', '13:00')).toBe(
      ' between Fri, Nov 20 and Wed, Nov 25, starting between 9:00 AM and 1:00 PM'
    )
    expect(searchTimePhrase(null, '09:00', null, '13:00')).toBe(' starting between 9:00 AM and 1:00 PM')
  })
})

describe('hasSearchTimePassed', () => {
  const now = new Date('2026-11-20T13:30:00Z') // 8:30am Eastern

  it('passes a timed search once the hour-before cutoff passes', () => {
    expect(hasSearchTimePassed({ scheduled_date: '2026-11-20', scheduled_time: '09:00' }, now, zone)).toBe(true)
    expect(hasSearchTimePassed({ scheduled_date: '2026-11-20', scheduled_time: '10:00' }, now, zone)).toBe(false)
  })

  it('keeps an anytime search open through its day', () => {
    expect(hasSearchTimePassed({ scheduled_date: '2026-11-20', scheduled_time: null }, now, zone)).toBe(false)
    expect(hasSearchTimePassed({ scheduled_date: '2026-11-19', scheduled_time: null }, now, zone)).toBe(true)
  })

  it('keeps a range open until its last date and latest start', () => {
    const range = { scheduled_date: '2026-11-18', scheduled_end_date: '2026-11-20', scheduled_time: '08:00', scheduled_end_time: '10:00' }
    expect(hasSearchTimePassed(range, now, zone)).toBe(false)
    expect(hasSearchTimePassed({ ...range, scheduled_end_time: '09:00' }, now, zone)).toBe(true)
    expect(hasSearchTimePassed({ ...range, scheduled_time: null, scheduled_end_time: null }, now, zone)).toBe(false)
  })

  it('never passes an any-day search', () => {
    expect(hasSearchTimePassed({ scheduled_date: null, scheduled_time: '09:00' }, now, zone)).toBe(false)
  })
})

describe('recordUnmetSearch', () => {
  it('saves a new search and emails the admin the booking details', async () => {
    const { admin, writes } = fakeAdmin({
      customer: { first_name: 'Ana', last_name: 'Lee', email: 'ana@example.com', phone: '+14045550100', city: 'Atlanta', state: 'GA', zip_code: '30303' },
    })

    expect(await recordUnmetSearch(admin, input)).toBe(true)

    const insert = writes.find((w) => w.op === 'insert')!
    expect(insert.values).toMatchObject({
      customer_user_id: 'c1',
      draft_id: 'd1',
      scheduled_date: '2026-11-20',
      scheduled_time: '09:00',
      time_zone: zone,
      task_names: ['Wipe counters (Kitchen)', 'Wash & fold'],
    })
    expect(email).toHaveBeenCalledTimes(1)
    const sent = email.mock.calls[0][0]
    expect(sent.to).toEqual([{ email: 'admin@example.com' }])
    expect(sent.subject).toBe('No Tidy Pros available for Ana Lee (Fri, Nov 20 at 9:00 AM)')
    for (const text of ['ana@example.com', '+14045550100', '1 Main St', 'Fri, Nov 20', '9:00 AM', '3 hr 30 min', '$142.50', 'Wipe counters (Kitchen)']) {
      expect(sent.htmlContent).toContain(text)
    }
    expect(writes.some((w) => w.op === 'update' && w.values.admin_notified_at)).toBe(true)
  })

  it('updates the open search on a repeat, without another email', async () => {
    const { admin, writes } = fakeAdmin({ open: { id: 's1', search_count: 2 } })

    expect(await recordUnmetSearch(admin, { ...input, date: '2026-11-21' })).toBe(true)

    expect(writes.some((w) => w.op === 'insert')).toBe(false)
    expect(writes[0].values).toMatchObject({ scheduled_date: '2026-11-21', search_count: 3 })
    expect(email).not.toHaveBeenCalled()
  })

  it('leaves the email to whichever search saved first', async () => {
    const { admin } = fakeAdmin({ insertError: { code: '23505', message: 'duplicate' } })
    expect(await recordUnmetSearch(admin, input)).toBe(true)
    expect(email).not.toHaveBeenCalled()
  })

  it('falls back to Eastern for an unknown zone', async () => {
    const { admin, writes } = fakeAdmin({})
    await recordUnmetSearch(admin, { ...input, timeZone: 'Not/AZone' })
    expect(writes.find((w) => w.op === 'insert')!.values.time_zone).toBe('America/New_York')
  })

  it('escapes what the customer typed', () => {
    const html = unmetSearchAdminEmailHtml(null, { ...input, tasks: [{ name: '<script>' }] })
    expect(html).not.toContain('<script>')
  })
})


describe('notifyCustomersOfNewCleaner', () => {
  const now = new Date('2026-11-18T15:00:00Z')
  const pro = { latitude: 33.76, longitude: -84.4, travel_radius_miles: 10, bio: 'Detail-oriented and pet friendly.' }
  const customer = { email: 'ana@example.com', first_name: 'Ana', email_notifications_enabled: true }
  const match = {
    id: 'p1',
    name: 'Nia Thomas',
    photoUrl: 'https://cdn.example.com/nia.jpg',
    rating: 0,
    reviewCount: 0,
    isVerified: true,
    isTopTidyPro: false,
    distanceMiles: 1.2,
  }
  const search = {
    id: 's1',
    customer_user_id: 'c1',
    draft_id: 'd1',
    latitude: 33.75,
    longitude: -84.39,
    scheduled_date: '2026-11-20',
    scheduled_time: '09:00',
    time_zone: zone,
    duration_minutes: 180,
    required_services: ['taskBased'],
  }

  it("sends the customer the new Tidy Pro's profile when they can take the booking", async () => {
    find.mockResolvedValue([match])
    const { admin, writes } = fakeAdmin({ searches: [search], pro, customer })

    expect(await notifyCustomersOfNewCleaner(admin, 'p1', now)).toEqual({ checked: 1, notified: 1, removed: 0 })

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-11-20', time: '09:00', durationMinutes: 180, requiredServices: ['taskBased'], onlyCleanerId: 'p1' }),
      admin
    )
    expect(writes[0].values).toMatchObject({ closed_reason: 'cleaner_available', notified_tidy_pro_id: 'p1' })

    // Text and push link to the profile; the email is sent separately.
    expect(notify).toHaveBeenCalledWith(
      admin,
      'c1',
      expect.objectContaining({
        body: expect.stringContaining('Nia just joined Tydio and can take your booking on Fri, Nov 20 at 9:00 AM'),
        url: expect.stringMatching(/\/book\/schedule\/p1$/),
      }),
      { email: false }
    )
    expect(email).toHaveBeenCalledTimes(1)
    const sent = email.mock.calls[0][0]
    expect(sent.to).toEqual([{ email: 'ana@example.com', name: 'Ana' }])
    expect(sent.subject).toBe('Nia is now available for your Tydio booking')
    for (const text of ['Nia Thomas', 'nia.jpg', 'Detail-oriented', 'New Tidy Pro', 'Verified', '1.2 miles away', '/book/schedule/p1']) {
      expect(sent.htmlContent).toContain(text)
    }
  })

  it("still tells them when their date has passed, if the Tidy Pro covers their area and services", async () => {
    find.mockResolvedValue([match])
    const { admin } = fakeAdmin({ searches: [{ ...search, scheduled_date: '2026-11-10' }], pro, customer })

    await notifyCustomersOfNewCleaner(admin, 'p1', now)

    expect(find).toHaveBeenCalledWith(expect.objectContaining({ date: null, time: null }), admin)
    expect(notify.mock.calls[0][2].body).toContain('can take your booking. Take a look')
  })

  it("leaves the search open when the Tidy Pro can't take it", async () => {
    find.mockResolvedValue([])
    const { admin, writes } = fakeAdmin({ searches: [search], pro, customer })

    expect(await notifyCustomersOfNewCleaner(admin, 'p1', now)).toEqual({ checked: 1, notified: 0, removed: 0 })
    expect(writes).toEqual([])
    expect(notify).not.toHaveBeenCalled()
    expect(email).not.toHaveBeenCalled()
  })

  it('tells a customer once, even with two open searches', async () => {
    find.mockResolvedValue([match])
    const { admin } = fakeAdmin({ searches: [search, { ...search, id: 's2', draft_id: 'd2' }], pro, customer })

    expect((await notifyCustomersOfNewCleaner(admin, 'p1', now)).notified).toBe(1)
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it("doesn't notify when the search was already claimed", async () => {
    find.mockResolvedValue([match])
    const { admin } = fakeAdmin({ searches: [search], pro, customer, claimed: false })

    expect((await notifyCustomersOfNewCleaner(admin, 'p1', now)).notified).toBe(0)
    expect(notify).not.toHaveBeenCalled()
  })

  it('closes searches whose draft is gone without checking them', async () => {
    const { admin, writes } = fakeAdmin({ searches: [{ ...search, draft_id: null }], pro, customer })

    expect(await notifyCustomersOfNewCleaner(admin, 'p1', now)).toEqual({ checked: 1, notified: 0, removed: 1 })
    expect(writes[0].values.closed_reason).toBe('draft_removed')
    expect(find).not.toHaveBeenCalled()
  })

  it('skips the email for customers who turned email off', async () => {
    find.mockResolvedValue([match])
    const { admin } = fakeAdmin({ searches: [search], pro, customer: { ...customer, email_notifications_enabled: false } })

    await notifyCustomersOfNewCleaner(admin, 'p1', now)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(email).not.toHaveBeenCalled()
  })

  it('does nothing for a Tidy Pro without a location', async () => {
    const { admin } = fakeAdmin({ searches: [search], pro: { ...pro, latitude: null } })
    expect(await notifyCustomersOfNewCleaner(admin, 'p1', now)).toEqual({ checked: 0, notified: 0, removed: 0 })
  })

  it('escapes the Tidy Pro bio', () => {
    const html = cleanerAvailableEmailHtml({ customerFirstName: 'Ana', cleaner: match, bio: '<script>', when: '', profileUrl: 'https://x/p1' })
    expect(html).not.toContain('<script>')
  })
})
