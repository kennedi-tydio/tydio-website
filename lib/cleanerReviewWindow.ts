// A Tidy Pro can't see what a customer said about them until they've reviewed
// that customer, or until their 24 hours to do so have run out — so their
// review of the customer can't be swayed by (or retaliate against) the
// customer's review of them. The clock starts when the job is marked complete.

export const CLEANER_REVIEW_WINDOW_HOURS = 24
const CLEANER_REVIEW_WINDOW_MS = CLEANER_REVIEW_WINDOW_HOURS * 60 * 60 * 1000

// Whole hours left to review, rounded up so the last few minutes read as
// "1 hour" rather than "0". Returns 0 once the window has closed. A booking
// with no completion timestamp has only just been marked done (see
// completeBookingPayout), so its clock hasn't started yet.
export function cleanerReviewHoursLeft(completedAt: string | null, now: Date = new Date()): number {
  if (!completedAt) return CLEANER_REVIEW_WINDOW_HOURS
  const msLeft = new Date(completedAt).getTime() + CLEANER_REVIEW_WINDOW_MS - now.getTime()
  return msLeft > 0 ? Math.ceil(msLeft / (60 * 60 * 1000)) : 0
}

export function canLeaveCustomerReview(
  completedAt: string | null,
  hasReviewedCustomer: boolean,
  now: Date = new Date()
): boolean {
  return !hasReviewedCustomer && cleanerReviewHoursLeft(completedAt, now) > 0
}

// The inverse of canLeaveCustomerReview: once there's nothing left for the
// Tidy Pro to do on this booking, the customer's review is theirs to read.
export function canViewCustomersReview(
  completedAt: string | null,
  hasReviewedCustomer: boolean,
  now: Date = new Date()
): boolean {
  return !canLeaveCustomerReview(completedAt, hasReviewedCustomer, now)
}

// `rating` and `reviewCount` on tidypro_profiles include every review the
// moment it's submitted, which would give away a still-hidden review's stars
// (a first review turns "No Rating Yet" into its exact score). This backs the
// hidden ones out for anything shown to the Tidy Pro themself.
export function excludeHiddenReviews(
  rating: number,
  reviewCount: number,
  hiddenRatings: number[]
): { rating: number; reviewCount: number } {
  if (hiddenRatings.length === 0) return { rating, reviewCount }
  const visibleCount = reviewCount - hiddenRatings.length
  if (visibleCount <= 0) return { rating: 0, reviewCount: 0 }
  const hiddenTotal = hiddenRatings.reduce((sum, r) => sum + r, 0)
  return { rating: (rating * reviewCount - hiddenTotal) / visibleCount, reviewCount: visibleCount }
}
