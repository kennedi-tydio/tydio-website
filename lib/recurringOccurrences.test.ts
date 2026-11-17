import { describe, expect, it } from 'vitest'
import { isUnbookedOccurrence, unbookedOccurrenceDates } from './recurringOccurrences'

describe('unbookedOccurrenceDates', () => {
  it('lists the next dates on the series rhythm', () => {
    expect(unbookedOccurrenceDates('weekly', '2026-11-29', [], 3)).toEqual(['2026-11-29', '2026-12-06', '2026-12-13'])
    expect(unbookedOccurrenceDates('biweekly', '2026-11-29', [], 2)).toEqual(['2026-11-29', '2026-12-13'])
    expect(unbookedOccurrenceDates('every_4_weeks', '2026-11-29', [], 2)).toEqual(['2026-11-29', '2026-12-27'])
  })

  it('leaves out skipped dates and still fills the list', () => {
    expect(unbookedOccurrenceDates('weekly', '2026-11-29', ['2026-12-06'], 3)).toEqual(['2026-11-29', '2026-12-13', '2026-12-20'])
  })
})

describe('isUnbookedOccurrence', () => {
  it('accepts dates on or after next_date that fall on the rhythm', () => {
    expect(isUnbookedOccurrence('weekly', '2026-11-29', '2026-11-29')).toBe(true)
    expect(isUnbookedOccurrence('weekly', '2026-11-29', '2026-12-13')).toBe(true)
    expect(isUnbookedOccurrence('biweekly', '2026-11-29', '2026-12-13')).toBe(true)
  })

  it('rejects dates already booked or off the rhythm', () => {
    expect(isUnbookedOccurrence('weekly', '2026-11-29', '2026-11-22')).toBe(false)
    expect(isUnbookedOccurrence('weekly', '2026-11-29', '2026-12-01')).toBe(false)
    expect(isUnbookedOccurrence('biweekly', '2026-11-29', '2026-12-06')).toBe(false)
  })
})
