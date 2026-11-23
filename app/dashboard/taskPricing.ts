import {
  type PricingBreakdown,
  type Tier,
  type ValidatedTask,
  ADDITIONAL_ISSUE_SURCHARGE_PER_ITEM,
  CLEANING_TYPE_SURCHARGE,
  TIER_MINUTE_MIDPOINTS,
  calculatePrice,
  tierFromEstimatedMinutes,
  visitMinutes,
} from '@/lib/pricingRules'
import { estimateTaskDuration } from '@/lib/aiTaskEstimate'
import { isSquareFootage, type SquareFootage } from '@/lib/squareFootage'
import {
  FOLD_MINUTES_PER_BASKET,
  FULL_CYCLE_MINUTES_PER_LOAD,
  IRON_MINUTES_PER_ITEM,
  IRON_PRICE_PER_ITEM,
  PAIRED_LOAD_MINUTES_PER_LOAD,
  START_LOAD_MINUTES_PER_LOAD,
  isLaundromatPartialCycle,
  isLaundryService,
  isValidBasketCount,
  isValidIronItemCount,
  laundromatMinutes,
  machineLaundryPrice,
  machineLoadsFor,
  needsMachineLoads,
  sameLaundryPartner,
  usesLaundromat,
} from '@/lib/laundry'
import { ENTIRE_HOME_ROOM, entireHomeTier, isEntireHomeRoom, isFloorSweepOrMopTask } from '@/lib/entireHome'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import type { createAdminClient } from '@/lib/supabase/admin'
import { isTaskPriceable } from './isTaskPriceable'
import { QUOTE_PLACEHOLDER_MINUTES } from '@/lib/taskQuotes'
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
    // Starting a load and leaving is charged by the hour (machineLaundryPrice),
    // not the state rate.
    case 'wash':
    case 'dry': {
      const minutes = loads! * START_LOAD_MINUTES_PER_LOAD
      return item(`Laundry (${service}, start the load)`, 'Tiny', minutes, machineLaundryPrice(minutes))
    }
    // The full cycle is task time at the state rate, 2 hours a load. At a
    // laundromat, 2 hours for every 3 loads, run side by side.
    case 'washDry':
      return usesLaundromat(task)
        ? item('Laundry (laundromat trip, wash & dry)', 'Laundromat', laundromatMinutes(loads!))
        : item('Laundry (wash & dry, full cycle)', 'Full cycle', loads! * FULL_CYCLE_MINUTES_PER_LOAD)
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
    // A bigger home takes longer, too.
    scales_time_with_home_size: true,
    unusual_notes: [...task.unusual, task.notes].filter(Boolean).join('; ') || undefined,
  }
}

