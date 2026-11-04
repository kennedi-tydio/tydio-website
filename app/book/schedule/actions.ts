'use server'

import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { findAvailableCleaners, type CleanerMatch } from '@/lib/cleanerMatching'
import { resolveStatePricing, priceTaskListForState, resolveLocationSquareFootage } from '@/app/dashboard/taskPricing'
import { TOP_TIDY_PRO_SURCHARGE, FAR_DISTANCE_SURCHARGE_MILES, FAR_DISTANCE_SURCHARGE } from '@/lib/pricingRules'
import type { TidyTask } from '@/app/dashboard/types'

export type ScheduledLocation =
  | { type: 'current_location'; latitude: number; longitude: number }
  | { type: 'address'; addressId: string; label: string; line: string; latitude: number | null; longitude: number | null }

export interface Schedule {
  location: ScheduledLocation | null
  date: string | null // "YYYY-MM-DD"
  time: string | null // "HH:MM", null = Anytime
}

export async function saveSchedule(draftId: string, schedule: Schedule): Promise<void> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return

  const admin = createAdminClient()
  await admin
    .from('booking_drafts')
    .update({
      scheduled_location: schedule.location as never,
      scheduled_date: schedule.date,
      scheduled_time: schedule.time,
      any_day_selected: schedule.date == null,
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
}

const EMPTY_RESULT: CleanerSearchResult = { cleaners: [] }

export async function searchAvailableCleaners(
  draftId: string,
  schedule: Schedule
): Promise<CleanerSearchResult> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return EMPTY_RESULT
  if (!schedule.location) return EMPTY_RESULT
  if (schedule.location.latitude == null || schedule.location.longitude == null) {
    return EMPTY_RESULT
  }

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('service_area_id')
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

  const statePricing = await resolveStatePricing(admin, profile?.service_area_id ?? null)
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
      time: schedule.time,
      durationMinutes,
    },
    admin
  )

  const pricedCleaners = cleaners.map((cleaner) => ({
    ...cleaner,
    price:
      basePrice +
      (cleaner.isTopTidyPro ? TOP_TIDY_PRO_SURCHARGE : 0) +
      (cleaner.distanceMiles > FAR_DISTANCE_SURCHARGE_MILES ? FAR_DISTANCE_SURCHARGE : 0),
  }))

  return { cleaners: pricedCleaners }
}
