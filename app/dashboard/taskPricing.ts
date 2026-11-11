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
import {
  FOLD_MINUTES_PER_BASKET,
  FULL_CYCLE_MINUTES_PER_LOAD,
  IRON_MINUTES_PER_ITEM,
  IRON_PRICE_PER_ITEM,
  START_LOAD_MINUTES_PER_LOAD,
  isLaundromatPartialCycle,
  isLaundryService,
  isValidBasketCount,
  isValidIronItemCount,
  machineLaundryPrice,
  machineLoadsFor,
  needsMachineLoads,
  pairedMachineLoads,
} from '@/lib/laundry'
import { ENTIRE_HOME_ROOM, entireHomeTier, isEntireHomeRoom, isFloorSweepOrMopTask } from '@/lib/entireHome'
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

// One laundry service with its own quantity, priced by the rates in
// lib/laundry.ts. One line item per task. Laundry never scales with home size.
// (Only Entire home and floor sweep/mop tasks do.)
function laundryServiceTaskToValidatedTasks(task: TidyTask): ValidatedTask[] {
  const service = task.laundryService
  const item = (name: string, tier: string, minutes: number, flatPrice?: number): ValidatedTask[] => [
    {
      normalized_task_name: name,
      tier,
      estimated_minutes: minutes,
      has_estimated_duration: false,
      cleaning_type_surcharge: 0,
      additional_issue_surcharge: 0,
      ...(flatPrice != null ? { flat_price: flatPrice } : {}),
    },
  ]

  if (service === 'iron') {
    if (!isValidIronItemCount(task.ironItems)) throw new UnpriceableTaskError(task)
    return item('Laundry (iron)', 'Per item', task.ironItems * IRON_MINUTES_PER_ITEM, task.ironItems * IRON_PRICE_PER_ITEM)
  }
  if (!isLaundryService(service) || !isValidBasketCount(task.laundryBaskets)) throw new UnpriceableTaskError(task)
  // Laundromat trips are full wash & dry cycles only.
  if (isLaundromatPartialCycle(task)) throw new UnpriceableTaskError(task)

  const baskets = task.laundryBaskets
  const loads = machineLoadsFor(task)
  if (needsMachineLoads(service) && loads == null) throw new UnpriceableTaskError(task)
  switch (service) {
    // Washing and drying are charged by the hour (machineLaundryPrice), not
    // the state rate.
    case 'wash':
    case 'dry': {
      const minutes = loads! * START_LOAD_MINUTES_PER_LOAD
      return item(`Laundry (${service}, start the load)`, 'Tiny', minutes, machineLaundryPrice(minutes))
    }
    case 'washDry': {
      const minutes = loads! * FULL_CYCLE_MINUTES_PER_LOAD
      return item('Laundry (wash & dry, full cycle)', 'Full cycle', minutes, machineLaundryPrice(minutes))
    }
    // Folding is priced like any other task, from its estimated time.
    case 'fold':
      return item('Laundry (fold)', 'Standard', baskets * FOLD_MINUTES_PER_BASKET)
  }
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
    scales_with_home_size: true,
    unusual_notes: [...task.unusual, task.notes].filter(Boolean).join('; ') || undefined,
  }
}

// Regular room tasks don't scale with home size, except floor sweeping and
// mopping.
function regularTaskToValidatedTask(task: TidyTask): ValidatedTask {
  const tier = task.tier ?? tierFromEstimatedMinutes(task.estimatedMinutes ?? -1)
  if (!tier) throw new UnpriceableTaskError(task)
  // Pet task whose photos expired before it was booked (see isTaskPriceable).
  if (task.pet && (task.pet.photos ?? []).length === 0) throw new UnpriceableTaskError(task)

  const dirtLevel: DirtLevel = task.dirtLevel ?? 'standard'

  return {
    normalized_task_name: task.name || task.room,
    tier,
    estimated_minutes: task.estimatedMinutes ?? TIER_MINUTE_MIDPOINTS[tier],
    has_estimated_duration: task.estimatedMinutes != null,
    cleaning_type_surcharge: CLEANING_TYPE_SURCHARGE[dirtLevel],
    additional_issue_surcharge: task.unusual.length * ADDITIONAL_ISSUE_SURCHARGE_PER_ITEM,
    ...(isFloorSweepOrMopTask(task.name) ? { scales_with_home_size: true } : {}),
    unusual_notes: [...task.unusual, task.notes].filter(Boolean).join('; ') || undefined,
  }
}

