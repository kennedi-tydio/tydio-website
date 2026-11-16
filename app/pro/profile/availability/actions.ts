'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { WEEKDAY_KEYS, type WeeklyAvailability } from '@/lib/cleanerMatching'
import { userFacingError } from '@/lib/userFacingError'
import { notifyIfOnboardingComplete } from '@/lib/onboardingComplete'
import { DEFAULT_BOOKING_TIME_ZONE, todayInZone } from '@/lib/bookingTime'
import { cancelBookingForTidyPro } from '@/lib/tidyProCancellation'
import {
  MAX_TIME_OFF_RANGES,
  isValidISODate,
  isValidTime,
  normalizeTimeOff,
  overlapsTimeOff,
  parseTimeOff,
  sameTimeOffRange,
  type TimeOffRange,
} from '@/lib/timeOff'

// Saved on its own, the moment it's toggled, so it never depends on the cleaner also
// saving their hours. Those stay as they are, ready for when they come back.
export async function setAwayAction(away: boolean): Promise<{ error: string } | { success: true }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const admin = createAdminClient()
  const { error } = await admin.from('tidypro_profiles').update({ is_away: away }).eq('id', session.profileId)

  if (error) return { error: userFacingError(error) }

  revalidatePath('/pro/profile/availability')
  return { success: true }
}

export async function saveAvailabilityAction(
  availability: WeeklyAvailability
): Promise<{ error: string } | { success: true }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const cleaned: WeeklyAvailability = {}
  for (const day of WEEKDAY_KEYS) {
    const ranges = availability[day]
    if (!ranges || ranges.length === 0) continue
    for (const range of ranges) {
      if (!range.start || !range.end) return { error: 'Please fill in every time range, or remove it.' }
    }
    cleaned[day] = ranges
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('tidypro_profiles')
    .update({ availability: cleaned as never })
    .eq('id', session.profileId)

  if (error) return { error: userFacingError(error) }

  await notifyIfOnboardingComplete(admin, session.profileId)

  revalidatePath('/pro/profile/availability')
  return { success: true }
}

// conflicts: bookings and requests still on those dates. cancelledVisits: recurring
// visits on them, which time off cancels (the customer is told).
type TimeOffResult = { error: string } | { success: true; timeOff: TimeOffRange[]; conflicts: number; cancelledVisits: number }

async function loadTimeOff(admin: ReturnType<typeof createAdminClient>, proId: string) {
  const { data, error } = await admin.from('tidypro_profiles').select('time_off, time_zone').eq('id', proId).single()
  if (error) throw new Error(error.message)
  return { timeOff: parseTimeOff(data?.time_off), today: todayInZone(data?.time_zone ?? DEFAULT_BOOKING_TIME_ZONE) }
}

// Like the Away switch, each change saves on its own, the moment it's made.
// `end` is optional: leave it out for a single day. Leave out the times for all day;
// otherwise it runs from startTime on the start date to endTime on the end date.
export async function addTimeOffAction(input: {
  start: string
  end?: string
  startTime?: string
  endTime?: string
}): Promise<TimeOffResult> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const start = input.start
  const last = input.end || start
  if (!isValidISODate(start) || !isValidISODate(last)) return { error: 'Please choose a date.' }
  if (last < start) return { error: 'The end date must be on or after the start date.' }

  const timed = input.startTime != null || input.endTime != null
  if (timed && (!isValidTime(input.startTime) || !isValidTime(input.endTime))) {
    return { error: 'Please choose a start and end time, or check "All day".' }
  }
  if (timed && start === last && input.endTime! <= input.startTime!) {
    return { error: 'The end time must be after the start time.' }
  }
  const range: TimeOffRange = timed ? { start, end: last, startTime: input.startTime, endTime: input.endTime } : { start, end: last }

  const admin = createAdminClient()
  try {
    const current = await loadTimeOff(admin, session.profileId)
    if (last < current.today) return { error: 'That date has already passed.' }

    const timeOff = normalizeTimeOff([...current.timeOff, range], current.today)
    if (timeOff.length > MAX_TIME_OFF_RANGES) return { error: `You can have up to ${MAX_TIME_OFF_RANGES} time-off dates at once.` }

    const { error } = await admin.from('tidypro_profiles').update({ time_off: timeOff as never }).eq('id', session.profileId)
    if (error) return { error: userFacingError(error) }

    // Time off stops new bookings. A recurring visit on those dates was put on their
    // schedule for them, so it's canceled and the customer told. Anything else already
    // accepted or waiting on them is still theirs to handle, so they're told about it.
    const { data: existing } = await admin
      .from('bookings')
      .select('id, scheduled_date, scheduled_time, estimated_duration_minutes, status, progress_status, recurring_booking_id')
      .eq('tidy_pro_id', session.profileId)
      .in('status', ['pending', 'scheduled'])
      .gte('scheduled_date', start)
      .lte('scheduled_date', last)
    const overlapping = (existing ?? []).filter((b) =>
      b.scheduled_date && b.scheduled_time ? overlapsTimeOff([range], b.scheduled_date, b.scheduled_time, b.estimated_duration_minutes ?? 60) : true
    )

    let cancelledVisits = 0
    let conflicts = 0
    for (const b of overlapping) {
      if (b.recurring_booking_id && b.status === 'scheduled' && b.progress_status == null) {
        const result = await cancelBookingForTidyPro(admin, {
          bookingId: b.id,
          tidyProId: session.profileId,
          reason: { cancellation_reason: 'no_longer_available', cancellation_note: 'Time off' },
        })
        if ('success' in result) {
          cancelledVisits++
          continue
        }
        console.error(`Canceling recurring visit ${b.id} for time off:`, result.error)
      }
      conflicts++
    }

    revalidatePath('/pro/profile/availability')
    if (cancelledVisits > 0) revalidatePath('/pro/bookings')
    return { success: true, timeOff, conflicts, cancelledVisits }
  } catch (err) {
    return { error: userFacingError(err) }
  }
}

export async function removeTimeOffAction(range: TimeOffRange): Promise<TimeOffResult> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const admin = createAdminClient()
  try {
    const current = await loadTimeOff(admin, session.profileId)
    const timeOff = normalizeTimeOff(
      current.timeOff.filter((r) => !sameTimeOffRange(r, range)),
      current.today
    )

    const { error } = await admin.from('tidypro_profiles').update({ time_off: timeOff as never }).eq('id', session.profileId)
    if (error) return { error: userFacingError(error) }

    revalidatePath('/pro/profile/availability')
    return { success: true, timeOff, conflicts: 0, cancelledVisits: 0 }
  } catch (err) {
    return { error: userFacingError(err) }
  }
}
