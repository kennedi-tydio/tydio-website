import type { createAdminClient } from '@/lib/supabase/admin'
import { missingOnboardingSteps } from '@/lib/cleanerOnboarding'
import { isDateInTimeOff, overlapsTimeOff, parseTimeOff } from '@/lib/timeOff'

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
  durationMinutes: number
): Promise<boolean> {
  const { data: existing } = await admin
    .from('bookings')
    .select('scheduled_time, estimated_duration_minutes')
    .eq('tidy_pro_id', cleanerId)
    .eq('scheduled_date', date)
    .not('status', 'in', '("cancelled","declined")')

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
  latitude: number | null
  longitude: number | null
}): boolean {
  return (
    cleaner.active_for_booking &&
    cleaner.cleaner_status === 'approved' &&
    !cleaner.is_away &&
    missingOnboardingSteps(cleaner).length === 0
  )
}

export async function findAvailableCleaners(
  params: {
    latitude: number
    longitude: number
    date: string | null // "YYYY-MM-DD", or null for "Any day"
    time: string | null // "HH:MM" or null for "Anytime"
    durationMinutes: number
  },
  admin: AdminClient
): Promise<CleanerMatch[]> {
  const { data: candidates } = await admin
    .from('tidypro_profiles')
    .select('id, active_for_booking, cleaner_status, is_away, rating, review_count, is_verified, total_accepted_bookings, profile_photo_url, bio, stripe_onboarding_completed, travel_radius_miles, latitude, longitude, availability, time_off')
    .eq('active_for_booking', true)
    .eq('cleaner_status', 'approved')
    .eq('is_away', false)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)

  if (!candidates || candidates.length === 0) return []

  const nearby = candidates
    .filter((c) => isAvailableForBooking(c))
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
  if (params.date) {
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
