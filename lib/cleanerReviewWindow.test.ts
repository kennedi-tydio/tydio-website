import { describe, expect, it } from 'vitest'
import {
  canLeaveCustomerReview,
  canViewCustomersReview,
  cleanerReviewHoursLeft,
  excludeHiddenReviews,
} from './cleanerReviewWindow'

const COMPLETED_AT = '2026-11-01T12:00:00.000Z'
const hoursAfter = (hours: number) => new Date(new Date(COMPLETED_AT).getTime() + hours * 60 * 60 * 1000)

describe('cleanerReviewHoursLeft', () => {
  it('starts at the full 24 hours', () => {
    expect(cleanerReviewHoursLeft(COMPLETED_AT, hoursAfter(0))).toBe(24)
  })

  it('rounds partial hours up so the final minutes still read as time left', () => {
    expect(cleanerReviewHoursLeft(COMPLETED_AT, hoursAfter(23.9))).toBe(1)
  })

  it('is 0 at exactly 24 hours and after', () => {
    expect(cleanerReviewHoursLeft(COMPLETED_AT, hoursAfter(24))).toBe(0)
    expect(cleanerReviewHoursLeft(COMPLETED_AT, hoursAfter(100))).toBe(0)
  })

  it('treats a booking with no completion timestamp as having the full window', () => {
    expect(cleanerReviewHoursLeft(null)).toBe(24)
  })
})

describe('review visibility', () => {
  it('hides the customer review while the cleaner can still leave theirs', () => {
    expect(canLeaveCustomerReview(COMPLETED_AT, false, hoursAfter(23))).toBe(true)
    expect(canViewCustomersReview(COMPLETED_AT, false, hoursAfter(23))).toBe(false)
  })

  it('reveals the customer review as soon as the cleaner has reviewed', () => {
    expect(canLeaveCustomerReview(COMPLETED_AT, true, hoursAfter(1))).toBe(false)
    expect(canViewCustomersReview(COMPLETED_AT, true, hoursAfter(1))).toBe(true)
  })

  it('closes the window and reveals the customer review after 24 hours', () => {
    expect(canLeaveCustomerReview(COMPLETED_AT, false, hoursAfter(24))).toBe(false)
    expect(canViewCustomersReview(COMPLETED_AT, false, hoursAfter(24))).toBe(true)
  })
})

describe('excludeHiddenReviews', () => {
  it('returns the stored numbers when nothing is hidden', () => {
    expect(excludeHiddenReviews(4.5, 2, [])).toEqual({ rating: 4.5, reviewCount: 2 })
  })

  it('shows no rating when the only review is hidden', () => {
    expect(excludeHiddenReviews(5, 1, [5])).toEqual({ rating: 0, reviewCount: 0 })
  })

  it('backs a hidden review out of the average', () => {
    // Visible reviews of 5 and 4 (avg 4.5), plus a hidden 3 → stored avg 4.
    expect(excludeHiddenReviews(4, 3, [3])).toEqual({ rating: 4.5, reviewCount: 2 })
  })
})
