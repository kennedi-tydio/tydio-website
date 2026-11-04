import { describe, expect, it } from 'vitest'
import {
  TOP_TIDY_PRO_MIN_BOOKINGS,
  TOP_TIDY_PRO_MIN_RATING,
  MAX_TRAVEL_RADIUS_MILES,
  computeIsTopTidyPro,
  hasAvailabilityBlock,
  hasAnyDayAvailabilityBlock,
  type WeeklyAvailability,
  findAvailableCleaners,
} from './cleanerMatching'

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
    rating: 5,
    review_count: 1,
    is_verified: true,
    total_accepted_bookings: 0,
    profile_photo_url: 'https://example.com/p.jpg',
    bio: 'Hi',
    stripe_onboarding_completed: true,
    travel_radius_miles: 10,
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
            resolve({ data: table === 'tidypro_profiles' ? candidates : candidates.map((c) => ({ id: c.id, first_name: c.id, last_name: '' })) }),
        }
        return chain
      },
    }
  }

  const ids = async (time: string | null, durationMinutes = 60) =>
    (await findAvailableCleaners({ ...atlanta, date: null, time, durationMinutes }, fakeAdmin())).map((c) => c.id).sort()

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
