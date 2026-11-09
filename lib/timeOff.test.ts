import { describe, expect, it } from 'vitest'
import { isDateInTimeOff, isValidISODate, normalizeTimeOff, overlapsTimeOff, parseTimeOff, timeOffBlocksOn } from './timeOff'

describe('isValidISODate', () => {
  it('accepts real dates only', () => {
    expect(isValidISODate('2026-11-09')).toBe(true)
    expect(isValidISODate('2026-02-30')).toBe(false)
    expect(isValidISODate('11/09/2026')).toBe(false)
    expect(isValidISODate(null)).toBe(false)
  })
})

describe('parseTimeOff', () => {
  it('keeps well-formed ranges and drops the rest', () => {
    expect(
      parseTimeOff([
        { start: '2026-12-01', end: '2026-12-03' },
        { start: '2026-12-05', end: '2026-12-04' },
        { start: 'nope', end: '2026-12-04' },
        null,
        'x',
      ])
    ).toEqual([{ start: '2026-12-01', end: '2026-12-03' }])
  })

  it('treats a missing or non-list value as no time off', () => {
    expect(parseTimeOff(null)).toEqual([])
    expect(parseTimeOff({})).toEqual([])
  })
})

describe('isDateInTimeOff', () => {
  const timeOff = [
    { start: '2026-12-24', end: '2026-12-26' },
    { start: '2027-01-05', end: '2027-01-05' },
  ]

  it('includes both ends of a range', () => {
    expect(isDateInTimeOff(timeOff, '2026-12-24')).toBe(true)
    expect(isDateInTimeOff(timeOff, '2026-12-25')).toBe(true)
    expect(isDateInTimeOff(timeOff, '2026-12-26')).toBe(true)
    expect(isDateInTimeOff(timeOff, '2026-12-27')).toBe(false)
  })

  it('handles a single day', () => {
    expect(isDateInTimeOff(timeOff, '2027-01-05')).toBe(true)
    expect(isDateInTimeOff(timeOff, '2027-01-04')).toBe(false)
  })
})

describe('normalizeTimeOff', () => {
  it('drops ranges that are over and keeps ones still running', () => {
    expect(
      normalizeTimeOff(
        [
          { start: '2026-11-01', end: '2026-11-05' },
          { start: '2026-11-08', end: '2026-11-10' },
        ],
        '2026-11-09'
      )
    ).toEqual([{ start: '2026-11-08', end: '2026-11-10' }])
  })

  it('sorts and joins overlapping or back-to-back ranges', () => {
    expect(
      normalizeTimeOff(
        [
          { start: '2026-12-10', end: '2026-12-12' },
          { start: '2026-12-01', end: '2026-12-03' },
          { start: '2026-12-04', end: '2026-12-04' },
          { start: '2026-12-11', end: '2026-12-15' },
          { start: '2026-12-20', end: '2026-12-20' },
        ],
        '2026-11-09'
      )
    ).toEqual([
      { start: '2026-12-01', end: '2026-12-04' },
      { start: '2026-12-10', end: '2026-12-15' },
      { start: '2026-12-20', end: '2026-12-20' },
    ])
  })

  it('does not change the ranges it was given', () => {
    const input = [
      { start: '2026-12-01', end: '2026-12-03' },
      { start: '2026-12-02', end: '2026-12-05' },
    ]
    normalizeTimeOff(input, '2026-11-09')
    expect(input[0].end).toBe('2026-12-03')
  })
})

describe('time off with hours', () => {
  const afternoon = { start: '2026-12-03', end: '2026-12-03', startTime: '13:00', endTime: '17:00' }
  const overnight = { start: '2026-12-10', end: '2026-12-12', startTime: '18:00', endTime: '10:00' }

  it('parses times and drops ones that are incomplete or backwards', () => {
    expect(
      parseTimeOff([
        afternoon,
        { start: '2026-12-03', end: '2026-12-03', startTime: '13:00' },
        { start: '2026-12-03', end: '2026-12-03', startTime: '17:00', endTime: '13:00' },
        { start: '2026-12-03', end: '2026-12-03', startTime: '25:00', endTime: '26:00' },
      ])
    ).toEqual([afternoon])
  })

  it('only counts a whole day as a day off', () => {
    expect(isDateInTimeOff([afternoon], '2026-12-03')).toBe(false)
    expect(isDateInTimeOff([overnight], '2026-12-10')).toBe(false)
    expect(isDateInTimeOff([overnight], '2026-12-11')).toBe(true)
    expect(isDateInTimeOff([overnight], '2026-12-12')).toBe(false)
  })

  it('blocks from the start time on the first day to the end time on the last', () => {
    expect(timeOffBlocksOn([overnight], '2026-12-10')).toEqual([{ start: 18 * 60, end: 24 * 60 }])
    expect(timeOffBlocksOn([overnight], '2026-12-12')).toEqual([{ start: 0, end: 10 * 60 }])
  })

  it('finds jobs that run into the hours off', () => {
    expect(overlapsTimeOff([afternoon], '2026-12-03', '09:00', 180)).toBe(false)
    expect(overlapsTimeOff([afternoon], '2026-12-03', '11:00', 180)).toBe(true)
    expect(overlapsTimeOff([afternoon], '2026-12-03', '17:00', 60)).toBe(false)
    expect(overlapsTimeOff([{ start: '2026-12-04', end: '2026-12-04' }], '2026-12-03', '23:00', 120)).toBe(true)
  })

  it('keeps part-day ranges separate and removes repeats', () => {
    expect(
      normalizeTimeOff([{ start: '2026-12-03', end: '2026-12-04' }, afternoon, { ...afternoon }], '2026-11-09')
    ).toEqual([{ start: '2026-12-03', end: '2026-12-04' }, afternoon])
  })
})
