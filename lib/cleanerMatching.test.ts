import { describe, expect, it } from 'vitest'
import type { TidyProService } from './tidyProServices'
import {
  TOP_TIDY_PRO_MIN_BOOKINGS,
  TOP_TIDY_PRO_MIN_RATING,
  MAX_TRAVEL_RADIUS_MILES,
  computeIsTopTidyPro,
  hasAvailabilityBlock,
  hasAnyDayAvailabilityBlock,
  type WeeklyAvailability,
  findAvailableCleaners,
  isAvailableForBooking,
} from './cleanerMatching'

describe('isAvailableForBooking', () => {
  const bookable = {
    active_for_booking: true,
    cleaner_status: 'approved',
    is_away: false,
    profile_photo_url: 'https://example.com/p.jpg',
    bio: 'Hi',
    availability: { mon: [{ start: '09:00', end: '12:00' }] },
    stripe_onboarding_completed: true,
    travel_radius_miles: 10,
    services_provided: ['taskBased'],
    latitude: 33.75,
    longitude: -84.39,
    has_push: true,
  }

  it('is true for an approved, active, onboarded Tidy Pro who is not away', () => {
    expect(isAvailableForBooking(bookable)).toBe(true)
  })

  it.each([
    ['paused or suspended', { active_for_booking: false }],
    ['not approved yet', { cleaner_status: 'applied' }],
    ['away', { is_away: true }],
    ['missing an onboarding step', { stripe_onboarding_completed: false }],
  ])('is false when %s', (_label, overrides) => {
    expect(isAvailableForBooking({ ...bookable, ...overrides })).toBe(false)
  })
})

describe('computeIsTopTidyPro', () => {
  it('is true at/above the rating threshold with more than the minimum bookings', () => {
    expect(computeIsTopTidyPro(4.8, 11)).toBe(true)
    expect(computeIsTopTidyPro(5.0, 50)).toBe(true)
  })

  it('is false just under the rating threshold', () => {
    expect(computeIsTopTidyPro(4.79, 20)).toBe(false)
  })

  it('is false at exactly 10 bookings — requires strictly more than 10', () => {
    expect(computeIsTopTidyPro(4.9, 10)).toBe(false)
  })

  it('is true at 11 bookings', () => {
    expect(computeIsTopTidyPro(4.9, 11)).toBe(true)
  })

  it('matches the documented constants', () => {
    expect(TOP_TIDY_PRO_MIN_RATING).toBe(4.8)
    expect(TOP_TIDY_PRO_MIN_BOOKINGS).toBe(10)
  })
})

describe('MAX_TRAVEL_RADIUS_MILES', () => {
  it('is 20 miles', () => {
    expect(MAX_TRAVEL_RADIUS_MILES).toBe(20)
  })
})

describe('hasAnyDayAvailabilityBlock', () => {
  const availability: WeeklyAvailability = {
    mon: [{ start: '09:00', end: '17:00' }],
    wed: [{ start: '12:00', end: '15:00' }],
  }

  it('is true when some weekday covers the requested window', () => {
    expect(hasAnyDayAvailabilityBlock(availability, { start: '13:00', end: '14:00' })).toBe(true)
  })

  it('is false when no weekday covers the requested window', () => {
    expect(hasAnyDayAvailabilityBlock(availability, { start: '18:00', end: '19:00' })).toBe(false)
  })

  it('is false against an empty weekly schedule', () => {
    expect(hasAnyDayAvailabilityBlock({}, { start: '13:00', end: '14:00' })).toBe(false)
  })

  it('agrees with hasAvailabilityBlock for the matching single day', () => {
    expect(hasAvailabilityBlock(availability, 'wed', { start: '13:00', end: '14:00' })).toBe(true)
    expect(hasAvailabilityBlock(availability, 'tue', { start: '13:00', end: '14:00' })).toBe(false)
  })
})

describe('findAvailableCleaners with "Any day"', () => {
  const atlanta = { latitude: 33.75, longitude: -84.39 }
  const cleaner = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    active_for_booking: true,
    cleaner_status: 'approved',
    is_away: false,
    rating: 5,
    review_count: 1,
    is_verified: true,
    total_accepted_bookings: 0,
    profile_photo_url: 'https://example.com/p.jpg',
    bio: 'Hi',
    stripe_onboarding_completed: true,
    travel_radius_miles: 10,
    services_provided: ['taskBased'],
    ...atlanta,
    availability: { mon: [{ start: '09:00', end: '12:00' }] },
    ...overrides,
  })

  const candidates = [
    cleaner('morning'),
    cleaner('evening', { availability: { fri: [{ start: '17:00', end: '21:00' }] } }),
    cleaner('far-away', { latitude: 34.5 }),
    cleaner('no-bio', { bio: null }),
    cleaner('no-radius', { travel_radius_miles: null }),
    // ~8 miles north of the customer
    cleaner('eight-miles-wide', { latitude: 33.866 }),
    cleaner('eight-miles-narrow', { latitude: 33.866, travel_radius_miles: 5 }),
    // Same hours and place as "morning", but only pet work.
    cleaner('pets-only', { services_provided: ['petEnclosures', 'litterBoxes'] }),
  ]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function fakeAdmin(): any {
    return {
      from: (table: string) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          not: () => chain,
          in: () => chain,
          then: (resolve: (value: { data: unknown[] }) => void) =>
            resolve({ data: table === 'tidypro_profiles' ? candidates : table === 'push_subscriptions' ? candidates.map((c) => ({ profile_id: c.id })) : candidates.map((c) => ({ id: c.id, first_name: c.id, last_name: '' })) }),
        }
        return chain
      },
    }
  }

  const ids = async (time: string | null, durationMinutes = 60, requiredServices: TidyProService[] = ['taskBased']) =>
    (await findAvailableCleaners({ ...atlanta, date: null, time, durationMinutes, requiredServices }, fakeAdmin()))
      .map((c) => c.id)
      .sort()

  it('only shows cleaners who provide every service the booking needs', async () => {
    expect(await ids(null, 60, ['litterBoxes'])).toEqual(['pets-only'])
    expect(await ids(null, 60, ['taskBased', 'litterBoxes'])).toEqual([])
    expect(await ids(null, 60, ['laundry'])).toEqual([])
  })

  it('with no time, shows every bookable cleaner in range, whatever their hours', async () => {
    expect(await ids(null)).toEqual(['eight-miles-wide', 'evening', 'morning'])
  })

  it('with a time, only shows cleaners free at that time on some day', async () => {
    expect(await ids('10:00')).toEqual(['eight-miles-wide', 'morning'])
    expect(await ids('18:00')).toEqual(['evening'])
  })

  it('shows nobody when no cleaner has that time open on any day', async () => {
    expect(await ids('06:00')).toEqual([])
  })

  it('needs the whole job to fit inside their hours', async () => {
    expect(await ids('11:30', 120)).toEqual([])
  })

  it('only shows cleaners within their own travel distance', async () => {
    const found = await ids(null)
    expect(found).toContain('eight-miles-wide')
    expect(found).not.toContain('eight-miles-narrow')
    expect(found).not.toContain('no-radius')
  })
})
