import {
  type PricingBreakdown,
  type Tier,
  type ValidatedTask,
  ADDITIONAL_ISSUE_SURCHARGE_PER_ITEM,
  CLEANING_TYPE_SURCHARGE,
  TIER_MINUTE_MIDPOINTS,
  calculatePrice,
  tierFromEstimatedMinutes,
} from '@/lib/pricingRules'
import { estimateTaskDuration } from '@/lib/aiTaskEstimate'
import { isSquareFootage, type SquareFootage } from '@/lib/squareFootage'
import { ENTIRE_HOME_ROOM, entireHomeTier, isEntireHomeRoom } from '@/lib/entireHome'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import type { createAdminClient } from '@/lib/supabase/admin'
import { isTaskPriceable } from './isTaskPriceable'
import type { DirtLevel, LaundryLoads, TidyTask } from './types'

export { isTaskPriceable } from './isTaskPriceable'

export class UnpriceableTaskError extends Error {
  constructor(task: TidyTask) {
    super(`Task "${task.name || task.id}" has no resolvable price tier`)
    this.name = 'UnpriceableTaskError'
  }
}

const DISH_TIER: Record<'withDishwasher' | 'withoutDishwasher', Tier> = {
  withDishwasher: 'Quick',
  withoutDishwasher: 'Heavy',
}

const LAUNDRY_UNIT_TIER: Record<keyof LaundryLoads, Tier> = {
  wash: 'Tiny',
  dry: 'Tiny',
  fold: 'Standard',
}

function laundryTaskToValidatedTasks(loads: LaundryLoads): ValidatedTask[] {
  const units: ValidatedTask[] = []
  ;(Object.keys(LAUNDRY_UNIT_TIER) as (keyof LaundryLoads)[]).forEach((unit) => {
    const tier = LAUNDRY_UNIT_TIER[unit]
    for (let i = 0; i < loads[unit]; i++) {
      units.push({
        normalized_task_name: `Laundry (${unit})`,
        tier,
        estimated_minutes: TIER_MINUTE_MIDPOINTS[tier],
        has_estimated_duration: false,
        cleaning_type_surcharge: 0,
        additional_issue_surcharge: 0,
      })
    }
  })
  return units
}

function dishTaskToValidatedTask(task: TidyTask): ValidatedTask {
  const tier = task.hasDishwasher ? DISH_TIER.withDishwasher : DISH_TIER.withoutDishwasher
  return {
    normalized_task_name: task.name || 'Dishes',
    tier,
    estimated_minutes: TIER_MINUTE_MIDPOINTS[tier],
    has_estimated_duration: false,
    cleaning_type_surcharge: 0,
    additional_issue_surcharge: 0,
  }
}

// Whole-home tasks get a fixed tier from the task name (not the client's
// stored tier), then scale with the address's square footage multiplier.
function entireHomeTaskToValidatedTask(task: TidyTask): ValidatedTask {
  const tier = entireHomeTier(task.name)
  if (!tier) throw new UnpriceableTaskError(task)
  const dirtLevel: DirtLevel = task.dirtLevel ?? 'standard'
  return {
    normalized_task_name: `${task.name} (${ENTIRE_HOME_ROOM})`,
    tier,
    estimated_minutes: TIER_MINUTE_MIDPOINTS[tier],
    has_estimated_duration: false,
    cleaning_type_surcharge: CLEANING_TYPE_SURCHARGE[dirtLevel],
    additional_issue_surcharge: task.unusual.length * ADDITIONAL_ISSUE_SURCHARGE_PER_ITEM,
    unusual_notes: [...task.unusual, task.notes].filter(Boolean).join('; ') || undefined,
  }
}

function regularTaskToValidatedTask(task: TidyTask): ValidatedTask {
  const tier = task.tier ?? tierFromEstimatedMinutes(task.estimatedMinutes ?? -1)
  if (!tier) throw new UnpriceableTaskError(task)

  const dirtLevel: DirtLevel = task.dirtLevel ?? 'standard'

  return {
    normalized_task_name: task.name || task.room,
    tier,
    estimated_minutes: task.estimatedMinutes ?? TIER_MINUTE_MIDPOINTS[tier],
    has_estimated_duration: task.estimatedMinutes != null,
    cleaning_type_surcharge: CLEANING_TYPE_SURCHARGE[dirtLevel],
    additional_issue_surcharge: task.unusual.length * ADDITIONAL_ISSUE_SURCHARGE_PER_ITEM,
    unusual_notes: [...task.unusual, task.notes].filter(Boolean).join('; ') || undefined,
  }
}

export function taskToValidatedTasks(task: TidyTask): ValidatedTask[] {
  if (task.laundryLoads) return laundryTaskToValidatedTasks(task.laundryLoads)
  if (typeof task.hasDishwasher === 'boolean') return [dishTaskToValidatedTask(task)]
  if (isEntireHomeRoom(task.room)) return [entireHomeTaskToValidatedTask(task)]
  return [regularTaskToValidatedTask(task)]
}

