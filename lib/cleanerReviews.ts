import type { createAdminClient } from '@/lib/supabase/admin'
import { CLEANER_REVIEW_WINDOW_HOURS } from '@/lib/cleanerReviewWindow'

type Admin = ReturnType<typeof createAdminClient>

export type CleanerReview = {
  id: string
  rating: number
  text: string | null
  reviewerFirstName: string
  createdAt: string
}

const MAX_REVIEWS_SHOWN = 100

// Customer reviews a Tidy Pro isn't allowed to see yet (see cleanerReviewWindow).
// Only bookings still inside the review window can be hidden, so older ones don't
// need to be looked at.
export async function getHiddenReviews(
  admin: Admin,
  tidyProId: string
): Promise<{ booking_id: string; rating: number }[]> {
  const windowStart = new Date(Date.now() - CLEANER_REVIEW_WINDOW_HOURS * 60 * 60 * 1000).toISOString()
  const { data: recentBookings } = await admin
    .from('bookings')
    .select('id')
    .eq('tidy_pro_id', tidyProId)
    .gt('cleaner_marked_complete_at', windowStart)

  const bookingIds = (recentBookings ?? []).map((b) => b.id)
  if (bookingIds.length === 0) return []

  const [{ data: customerReviews }, { data: ownReviews }] = await Promise.all([
    admin.from('reviews').select('booking_id, rating').in('booking_id', bookingIds),
    admin.from('cleaner_reviews_of_customers').select('booking_id').in('booking_id', bookingIds),
  ])

  const reviewedBookingIds = new Set((ownReviews ?? []).map((r) => r.booking_id))
  return (customerReviews ?? []).filter((r) => !reviewedBookingIds.has(r.booking_id))
}

// Newest first. Reviewers appear by first name only, since these are shown to
// other customers. Pass `forTidyProThemself` when the Tidy Pro is the one viewing,
// so a review still hidden from them doesn't show up here either.
export async function listCleanerReviews(
  admin: Admin,
  tidyProId: string,
  { forTidyProThemself }: { forTidyProThemself: boolean }
): Promise<CleanerReview[]> {
  const { data: reviews, error } = await admin
    .from('reviews')
    .select('id, booking_id, user_id, rating, review_text, created_at')
    .eq('tidypro_id', tidyProId)
    .order('created_at', { ascending: false })
    .limit(MAX_REVIEWS_SHOWN)

  if (error) throw new Error(`Failed to load reviews: ${error.message}`)

  const hiddenBookingIds = new Set(forTidyProThemself ? (await getHiddenReviews(admin, tidyProId)).map((r) => r.booking_id) : [])
  const visible = (reviews ?? []).filter((r) => !hiddenBookingIds.has(r.booking_id))

  const reviewerIds = [...new Set(visible.map((r) => r.user_id))]
  const { data: reviewers } = reviewerIds.length
    ? await admin.from('profiles').select('id, first_name').in('id', reviewerIds)
    : { data: [] }
  const firstNameById = new Map((reviewers ?? []).map((p) => [p.id, p.first_name]))

  return visible.map((r) => ({
    id: r.id,
    rating: r.rating,
    text: r.review_text,
    reviewerFirstName: firstNameById.get(r.user_id) || 'Customer',
    createdAt: r.created_at,
  }))
}
