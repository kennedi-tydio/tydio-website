import { bookingStartInstant } from '@/lib/bookingTime'

// How long a finished job stays on the Tidy Pro's "Today's jobs" when reviews are
// still missing. After this, no review is expected and the job drops off.
export const COMPLETED_JOB_VISIBLE_HOURS = 24

type CompletedJobFields = {
  status: string | null
  progress_status: string | null
  scheduled_date: string | null
  scheduled_time: string | null
  estimated_duration_minutes: number | null
  time_zone: string | null
  cleaner_marked_complete_at: string | null
}

export function isJobCompleted(b: Pick<CompletedJobFields, 'status' | 'progress_status'>): boolean {
  return b.status === 'completed' || b.progress_status === 'done'
}

// When the booking was due to end: its start plus its length. An "anytime" booking has
// no start time, so the moment it was marked complete stands in for its end.
export function bookingEndMs(b: CompletedJobFields, nowMs: number): number {
  if (b.scheduled_date && b.scheduled_time) {
    return bookingStartInstant(b.scheduled_date, b.scheduled_time, b.time_zone ?? undefined).getTime() + (b.estimated_duration_minutes ?? 60) * 60 * 1000
  }
  return b.cleaner_marked_complete_at ? new Date(b.cleaner_marked_complete_at).getTime() : nowMs
}

// A finished job stays listed (not as the active job) until both the customer and the
// Tidy Pro have left their reviews, or until 24 hours after its end time.
export function showCompletedJob(
  b: CompletedJobFields,
  reviews: { customerReviewed: boolean; tidyProReviewed: boolean },
  nowMs: number
): boolean {
  if (reviews.customerReviewed && reviews.tidyProReviewed) return false
  return nowMs < bookingEndMs(b, nowMs) + COMPLETED_JOB_VISIBLE_HOURS * 60 * 60 * 1000
}
