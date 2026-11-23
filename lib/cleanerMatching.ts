import type { createAdminClient } from '@/lib/supabase/admin'
import { adminStepLabel, missingOnboardingSteps } from '@/lib/cleanerOnboarding'
import { providesServices, type TidyProService } from '@/lib/tidyProServices'
import { withPushStatus } from '@/lib/pushRequirement'
import { blockedIdsFor } from '@/lib/userBlocks'
import { isHiddenFromCustomer } from '@/lib/privateTidyPros'
import { isDateInTimeOff, overlapsTimeOff, parseTimeOff } from '@/lib/timeOff'
import { datesInRange, hasStartInWindowOnSomeWeekday, openStartTimes, type Busy, type StartWindow } from '@/lib/bookingSlots'

type AdminClient = ReturnType<typeof createAdminClient>

export const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number]

export type WeeklyAvailability = Partial<Record<WeekdayKey, { start: string; end: string }[]>>

// The furthest a Tidy Pro can choose to travel. Each one sets their own radius up to this.
export const MAX_TRAVEL_RADIUS_MILES = 20

export interface LatLng {
  latitude: number
  longitude: number
}

export interface CleanerMatch {
  id: string
  name: string
  photoUrl: string | null
  rating: number
  reviewCount: number
  isVerified: boolean
  isTopTidyPro: boolean
  distanceMiles: number
}

// A Tidy Pro earns Top Tidy Pro status by maintaining a >=4.8 rating across
// more than 10 completed bookings.
export const TOP_TIDY_PRO_MIN_RATING = 4.8
export const TOP_TIDY_PRO_MIN_BOOKINGS = 10

export function computeIsTopTidyPro(rating: number, totalAcceptedBookings: number): boolean {
  return rating >= TOP_TIDY_PRO_MIN_RATING && totalAcceptedBookings > TOP_TIDY_PRO_MIN_BOOKINGS
}

export function haversineDistanceMiles(a: LatLng, b: LatLng): number {
  const R = 3958.8 // Earth radius in miles
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLng = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2

  return R * 2 * Math.asin(Math.sqrt(h))
}

