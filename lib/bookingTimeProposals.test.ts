import { describe, expect, it } from 'vitest'
import { canChangeStartTime, overlapsAnotherBooking, proposedTimeInBookingZone } from './bookingTimeProposals'

describe('canChangeStartTime', () => {
  it('allows pending requests and accepted bookings the cleaner has not set out for', () => {
    expect(canChangeStartTime({ status: 'pending', progress_status: null })).toBe(true)
    expect(canChangeStartTime({ status: 'scheduled', progress_status: null })).toBe(true)
  })

  it('refuses once the cleaner is on the way, or the booking is closed', () => {
    expect(canChangeStartTime({ status: 'scheduled', progress_status: 'on_the_way' })).toBe(false)
    expect(canChangeStartTime({ status: 'declined', progress_status: null })).toBe(false)
    expect(canChangeStartTime({ status: 'cancelled', progress_status: null })).toBe(false)
    expect(canChangeStartTime({ status: 'completed', progress_status: 'done' })).toBe(false)
  })
})

describe('proposedTimeInBookingZone', () => {
  const booking = { scheduled_date: '2026-11-03', scheduled_time: '09:00', time_zone: 'America/New_York' }

  it('keeps the time as is when both sides share a time zone', () => {
    expect(proposedTimeInBookingZone(booking, 'America/New_York', '10:30')).toEqual({ date: '2026-11-03', time: '10:30' })
  })

  it("moves a cleaner's local time into the booking's time zone", () => {
    // The cleaner sees 6:00 AM Pacific; 8:00 AM Pacific is 11:00 AM Eastern.
    expect(proposedTimeInBookingZone(booking, 'America/Los_Angeles', '08:00')).toEqual({ date: '2026-11-03', time: '11:00' })
  })

  it('crosses midnight when the zones put it on another day', () => {
    // 10:00 PM Pacific on Nov 2 (what the cleaner sees for an early booking) is 1:00 AM Eastern on Nov 3.
    const early = { scheduled_date: '2026-11-03', scheduled_time: '01:00', time_zone: 'America/New_York' }
    expect(proposedTimeInBookingZone(early, 'America/Los_Angeles', '23:00')).toEqual({ date: '2026-11-03', time: '02:00' })
  })
})

describe('overlapsAnotherBooking', () => {
  const other = { scheduled_date: '2026-11-03', scheduled_time: '12:00', estimated_duration_minutes: 120 }

  it('spots a slot that runs into another booking', () => {
    expect(overlapsAnotherBooking({ date: '2026-11-03', time: '11:00', durationMinutes: 90 }, [other])).toBe(true)
    expect(overlapsAnotherBooking({ date: '2026-11-03', time: '13:30', durationMinutes: 30 }, [other])).toBe(true)
  })

  it('allows slots that touch but do not overlap', () => {
    expect(overlapsAnotherBooking({ date: '2026-11-03', time: '10:00', durationMinutes: 120 }, [other])).toBe(false)
    expect(overlapsAnotherBooking({ date: '2026-11-03', time: '14:00', durationMinutes: 60 }, [other])).toBe(false)
  })

  it('compares across midnight', () => {
    const late = { scheduled_date: '2026-11-02', scheduled_time: '23:00', estimated_duration_minutes: 120 }
    expect(overlapsAnotherBooking({ date: '2026-11-03', time: '00:30', durationMinutes: 60 }, [late])).toBe(true)
  })
})