export function buildValidatedTaskPool(tasks: TidyTask[]): ValidatedTask[] {
  return tasks.flatMap(taskToValidatedTasks)
}

// Self-healing backfill for tasks that ended up saved without a tier/estimate
// (e.g. an interrupted request from before the "Add Task" flow blocked on a
// failed estimate). Rather than rejecting these at booking time, read the
// same task info the AI would have seen originally — name, room, mess level,
// notes, additional issues — and estimate it now, then persist the fix so it
// only ever needs to happen once per task. Takes the *full* draft task list
// (not just the completed/selected subset) so the write-back doesn't drop
// unselected tasks.
export async function ensurePriceableTasks(
  admin: ReturnType<typeof createAdminClient>,
  draftId: string,
  allTasks: TidyTask[]
): Promise<TidyTask[]> {
  const needsEstimate = allTasks.filter((t) => !isTaskPriceable(t) && !isEntireHomeRoom(t.room))
  if (needsEstimate.length === 0) return allTasks

  const patches = await Promise.all(
    needsEstimate.map(async (t) => {
      try {
        const result = await estimateTaskDuration({
          name: t.name,
          room: t.room,
          notes: t.notes,
          dirtLevel: t.dirtLevel,
          unusual: t.unusual,
        })
        return { id: t.id, tier: result.tier, estimatedMinutes: result.estimated_minutes }
      } catch {
        // Genuinely no way to reach the AI right now (offline, provider
        // down) — leave this one task unpriceable; the caller's existing
        // UnpriceableTaskError handling still applies as the last resort.
        return { id: t.id, tier: null, estimatedMinutes: null }
      }
    })
  )

  const patchById = new Map(patches.map((p) => [p.id, p]))
  const repaired = allTasks.map((t) => {
    const patch = patchById.get(t.id)
    if (!patch || patch.tier == null) return t
    return { ...t, tier: patch.tier, estimatedMinutes: patch.estimatedMinutes }
  })

  const { error } = await admin.from('booking_drafts').update({ task_list: repaired as never }).eq('id', draftId)
  if (error) console.error('Failed to persist repaired task estimates', error)

  return repaired
}

export function priceTaskListForState(
  tasks: TidyTask[],
  state: string,
  medianFourHourPrice: number,
  squareFootage: SquareFootage | null = null
): PricingBreakdown {
  const pool = buildValidatedTaskPool(tasks)
  return calculatePrice(pool, state, medianFourHourPrice, squareFootage)
}

// The square footage that prices a booking, read from the customer's own
// saved address - never trusted from the client. Null for a current-location
// booking or an address with no square footage, which prices at the base rate.
export async function resolveLocationSquareFootage(
  admin: ReturnType<typeof createAdminClient>,
  customerId: string,
  location: ScheduledLocation | null
): Promise<SquareFootage | null> {
  if (location?.type !== 'address') return null

  const { data } = await admin
    .from('user_addresses')
    .select('square_footage')
    .eq('id', location.addressId)
    .eq('user_id', customerId)
    .maybeSingle()

  return isSquareFootage(data?.square_footage) ? data.square_footage : null
}

export type StatePricingResult =
  | { configured: true; state: string; medianFourHourPrice: number }
  | { configured: false; city: string | null; state: string | null }

// Resolves the administrator-configured, active price for the customer's
// state. The state comes from their service area when they have one, and
// otherwise from the city/state saved on their profile at signup (worked out
// from their zip) — a customer granted access one-by-one from /admin/users
// has no service area. Never falls back to a default/guessed price — if no
// active price is configured for that state, callers must surface
// STATE_PRICING_NOT_CONFIGURED rather than completing the quote.
export async function resolveStatePricing(
  admin: ReturnType<typeof createAdminClient>,
  serviceAreaId: string | null,
  profileLocation?: { city: string | null; state: string | null }
): Promise<StatePricingResult> {
  let area: { city: string | null; state: string | null } | null = null
  if (serviceAreaId) {
    const { data } = await admin
      .from('service_areas')
      .select('city, state')
      .eq('id', serviceAreaId)
      .maybeSingle()
    area = data
  }
  if (!area?.state && profileLocation?.state) area = profileLocation

  if (!area?.state) return { configured: false, city: area?.city ?? null, state: null }

  const { data: pricing } = await admin
    .from('state_pricing')
    .select('state, median_four_hour_price, pricing_active')
    .eq('state', area.state)
    .maybeSingle()

  if (!pricing || !pricing.pricing_active) {
    return { configured: false, city: area.city, state: area.state }
  }

  return {
    configured: true,
    state: pricing.state,
    medianFourHourPrice: pricing.median_four_hour_price,
  }
}
