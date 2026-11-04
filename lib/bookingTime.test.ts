import { describe, expect, it } from 'vitest'
import { bookingStartInstant, hasAcceptanceWindowClosed, hasBookingStarted, isValidTimeZone, scheduleForViewer, shiftDateISO, todayInZone } from './bookingTime'

describe('bookingStartInstant', () => {
  it('reads times as Eastern, in standard time', () => {
    expect(bookingStartInstant('2026-12-01', '09:00').toISOString()).toBe('2026-12-01T14:00:00.000Z')
  })

  it('reads times as Eastern, in daylight time', () => {
    expect(bookingStartInstant('2026-07-01', '09:00').toISOString()).toBe('2026-07-01T13:00:00.000Z')
  })

  it('accepts a time with seconds', () => {
    expect(bookingStartInstant('2026-12-01', '09:30:00').toISOString()).toBe('2026-12-01T14:30:00.000Z')
  })

  it('uses the right offset on either side of a daylight saving change', () => {
    expect(bookingStartInstant('2026-11-01', '00:30').toISOString()).toBe('2026-11-01T04:30:00.000Z')
    expect(bookingStartInstant('2026-11-01', '12:00').toISOString()).toBe('2026-11-01T17:00:00.000Z')
  })
})

describe('customer time as the source of truth', () => {
  it('starts a booking at the customer’s local time, wherever they are', () => {
    expect(bookingStartInstant('2026-12-01', '09:00', 'America/Los_Angeles').toISOString()).toBe('2026-12-01T17:00:00.000Z')
    expect(hasBookingStarted('2026-12-01', '09:00', new Date('2026-12-01T15:00:00Z'), 'America/Los_Angeles')).toBe(false)
    expect(hasBookingStarted('2026-12-01', '09:00', new Date('2026-12-01T17:00:00Z'), 'America/Los_Angeles')).toBe(true)
  })

  it('falls back to Eastern for a booking with no recorded zone', () => {
    expect(hasBookingStarted('2026-12-01', '09:00', new Date('2026-12-01T14:00:00Z'), null)).toBe(true)
  })
})

describe('scheduleForViewer', () => {
  it('leaves the time alone when both are in the same zone', () => {
    expect(scheduleForViewer('2026-12-01', '09:00', 'America/New_York', 'America/New_York')).toEqual({ date: '2026-12-01', time: '09:00', converted: false })
  })

  it('shows a cleaner elsewhere the same moment in their own time', () => {
    expect(scheduleForViewer('2026-12-01', '09:00', 'America/New_York', 'America/Chicago')).toEqual({ date: '2026-12-01', time: '08:00', converted: true })
  })

  it('moves the date when the conversion crosses midnight', () => {
    expect(scheduleForViewer('2026-12-02', '01:00', 'America/New_York', 'America/Los_Angeles')).toEqual({ date: '2026-12-01', time: '22:00', converted: true })
  })

  it('treats a cleaner with no known zone as being in the customer’s', () => {
    expect(scheduleForViewer('2026-12-01', '09:00', 'America/Chicago', null)).toEqual({ date: '2026-12-01', time: '09:00', converted: false })
  })

  it('leaves missing values alone', () => {
    expect(scheduleForViewer(null, null, 'America/New_York', 'America/Chicago')).toEqual({ date: null, time: null, converted: false })
  })
})

describe('todayInZone', () => {
  it('reads the date in that zone, not UTC', () => {
    expect(todayInZone('America/New_York', new Date('2026-12-02T03:00:00Z'))).toBe('2026-12-01')
  })
})

describe('isValidTimeZone', () => {
  it('accepts real zones only', () => {
    expect(isValidTimeZone('America/New_York')).toBe(true)
    expect(isValidTimeZone('Not/AZone')).toBe(false)
    expect(isValidTimeZone(null)).toBe(false)
  })
})

describe('hasBookingStarted', () => {
  it('is false before the Eastern start time, even if it has passed in UTC', () => {
    expect(hasBookingStarted('2026-12-01', '09:00', new Date('2026-12-01T13:59:00Z'))).toBe(false)
  })

  it('is true from the start time onward', () => {
    expect(hasBookingStarted('2026-12-01', '09:00', new Date('2026-12-01T14:00:00Z'))).toBe(true)
    expect(hasBookingStarted('2026-12-01', '09:00', new Date('2026-12-02T14:00:00Z'))).toBe(true)
  })

  it('is false without a date or time', () => {
    expect(hasBookingStarted(null, '09:00')).toBe(false)
    expect(hasBookingStarted('2026-12-01', null)).toBe(false)
  })
})

describe('hasAcceptanceWindowClosed', () => {
  it('closes exactly an hour before: a 10am booking closes at 9am', () => {
    expect(hasAcceptanceWindowClosed('2026-11-03', '10:00', new Date('2026-11-03T13:59:00Z'))).toBe(false)
    expect(hasAcceptanceWindowClosed('2026-11-03', '10:00', new Date('2026-11-03T14:00:00Z'))).toBe(true)
  })

  it('uses the customer’s zone', () => {
    expect(hasAcceptanceWindowClosed('2026-11-03', '10:00', new Date('2026-11-03T14:00:00Z'), 'America/Los_Angeles')).toBe(false)
    expect(hasAcceptanceWindowClosed('2026-11-03', '10:00', new Date('2026-11-03T17:00:00Z'), 'America/Los_Angeles')).toBe(true)
  })
})

describe('shiftDateISO', () => {
  it('crosses month ends', () => {
    expect(shiftDateISO('2026-11-01', -1)).toBe('2026-10-31')
    expect(shiftDateISO('2026-12-31', 1)).toBe('2027-01-01')
  })
})
