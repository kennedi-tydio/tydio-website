import { describe, expect, it } from 'vitest'
import { bookingStartInstant } from './bookingTime'
import { isJobCompleted, showCompletedJob } from './completedJobVisibility'

const HOUR = 60 * 60 * 1000
const job = {
  status: 'completed',
  progress_status: 'done',
  scheduled_date: '2026-11-16',
  scheduled_time: '10:00',
  estimated_duration_minutes: 120,
  time_zone: 'America/New_York',
  cleaner_marked_complete_at: null,
}
const endMs = bookingStartInstant('2026-11-16', '10:00', 'America/New_York').getTime() + 2 * HOUR
const none = { customerReviewed: false, tidyProReviewed: false }

describe('isJobCompleted', () => {
  it('counts a completed status or a done progress status', () => {
    expect(isJobCompleted({ status: 'completed', progress_status: null })).toBe(true)
    expect(isJobCompleted({ status: 'accepted', progress_status: 'done' })).toBe(true)
    expect(isJobCompleted({ status: 'accepted', progress_status: 'cleaning' })).toBe(false)
  })
})

describe('showCompletedJob', () => {
  it('stays listed while a review is missing, within 24 hours of the end', () => {
    expect(showCompletedJob(job, none, endMs + 1 * HOUR)).toBe(true)
    expect(showCompletedJob(job, { customerReviewed: true, tidyProReviewed: false }, endMs + 23 * HOUR)).toBe(true)
  })

  it('drops off once both have reviewed', () => {
    expect(showCompletedJob(job, { customerReviewed: true, tidyProReviewed: true }, endMs + 1 * HOUR)).toBe(false)
  })

  it('drops off 24 hours after the end time with no reviews', () => {
    expect(showCompletedJob(job, none, endMs + 24 * HOUR)).toBe(false)
  })

  it('uses the completion time for an anytime booking', () => {
    const anytime = { ...job, scheduled_time: null, cleaner_marked_complete_at: new Date(endMs).toISOString() }
    expect(showCompletedJob(anytime, none, endMs + 23 * HOUR)).toBe(true)
    expect(showCompletedJob(anytime, none, endMs + 25 * HOUR)).toBe(false)
  })
})
