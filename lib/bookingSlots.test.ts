import { describe, expect, it } from 'vitest'
import {
  MAX_DATE_RANGE_DAYS,
  addDaysISO,
  datesInRange,
  hasStartInWindowOnSomeWeekday,
  normalizeScheduleRange,
  openStartTimes,
  startTimesInBlocks,
} from './bookingSlots'

const nineToFive = [{ start: '09:00', end: '17:00' }]

describe('startTimesInBlocks', () => {
  it('steps every 30 minutes while the whole job still fits', () => {
    expect(startTimesInBlocks({ blocks: [{ start: '09:00', end: '12:00' }], durationMinutes: 120 })).toEqual(['09:00', '09:30', '10:00'])
  })

  it('only offers starts inside the window, both ends included', () => {
    expect(startTimesInBlocks({ blocks: nineToFive, durationMinutes: 60, window: { start: '10:00', end: '11:00' } })).toEqual([
      '10:00',
      '10:30',
      '11:00',
    ])
  })

  it('steps from the window start even when the block starts off the half hour', () => {
    expect(startTimesInBlocks({ blocks: [{ start: '09:15', end: '13:00' }], durationMinutes: 60, window: { start: '10:00', end: '10:00' } })).toEqual(['10:00'])
  })

  it('skips starts that would run into something busy', () => {
    const busy = [{ start: 10 * 60, end: 12 * 60 }]
    expect(startTimesInBlocks({ blocks: [{ start: '09:00', end: '13:00' }], durationMinutes: 60, busy })).toEqual(['09:00', '12:00'])
  })

  it('has nothing when the job cannot start in the window and still fit', () => {
    expect(startTimesInBlocks({ blocks: nineToFive, durationMinutes: 180, window: { start: '15:00', end: '16:00' } })).toEqual([])
  })
})

describe('openStartTimes', () => {
  // 2026-11-16 is a Monday.
  const availability = { mon: nineToFive }

  it('uses the weekday hours of the date', () => {
    expect(openStartTimes({ availability, timeOff: [], dateISO: '2026-11-17', durationMinutes: 60 })).toEqual([])
    expect(openStartTimes({ availability, timeOff: [], dateISO: '2026-11-16', durationMinutes: 60 })).toHaveLength(15)
  })

  it('leaves out part-day time off and existing bookings', () => {
    const times = openStartTimes({
      availability,
      timeOff: [{ start: '2026-11-16', end: '2026-11-16', startTime: '09:00', endTime: '13:00' }],
      dateISO: '2026-11-16',
      durationMinutes: 60,
      bookings: [{ start: 14 * 60, end: 16 * 60 }],
    })
    expect(times).toEqual(['13:00', '16:00'])
  })
})

describe('hasStartInWindowOnSomeWeekday', () => {
  it('is true when any weekday has a start in the window', () => {
    expect(hasStartInWindowOnSomeWeekday({ fri: [{ start: '17:00', end: '21:00' }] }, 60, { start: '16:00', end: '18:00' })).toBe(true)
    expect(hasStartInWindowOnSomeWeekday({ fri: [{ start: '17:00', end: '21:00' }] }, 60, { start: '08:00', end: '12:00' })).toBe(false)
  })
})

describe('dates', () => {
  it('lists every date in a range, across months', () => {
    expect(datesInRange('2026-11-29', '2026-12-02')).toEqual(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02'])
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('normalizeScheduleRange', () => {
  it('keeps a valid range', () => {
    const r = { date: '2026-11-20', endDate: '2026-11-25', time: '09:00', endTime: '13:00' }
    expect(normalizeScheduleRange(r)).toEqual(r)
  })

  it('drops range ends that are missing a start, or not after it', () => {
    expect(normalizeScheduleRange({ date: null, endDate: '2026-11-25', time: null, endTime: '13:00' })).toEqual({
      date: null,
      endDate: null,
      time: null,
      endTime: null,
    })
    expect(normalizeScheduleRange({ date: '2026-11-20', endDate: '2026-11-20', time: '13:00', endTime: '09:00' })).toEqual({
      date: '2026-11-20',
      endDate: null,
      time: '13:00',
      endTime: null,
    })
  })

  it(`cuts a date range to ${MAX_DATE_RANGE_DAYS} days`, () => {
    const r = normalizeScheduleRange({ date: '2026-11-01', endDate: '2027-03-01', time: null, endTime: null })
    expect(r.endDate).toBe('2026-12-01')
    expect(datesInRange(r.date!, r.endDate!)).toHaveLength(MAX_DATE_RANGE_DAYS)
  })

  it('drops values that are not dates or times', () => {
    expect(normalizeScheduleRange({ date: 'tomorrow', endDate: null, time: '25:00', endTime: null })).toEqual({
      date: null,
      endDate: null,
      time: null,
      endTime: null,
    })
  })
})