export function minutesSinceMidnight(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24
  const m = totalMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// "9am", "5:30pm": short enough to list a whole week of hours in one place.
export function formatCompactTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, '0')}${period}`
}

export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

// If `timeRange` is omitted, this is a day-level check (any availability at
// all that weekday). If provided, the cleaner needs a single block that
// fully covers the requested window.
export function hasAvailabilityBlock(
  availability: WeeklyAvailability,
  weekday: WeekdayKey,
  timeRange?: { start: string; end: string }
): boolean {
  const blocks = availability[weekday]
  if (!blocks || blocks.length === 0) return false
  if (!timeRange) return true

  const reqStart = minutesSinceMidnight(timeRange.start)
  const reqEnd = minutesSinceMidnight(timeRange.end)

  return blocks.some((block) => {
    const blockStart = minutesSinceMidnight(block.start)
    const blockEnd = minutesSinceMidnight(block.end)
    return blockStart <= reqStart && reqEnd <= blockEnd
  })
}

// "Any day" variant — true if the cleaner has a block covering the requested
// time on at least one day of the week, regardless of which day that ends up
// being. Used when the customer picked a specific time but left the date as
// "Any day"; actual booking conflicts are only checked once a real date is
// chosen.
export function hasAnyDayAvailabilityBlock(
  availability: WeeklyAvailability,
  timeRange: { start: string; end: string }
): boolean {
  return WEEKDAY_KEYS.some((weekday) => hasAvailabilityBlock(availability, weekday, timeRange))
}

// Whether the cleaner already has a booking or open request overlapping this time,
// by the same rule search uses. Checked again right before the customer is charged,
// since someone else may have taken the slot after it was picked.
export async function hasBookingConflict(
  admin: AdminClient,
  cleanerId: string,
  date: string,
  time: string,
  durationMinutes: number,
  // The booking being moved, which can't clash with itself.
  excludeBookingId?: string
): Promise<boolean> {
  let query = admin
    .from('bookings')
    .select('scheduled_time, estimated_duration_minutes')
    .eq('tidy_pro_id', cleanerId)
    .eq('scheduled_date', date)
    .not('status', 'in', '("cancelled","declined")')
  if (excludeBookingId) query = query.neq('id', excludeBookingId)
  const { data: existing } = await query

  const reqStart = minutesSinceMidnight(time)
  const reqEnd = reqStart + durationMinutes
  return (existing ?? []).some((b) => {
    if (!b.scheduled_time) return false
    const start = minutesSinceMidnight(b.scheduled_time)
    return rangesOverlap(reqStart, reqEnd, start, start + (b.estimated_duration_minutes ?? 60))
  })
}

// Whether customers can currently find and book this Tidy Pro in search: the same
// rules findAvailableCleaners applies before narrowing by date, time and distance.
// Suspending or pausing someone turns off active_for_booking, so that's covered too.
export function isAvailableForBooking(cleaner: {
  active_for_booking: boolean
  cleaner_status: string | null
  is_away: boolean
  profile_photo_url: string | null
  bio: string | null
  availability: unknown
  stripe_onboarding_completed: boolean
  travel_radius_miles: number | null
  services_provided: string[] | null
  latitude: number | null
  longitude: number | null
  has_push: boolean
}): boolean {
  return bookingBlockers(cleaner).length === 0
}

type BookabilityFields = Parameters<typeof isAvailableForBooking>[0]

// Why customers can't book this Tidy Pro right now, for admins. Empty when
// they're bookable. The same checks as isAvailableForBooking, one per reason.
export function bookingBlockers(cleaner: BookabilityFields): string[] {
  const reasons: string[] = []
  if (cleaner.cleaner_status !== 'approved') reasons.push(`Status is ${cleaner.cleaner_status ?? 'applied'}, not approved`)
  if (!cleaner.active_for_booking) reasons.push('Booking turned off (suspended, paused, or not yet activated)')
  if (cleaner.is_away) reasons.push('Away mode is on')
  for (const step of missingOnboardingSteps(cleaner)) reasons.push(adminStepLabel(step.label))
  return reasons
}

export async function findAvailableCleaners(
  params: {
    latitude: number
    longitude: number
    date: string | null // "YYYY-MM-DD", or null for "Any day"
    time: string | null // "HH:MM" or null for "Anytime"
    // A date range, from `date` through this date. Needs `date`.
    endDate?: string | null
    // A time window: the job starts anywhere from `time` through this time. Needs `time`.
    endTime?: string | null
    durationMinutes: number
    // What the booking's tasks need (requiredServicesForTasks). Only Tidy Pros
    // who provide every one of them are matched.
    requiredServices: TidyProService[]
    // Check just this Tidy Pro, by the same rules.
    onlyCleanerId?: string
    // The customer searching. Tidy Pros they've blocked, or who've blocked them
    // (lib/userBlocks), are left out, as are private Tidy Pros they can't see
    // (lib/privateTidyPros). Without one, private Tidy Pros are left out.
    customerId?: string | null
  },
  admin: AdminClient
): Promise<CleanerMatch[]> {
  let query = admin
    .from('tidypro_profiles')
    .select('id, active_for_booking, cleaner_status, is_away, rating, review_count, is_verified, total_accepted_bookings, profile_photo_url, bio, stripe_onboarding_completed, travel_radius_miles, services_provided, latitude, longitude, availability, time_off')
    .eq('active_for_booking', true)
    .eq('cleaner_status', 'approved')
    .eq('is_away', false)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
  if (params.onlyCleanerId) query = query.eq('id', params.onlyCleanerId)
  const { data: candidates } = await query

  if (!candidates || candidates.length === 0) return []

  const blocked = params.customerId ? await blockedIdsFor(admin, params.customerId) : null
  const unblocked = candidates.filter((c) => !blocked?.has(c.id) && !isHiddenFromCustomer(c.id, params.customerId))
  if (unblocked.length === 0) return []

  const nearby = (await withPushStatus(admin, unblocked))
    .filter((c) => isAvailableForBooking(c) && providesServices(c.services_provided, params.requiredServices))
    .map((c) => ({
      ...c,
      distanceMiles: haversineDistanceMiles(
        { latitude: params.latitude, longitude: params.longitude },
        { latitude: c.latitude as number, longitude: c.longitude as number }
      ),
    }))
    .filter((c) => c.distanceMiles <= Math.min(c.travel_radius_miles as number, MAX_TRAVEL_RADIUS_MILES))

  if (nearby.length === 0) return []

  // "Any day" with "Anytime": every bookable cleaner in range. The customer picks whoever
  // they like, then a day from that cleaner's calendar. With a time, it narrows further down.
  let available = nearby
  if ((params.date && params.endDate) || (params.time && params.endTime)) {
    available = await filterByScheduleRange(nearby, params, admin)
  } else if (params.date) {
    const date = params.date
    const weekday = WEEKDAY_KEYS[new Date(`${date}T00:00:00`).getDay()]
    const timeRange = params.time
      ? { start: params.time, end: minutesToTime(minutesSinceMidnight(params.time) + params.durationMinutes) }
      : undefined

    available = nearby.filter((c) => {
      // With a time, only time off during the job counts; without one, only a whole day off.
      const timeOff = parseTimeOff(c.time_off)
      const off = params.time ? overlapsTimeOff(timeOff, date, params.time, params.durationMinutes) : isDateInTimeOff(timeOff, date)
      return (
        !off &&
        hasAvailabilityBlock((c.availability as WeeklyAvailability) ?? {}, weekday, timeRange)
      )
    })

    if (available.length > 0) {
      const { data: existingBookings } = await admin
        .from('bookings')
        .select('tidy_pro_id, scheduled_time, estimated_duration_minutes')
        .in('tidy_pro_id', available.map((c) => c.id))
        .eq('scheduled_date', date)
        .not('status', 'in', '("cancelled","declined")')

      const bookingsByCleaner = new Map<string, { start: number; end: number }[]>()
      for (const b of existingBookings ?? []) {
        if (!b.tidy_pro_id || !b.scheduled_time) continue
        const start = minutesSinceMidnight(b.scheduled_time)
        const end = start + (b.estimated_duration_minutes ?? 60)
        const list = bookingsByCleaner.get(b.tidy_pro_id) ?? []
        list.push({ start, end })
        bookingsByCleaner.set(b.tidy_pro_id, list)
      }

      available = available.filter((c) => {
        const busy = bookingsByCleaner.get(c.id) ?? []
        if (busy.length === 0) return true
        if (!timeRange) return false // "Anytime": any existing booking that day disqualifies

        const reqStart = minutesSinceMidnight(timeRange.start)
        const reqEnd = minutesSinceMidnight(timeRange.end)
        return !busy.some((b) => rangesOverlap(reqStart, reqEnd, b.start, b.end))
      })
    }
  } else if (params.time) {
    // "Any day" but a specific time — the cleaner just needs to work that
    // time of day on some weekday. There's no specific date yet, so booking
    // conflicts aren't checked until the customer actually picks one.
    const timeRange = { start: params.time, end: minutesToTime(minutesSinceMidnight(params.time) + params.durationMinutes) }
    available = nearby.filter((c) => hasAnyDayAvailabilityBlock((c.availability as WeeklyAvailability) ?? {}, timeRange))
  }

  if (available.length === 0) return []

  const { data: profileRows } = await admin
    .from('profiles')
    .select('id, first_name, last_name')
    .in('id', available.map((c) => c.id))

  const nameById = new Map((profileRows ?? []).map((p) => [p.id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()]))

  return available
    .map((c) => ({
      id: c.id,
      name: nameById.get(c.id) || 'Tidy Pro',
      photoUrl: c.profile_photo_url,
      rating: c.rating,
      reviewCount: c.review_count,
      isVerified: c.is_verified,
      isTopTidyPro: computeIsTopTidyPro(c.rating, c.total_accepted_bookings),
      distanceMiles: Math.round(c.distanceMiles * 10) / 10,
    }))
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
}

// A date range or time window: the cleaner needs at least one open start time in it,
// by the same rules as the "Choose a time" calendar the customer picks from next.
async function filterByScheduleRange<C extends { id: string; availability: unknown; time_off: unknown }>(
  cleaners: C[],
  params: { date: string | null; endDate?: string | null; time: string | null; endTime?: string | null; durationMinutes: number },
  admin: AdminClient
): Promise<C[]> {
  const window: StartWindow | null = params.time ? { start: params.time, end: params.endTime ?? params.time } : null

  // "Any day": only their weekly hours can be checked, as with a single time.
  if (!params.date) {
    if (!window) return cleaners
    return cleaners.filter((c) =>
      hasStartInWindowOnSomeWeekday((c.availability as WeeklyAvailability) ?? {}, params.durationMinutes, window)
    )
  }

  const dates = datesInRange(params.date, params.endDate ?? params.date)
  const { data: existingBookings } = await admin
    .from('bookings')
    .select('tidy_pro_id, scheduled_date, scheduled_time, estimated_duration_minutes')
    .in('tidy_pro_id', cleaners.map((c) => c.id))
    .gte('scheduled_date', dates[0])
    .lte('scheduled_date', dates[dates.length - 1])
    .not('status', 'in', '("cancelled","declined")')

  const busy = new Map<string, Busy[]>()
  for (const b of existingBookings ?? []) {
    if (!b.tidy_pro_id || !b.scheduled_date || !b.scheduled_time) continue
    const key = `${b.tidy_pro_id} ${b.scheduled_date}`
    const start = minutesSinceMidnight(b.scheduled_time)
    busy.set(key, [...(busy.get(key) ?? []), { start, end: start + (b.estimated_duration_minutes ?? 60) }])
  }

  return cleaners.filter((c) => {
    const availability = (c.availability as WeeklyAvailability) ?? {}
    const timeOff = parseTimeOff(c.time_off)
    return dates.some(
      (dateISO) =>
        openStartTimes({
          availability,
          timeOff,
          dateISO,
          durationMinutes: params.durationMinutes,
          bookings: busy.get(`${c.id} ${dateISO}`),
          window,
        }).length > 0
    )
  })
}
