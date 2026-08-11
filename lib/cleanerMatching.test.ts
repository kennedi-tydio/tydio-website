import { describe, expect, it } from 'vitest'
import { TOP_TIDY_PRO_MIN_BOOKINGS, TOP_TIDY_PRO_MIN_RATING, computeIsTopTidyPro } from './cleanerMatching'

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
