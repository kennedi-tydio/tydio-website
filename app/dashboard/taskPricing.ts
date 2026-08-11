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
import type { createAdminClient } from '@/lib/supabase/admin'
import type { DirtLevel, LaundryLoads, TidyTask } from './types'

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
  return [regularTaskToValidatedTask(task)]
}

export function buildValidatedTaskPool(tasks: TidyTask[]): ValidatedTask[] {
  return tasks.flatMap(taskToValidatedTasks)
}

export function priceTaskListForState(tasks: TidyTask[], state: string, medianFourHourPrice: number): PricingBreakdown {
  const pool = buildValidatedTaskPool(tasks)
  return calculatePrice(pool, state, medianFourHourPrice)
}

export type StatePricingResult =
  | { configured: true; state: string; medianFourHourPrice: number }
  | { configured: false; city: string | null; state: string | null }

// Resolves the administrator-configured, active price for the state a
// customer's service area is in. Never falls back to a default/guessed
// price — if no active price is configured for that state, callers must
// surface STATE_PRICING_NOT_CONFIGURED rather than completing the quote.
export async function resolveStatePricing(
  admin: ReturnType<typeof createAdminClient>,
  serviceAreaId: string | null
): Promise<StatePricingResult> {
  if (!serviceAreaId) return { configured: false, city: null, state: null }

  const { data: area } = await admin
    .from('service_areas')
    .select('city, state')
    .eq('id', serviceAreaId)
    .maybeSingle()

  if (!area) return { configured: false, city: null, state: null }

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