export function taskToValidatedTasks(task: TidyTask): ValidatedTask[] {
  if (task.laundryService) return laundryServiceTaskToValidatedTasks(task)
  if (task.laundryLoads) return laundryTaskToValidatedTasks(task.laundryLoads)
  if (typeof task.hasDishwasher === 'boolean') return [dishTaskToValidatedTask(task)]
  if (isEntireHomeRoom(task.room)) return [entireHomeTaskToValidatedTask(task)]
  return [regularTaskToValidatedTask(task)]
}

// Every task's line items. The Tidy Pro does the booking's non-laundry tasks
// while a Wash & dry (full cycle) runs, so the cycle's minutes are reduced by
// those tasks' minutes, down to zero, and only the cycle's remaining minutes
// are charged at the hourly laundry rate. The booking's time is therefore the
// longer of the cycle and the other tasks. The
// square footage multiplier still applies only to the non-laundry tasks'
// price, and only for Entire home and floor sweep/mop tasks. With several Wash & dry tasks the other
// tasks' time is only taken off once.
export function buildValidatedTaskPool(tasks: TidyTask[]): ValidatedTask[] {
  const perTask = tasks.map((task) => ({ task, items: taskToValidatedTasks(task) }))

  let overlap = perTask
    .filter(({ task }) => !task.laundryService && !task.laundryLoads)
    .reduce((sum, { items }) => sum + items.reduce((s, i) => s + i.estimated_minutes, 0), 0)

  return perTask.flatMap(({ task, items }) => {
    if (task.laundryService !== 'washDry' || overlap <= 0) return items
    return items.map((item) => {
      const minutes = Math.max(0, item.estimated_minutes - overlap)
      overlap -= item.estimated_minutes - minutes
      return { ...item, estimated_minutes: minutes, flat_price: machineLaundryPrice(minutes) }
    })
  })
}

// How long the visit is reserved for: every task's minutes, except that a
// load both washed and dried (a linked Wash + Dry pair) reserves the full
// 2-hour cycle once, in place of its two start-the-load times. The Tidy Pro
// stays on site through the cycle and can do the booking's other tasks
// meanwhile. Unpaired loads keep the Wash-only / Dry-only time.
//
// Pricing is unaffected: each task is still priced from its own line item.
// Throws UnpriceableTaskError like buildValidatedTaskPool.
export function visitDurationMinutes(tasks: TidyTask[], pool: ValidatedTask[] = buildValidatedTaskPool(tasks)): number {
  const taskMinutes = pool.reduce((sum, t) => sum + t.estimated_minutes, 0)
  const paired = pairedMachineLoads(tasks)
  return taskMinutes - paired * 2 * START_LOAD_MINUTES_PER_LOAD + paired * FULL_CYCLE_MINUTES_PER_LOAD
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
  // Laundry tasks are priced from their quantity, never an AI estimate. Pet
  // tasks are only ever estimated from their checked photos (Add Task), so a
  // text-only estimate is never backfilled for one.
  const needsEstimate = allTasks.filter(
    (t) => !isTaskPriceable(t) && !isEntireHomeRoom(t.room) && !t.laundryService && !t.pet
  )
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
  const breakdown = calculatePrice(pool, state, medianFourHourPrice, squareFootage)
  // total_task_minutes is the booking's length (availability checks and the
  // stored estimated_duration_minutes): the visit duration, which reserves
  // the full cycle for linked Wash + Dry loads. The price above is unchanged.
  return { ...breakdown, total_task_minutes: visitDurationMinutes(tasks, pool) }
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