// Regular room tasks don't scale with home size, except floor sweeping and
// mopping.
function regularTaskToValidatedTask(task: TidyTask): ValidatedTask {
  // Waiting on the Tidy Pro's quote: no charge yet, but it holds the longest
  // a Tidy Task can take on the calendar. placeBooking refuses to charge for
  // a booking that still has one of these.
  if (task.needsQuote === true) {
    if (task.pet && (task.pet.photos ?? []).length === 0) throw new UnpriceableTaskError(task)
    return {
      normalized_task_name: task.name || task.room,
      tier: 'Quote',
      estimated_minutes: QUOTE_PLACEHOLDER_MINUTES,
      has_estimated_duration: false,
      cleaning_type_surcharge: 0,
      additional_issue_surcharge: 0,
      flat_price: 0,
      unusual_notes: [...task.unusual, task.notes].filter(Boolean).join('; ') || undefined,
    }
  }
  // Quoted by the Tidy Pro in dollars: their price is the whole charge for the
  // task (no surcharges or home-size multiplier on top), holding the same time.
  if (typeof task.quotedPrice === 'number' && task.quotedPrice > 0) {
    return {
      normalized_task_name: task.name || task.room,
      tier: 'Tidy Pro quote',
      estimated_minutes: QUOTE_PLACEHOLDER_MINUTES,
      has_estimated_duration: false,
      cleaning_type_surcharge: 0,
      additional_issue_surcharge: 0,
      flat_price: task.quotedPrice,
      unusual_notes: [...task.unusual, task.notes].filter(Boolean).join('; ') || undefined,
    }
  }
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

// A linked Wash + Dry pair (the same laundry): the Tidy Pro washes the load and
// moves it to the dryer, 1 hour a load at the state rate. The Wash task carries
// one line item for the loads both washed and dried, in place of the two
// start-the-load items, and the Dry task adds none of its own. Like a Wash &
// dry task, it covers the time of the booking's household tasks. Each task is
// still checked as usual first.
function fullCycleItemsForPair(task: TidyTask, items: ValidatedTask[], tasks: TidyTask[]): ValidatedTask[] | null {
  if (task.laundryService !== 'wash' && task.laundryService !== 'dry') return null
  const partner = sameLaundryPartner(task, tasks)
  if (!partner) return null
  if (task.laundryService === 'dry') return []
  const loads = Math.min(machineLoadsFor(task) ?? 0, machineLoadsFor(partner) ?? 0)
  if (loads <= 0) return null
  const { flat_price: _startLoadPrice, ...rest } = items[0]
  void _startLoadPrice
  return [
    {
      ...rest,
      normalized_task_name: 'Laundry (wash, moved to the dryer)',
      tier: 'Wash & dry, left in dryer',
      estimated_minutes: loads * PAIRED_LOAD_MINUTES_PER_LOAD,
    },
  ]
}

type TaskItems = { task: TidyTask; items: ValidatedTask[]; fullCycle: boolean }

function itemsPerTask(tasks: TidyTask[]): TaskItems[] {
  return tasks.map((task) => {
    const items = taskToValidatedTasks(task)
    const pairItems = fullCycleItemsForPair(task, items, tasks)
    // Laundry run at home while the Tidy Pro does the other tasks. A laundromat
    // trip isn't: they're away for it, so it adds to the visit and covers nothing.
    const fullCycle = (task.laundryService === 'washDry' && !usesLaundromat(task)) || (pairItems != null && pairItems.length > 0)
    return { task, items: pairItems ?? items, fullCycle }
  })
}

// Every task's line items. A Wash & dry task (2 hours a load) or a linked
// Wash + Dry pair (1 hour a load) is charged at the state rate, and the
// booking's household tasks are done while it runs, so their time is covered by
// it: only household time beyond the laundry's is charged (priced_minutes).
// Their surcharges and home-size multiplier are still charged in full. In
// Atlanta ($53 an hour), 1 Wash & dry load with 3 hours of other tasks is
// $106 + $53 = $159, plus those tasks' surcharges and multiplier. Other laundry
// (fold, iron, start a load) is charged on top as before.
export function buildValidatedTaskPool(tasks: TidyTask[]): ValidatedTask[] {
  const perTask = itemsPerTask(tasks)
  let coverMinutes = perTask
    .filter(({ fullCycle }) => fullCycle)
    .reduce((sum, { items }) => sum + items.reduce((s, i) => s + i.estimated_minutes, 0), 0)
  return perTask.flatMap(({ task, items }) => {
    if (coverMinutes <= 0 || !isHouseholdTask(task)) return items
    return items.map((item) => {
      if (item.flat_price != null) return item
      const covered = Math.min(coverMinutes, item.estimated_minutes)
      coverMinutes -= covered
      return covered > 0 ? { ...item, priced_minutes: item.estimated_minutes - covered } : item
    })
  })
}

const isHouseholdTask = (task: TidyTask) => !task.laundryService && !task.laundryLoads

// How long the visit is reserved for. The Tidy Pro does the booking's
// household (non-laundry) tasks while a full wash & dry cycle runs, so those
// overlap: the visit lasts the longer of the cycles and the household tasks
// (other tasks under 2 hours → 2 hours; over 2 hours → their own time), plus
// any other laundry tasks. Time only: the price is unaffected (see
// buildValidatedTaskPool). Entire home tasks are scaled by the home's square
// footage (visitMinutes). Throws UnpriceableTaskError like buildValidatedTaskPool.
//
// `extraHouseholdMinutes` is a Standard / Deep Cleaning's estimated time
// (lib/aiFullServiceEstimate), which counts as household time: laundry runs
// during it too. Time only, never price.
export function visitDurationMinutes(
  tasks: TidyTask[],
  squareFootage: SquareFootage | null = null,
  extraHouseholdMinutes = 0
): number {
  let cycles = 0
  let household = Math.max(0, extraHouseholdMinutes)
  let otherLaundry = 0
  for (const { task, items, fullCycle } of itemsPerTask(tasks)) {
    const minutes = items.reduce((sum, i) => sum + visitMinutes(i, squareFootage), 0)
    if (fullCycle) cycles += minutes
    else if (isHouseholdTask(task)) household += minutes
    else otherLaundry += minutes
  }
  return Math.max(cycles, household) + otherLaundry
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
        return { id: t.id, tier: result.tier, estimatedMinutes: result.estimated_minutes, needsQuote: false }
      } catch {
        // No way to reach the AI right now (provider down, no key): the
        // Tidy Pro quotes this task instead (lib/taskQuotes.ts).
        return { id: t.id, tier: null, estimatedMinutes: null, needsQuote: true }
      }
    })
  )

  const patchById = new Map(patches.map((p) => [p.id, p]))
  const repaired = allTasks.map((t) => {
    const patch = patchById.get(t.id)
    if (patch?.needsQuote) return { ...t, needsQuote: true }
    if (!patch || patch.tier == null) return t
    return { ...t, tier: patch.tier, estimatedMinutes: patch.estimatedMinutes }
  })
  if (!patches.some((p) => p.needsQuote || p.tier != null)) return allTasks

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
  return { ...breakdown, total_task_minutes: visitDurationMinutes(tasks, squareFootage) }
}

// The square footage that prices a booking, read from the customer's own
// saved address - never trusted from the client. Null for a current-location
// search or an address with no square footage. Booking itself needs a saved
// address with a size (lib/placeBooking, HOME_SIZE_REQUIRED_MESSAGE).
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
