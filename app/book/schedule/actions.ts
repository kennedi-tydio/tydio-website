'use server'

import { requiredServicesForTasks } from '@/lib/tidyProServices'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { findAvailableCleaners, type CleanerMatch } from '@/lib/cleanerMatching'
import { resolveStatePricing, priceTaskListForState, resolveLocationSquareFootage } from '@/app/dashboard/taskPricing'
import { servicePriceForCleaner } from '@/lib/pricingRules'
import { closeUnmetSearch, recordUnmetSearch } from '@/lib/unmetBookingSearches'
import { normalizeScheduleRange } from '@/lib/bookingSlots'
import type { TidyTask } from '@/app/dashboard/types'
import { isRecurrenceFrequency, type RecurrenceFrequency } from '@/lib/recurrence'

export type ScheduledLocation =
  | { type: 'current_location'; latitude: number; longitude: number }
  | { type: 'address'; addressId: string; label: string; line: string; latitude: number | null; longitude: number | null }

export interface Schedule {
  location: ScheduledLocation | null
  date: string | null // "YYYY-MM-DD"
  // The last date of a date range, after `date`. null = just `date` (or Any day).
  endDate: string | null
  time: string | null // "HH:MM", null = Anytime
  // The latest start time of a time window, after `time`. null = exactly `time` (or Anytime).
  endTime: string | null
  // Repeat on the same weekday and time. Only for a specific date (not Any day or a range).
  recurrence?: RecurrenceFrequency | null
}

// A schedule with any range end that doesn't make sense dropped (see normalizeScheduleRange).
function withValidRange(schedule: Schedule): Schedule {
  return { ...schedule, ...normalizeScheduleRange(schedule) }
}

function locationKey(location: ScheduledLocation | null): string {
  if (!location) return ''
  return location.type === 'address' ? `address:${location.addressId}` : 'current_location'
}

export async function saveSchedule(draftId: string, input: Schedule): Promise<void> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return
  const schedule = withValidRange(input)

  const admin = createAdminClient()
  const { data: current } = await admin
    .from('booking_drafts')
    .select('scheduled_location')
    .eq('id', draftId)
    .eq('customer_user_id', session.profileId)
    .maybeSingle()
  // Entry instructions typed for one home shouldn't follow the booking to another.
  const placeChanged = locationKey(current?.scheduled_location as ScheduledLocation | null) !== locationKey(schedule.location)

  await admin
    .from('booking_drafts')
    .update({
      scheduled_location: schedule.location as never,
      scheduled_date: schedule.date,
      scheduled_end_date: schedule.endDate,
      scheduled_time: schedule.time,
      scheduled_end_time: schedule.endTime,
      any_day_selected: schedule.date == null,
      recurrence_frequency: schedule.date && !schedule.endDate && isRecurrenceFrequency(schedule.recurrence) ? schedule.recurrence : null,
      ...(placeChanged ? { entry_instructions: null } : {}),
    })
    .eq('id', draftId)
    .eq('customer_user_id', session.profileId)
}

export interface StatePricingNotConfiguredError {
  code: 'STATE_PRICING_NOT_CONFIGURED'
  message: string
  city: string | null
  state: string | null
}

export type PricedCleanerMatch = CleanerMatch & { price: number }

export interface CleanerSearchResult {
  cleaners: PricedCleanerMatch[]
  error?: StatePricingNotConfiguredError
  // No one matched and we saved the search, so the customer will hear when someone's free.
  notifyWhenAvailable?: boolean
}

const EMPTY_RESULT: CleanerSearchResult = { cleaners: [] }

export async function searchAvailableCleaners(
  draftId: string,
  input: Schedule,
  // The customer's browser zone, saved with a search nobody matched.
  timeZone?: string
): Promise<CleanerSearchResult> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return EMPTY_RESULT
  const schedule = withValidRange(input)
  if (!schedule.location) return EMPTY_RESULT
  if (schedule.location.latitude == null || schedule.location.longitude == null) {
    return EMPTY_RESULT
  }

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('service_area_id, city, state')
    .eq('id', session.profileId)
    .single()

  const { data: draft } = await admin
    .from('booking_drafts')
    .select('task_list')
    .eq('id', draftId)
    .eq('customer_user_id', session.profileId)
    .maybeSingle()

  const allTasks = (draft?.task_list as TidyTask[] | null) ?? []
  const tasks = allTasks.filter((t) => t.completed)
  if (tasks.length === 0) return EMPTY_RESULT

  const statePricing = await resolveStatePricing(admin, profile?.service_area_id ?? null, profile ?? undefined)
  if (!statePricing.configured) {
    return {
      cleaners: [],
      error: {
        code: 'STATE_PRICING_NOT_CONFIGURED',
        message: 'Instant pricing is not currently available for this service location.',
        city: statePricing.city,
        state: statePricing.state,
      },
    }
  }

  const squareFootage = await resolveLocationSquareFootage(admin, session.profileId, schedule.location)

  let durationMinutes = 180
  let basePrice = 0
  try {
    const breakdown = priceTaskListForState(tasks, statePricing.state, statePricing.medianFourHourPrice, squareFootage)
    durationMinutes = breakdown.total_task_minutes
    basePrice = breakdown.total_customer_charge
  } catch {
    // fall back to the default typical duration if a task is unpriceable
  }

  const cleaners = await findAvailableCleaners(
    {
      latitude: schedule.location.latitude,
      longitude: schedule.location.longitude,
      date: schedule.date,
      endDate: schedule.endDate,
      time: schedule.time,
      endTime: schedule.endTime,
      durationMinutes,
      requiredServices: requiredServicesForTasks(tasks),
    },
    admin
  )

  // No one matched: tell the admin, and keep looking so the customer hears when someone's free.
  if (cleaners.length === 0) {
    const watching = await recordUnmetSearch(admin, {
      customerId: session.profileId,
      draftId,
      location: {
        latitude: schedule.location.latitude,
        longitude: schedule.location.longitude,
        label: schedule.location.type === 'address' ? `${schedule.location.label} · ${schedule.location.line}` : null,
      },
      date: schedule.date,
      endDate: schedule.endDate,
      time: schedule.time,
      endTime: schedule.endTime,
      timeZone: timeZone ?? null,
      durationMinutes,
      requiredServices: requiredServicesForTasks(tasks),
      tasks: tasks.map((t) => ({ name: t.name, room: t.room })),
      estimatedPrice: basePrice > 0 ? basePrice : null,
    }).catch((err) => {
      console.error('[Tydio] Saving unmet search failed:', err)
      return false
    })
    return { cleaners: [], notifyWhenAvailable: watching }
  }

  await closeUnmetSearch(admin, draftId).catch((err) => console.error('[Tydio] Closing unmet search failed:', err))

  const pricedCleaners = cleaners.map((cleaner) => ({
    ...cleaner,
    price: servicePriceForCleaner(basePrice, cleaner),
  }))

  return { cleaners: pricedCleaners }
}
