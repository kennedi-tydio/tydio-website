import type { createAdminClient } from '@/lib/supabase/admin'
import { DEFAULT_BOOKING_TIME_ZONE, isLateCancellation, isValidTimeZone, shiftDateISO, todayInZone } from '@/lib/bookingTime'
import { isRecurrenceFrequency, nextVisitDate, recurrenceIntervalDays, type RecurrenceFrequency } from '@/lib/recurrence'

type Admin = ReturnType<typeof createAdminClient>

// The upcoming dates of a recurring booking, for canceling one of them. Visits are booked a
// week ahead, so the first few are real bookings and the rest are dates the series will book
// later. Canceling a booked one cancels that booking; canceling a later one skips its date
// (recurring_bookings.skipped_dates), which bookDueRecurringVisits then passes over.

export const OCCURRENCES_SHOWN = 8

export type SeriesOccurrence = {
  date: string
  time: string
  // Set once the visit is booked.
  bookingId: string | null
  // Booked and less than 2 hours away: a customer canceling it gets 50% back.
  late: boolean
}

type SeriesForOccurrences = {
  id: string
  frequency: string
  next_date: string
  scheduled_time: string
  time_zone: string | null
  skipped_dates: string[] | null
}

// Visits not booked yet, from next_date on, minus skipped ones. Pure, for testing.
export function unbookedOccurrenceDates(
  frequency: RecurrenceFrequency,
  nextDate: string,
  skipped: readonly string[],
  count: number
): string[] {
  const dates: string[] = []
  let date = nextDate
  // Bounded, so a long run of skipped dates can't loop forever.
  for (let i = 0; i < count + skipped.length + 1 && dates.length < count; i++) {
    if (!skipped.includes(date)) dates.push(date)
    date = nextVisitDate(date, frequency)
  }
  return dates
}

// Whether `date` is one of the series' dates still to be booked (on or after next_date, on
// its rhythm). Pure, for testing.
export function isUnbookedOccurrence(frequency: RecurrenceFrequency, nextDate: string, date: string): boolean {
  if (date < nextDate) return false
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${nextDate}T00:00:00Z`)) / 86_400_000)
  return days % recurrenceIntervalDays(frequency) === 0
}

// `tidyProId` limits booked visits to that Tidy Pro's (for their own list).
export async function listSeriesOccurrences(
  admin: Admin,
  series: SeriesForOccurrences,
  { tidyProId, now = new Date() }: { tidyProId?: string; now?: Date } = {}
): Promise<SeriesOccurrence[]> {
  if (!isRecurrenceFrequency(series.frequency)) return []
  const timeZone = series.time_zone && isValidTimeZone(series.time_zone) ? series.time_zone : DEFAULT_BOOKING_TIME_ZONE

  let query = admin
    .from('bookings')
    .select('id, scheduled_date, scheduled_time, status, progress_status')
    .eq('recurring_booking_id', series.id)
    .in('status', ['pending', 'scheduled'])
    .is('progress_status', null)
    .gte('scheduled_date', shiftDateISO(todayInZone(timeZone, now), -1))
    .order('scheduled_date', { ascending: true })
  if (tidyProId) query = query.eq('tidy_pro_id', tidyProId)
  const { data: visits } = await query

  const booked: SeriesOccurrence[] = (visits ?? [])
    .filter((v) => v.scheduled_date && v.scheduled_time)
    .map((v) => ({
      date: v.scheduled_date!,
      time: v.scheduled_time!.slice(0, 5),
      bookingId: v.id,
      late: v.status === 'scheduled' && isLateCancellation(v.scheduled_date, v.scheduled_time, now, timeZone),
    }))

  const later = unbookedOccurrenceDates(series.frequency, series.next_date, series.skipped_dates ?? [], OCCURRENCES_SHOWN).map((date) => ({
    date,
    time: series.scheduled_time.slice(0, 5),
    bookingId: null,
    late: false,
  }))

  return [...booked, ...later].slice(0, OCCURRENCES_SHOWN)
}

// Skips dates the series hasn't booked yet. Conditional on next_date not having moved, so
// it can't race the recurring job booking one of them.
export async function skipSeriesDates(admin: Admin, seriesId: string, dates: string[]): Promise<{ success: true } | { error: string }> {
  const { data: series } = await admin
    .from('recurring_bookings')
    .select('id, frequency, next_date, skipped_dates, status')
    .eq('id', seriesId)
    .maybeSingle()
  if (!series || series.status !== 'active') return { error: 'This recurring booking isn’t active anymore.' }
  const frequency = series.frequency
  if (!isRecurrenceFrequency(frequency) || dates.some((date) => !isUnbookedOccurrence(frequency, series.next_date, date))) {
    return { error: 'That visit was just booked. Refresh the page and cancel it from the list again.' }
  }

  const skipped = series.skipped_dates ?? []
  const added = dates.filter((date) => !skipped.includes(date))
  if (added.length === 0) return { success: true }

  const { data: updated, error } = await admin
    .from('recurring_bookings')
    .update({ skipped_dates: [...skipped, ...added].sort(), updated_at: new Date().toISOString() })
    .eq('id', seriesId)
    .eq('next_date', series.next_date)
    .eq('status', 'active')
    .select('id')
  if (error) return { error: error.message }
  if (!updated?.length) return { error: 'That visit was just booked. Refresh the page and cancel it from the list again.' }
  return { success: true }
}
