export const PRICING_VERSION = 'v1'

export const TIER_BASE_PRICES: Record<string, number> = {
  Tiny: 39,
  Quick: 39,
  Standard: 39,
  Heavy: 49,
}

export const TIER_ADDON_PRICES: Record<string, number> = {
  Tiny: 8,
  Quick: 12,
  Standard: 18,
  Heavy: 25,
}

export const CLEANER_PAYOUT_RATE = 0.80
export const PLATFORM_FEE_RATE = 0.20

// No service fee in MVP v1
// Tips pass 100% to cleaner on top of 80% payout

export const CONDITION_MULTIPLIERS: Record<string, number> = {
  normal: 1.0,
  dirty: 1.15,
  very_dirty: 1.25,
}

export const UNUSUAL_NOTES_SURCHARGE = 5

export const TIER_ORDER = ['Tiny', 'Quick', 'Standard', 'Heavy'] as const
type Tier = (typeof TIER_ORDER)[number]

export interface ValidatedTask {
  normalized_task_name: string
  tier: string
  estimated_minutes: number
  condition_level: 'normal' | 'dirty' | 'very_dirty'
  has_unusual_factors: boolean
  unusual_notes?: string
}

export interface TaskLineItem {
  name: string
  tier: string
  is_first_task: boolean
  estimated_minutes: number
  condition_level: string
  has_unusual_factors: boolean
  unusual_notes?: string
  base_price: number
  condition_multiplier: number
  unusual_surcharge: number
  final_price: number
}

export interface PricingBreakdown {
  pricing_version: string
  first_task: { name: string; tier: string; price: number }
  addon_tasks: { name: string; tier: string; price: number }[]
  task_list: TaskLineItem[]
  customer_subtotal: number
  total_customer_charge: number
  cleaner_payout: number
  platform_fee: number
  stripe_fee_estimate: number
  quote_generated_at: string
}

export function selectFirstTask(tasks: ValidatedTask[]): number {
  let firstIndex = 0
  let highestTierIndex = -1

  for (let i = 0; i < tasks.length; i++) {
    const tierIdx = TIER_ORDER.indexOf(tasks[i].tier as Tier)
    if (tierIdx > highestTierIndex) {
      highestTierIndex = tierIdx
      firstIndex = i
    }
  }

  return firstIndex
}

export function applyConditionModifiers(
  basePrice: number,
  conditionLevel: string,
  hasUnusualFactors: boolean
): { finalPrice: number; multiplier: number; surcharge: number } {
  const multiplier = CONDITION_MULTIPLIERS[conditionLevel] ?? 1.0
  const surcharge = hasUnusualFactors ? UNUSUAL_NOTES_SURCHARGE : 0
  const finalPrice = Math.round(basePrice * multiplier) + surcharge
  return { finalPrice, multiplier, surcharge }
}

export function calculateBookingPrice(tasks: ValidatedTask[]): PricingBreakdown {
  if (tasks.length === 0) {
    throw new Error('At least one task is required')
  }

  const firstTaskIndex = selectFirstTask(tasks)
  const taskLineItems: TaskLineItem[] = []

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]
    const isFirst = i === firstTaskIndex
    const basePrice = isFirst
      ? TIER_BASE_PRICES[task.tier] ?? 39
      : TIER_ADDON_PRICES[task.tier] ?? 8

    const { finalPrice, multiplier, surcharge } = applyConditionModifiers(
      basePrice,
      task.condition_level,
      task.has_unusual_factors
    )

    taskLineItems.push({
      name: task.normalized_task_name,
      tier: task.tier,
      is_first_task: isFirst,
      estimated_minutes: task.estimated_minutes,
      condition_level: task.condition_level,
      has_unusual_factors: task.has_unusual_factors,
      unusual_notes: task.unusual_notes,
      base_price: basePrice,
      condition_multiplier: multiplier,
      unusual_surcharge: surcharge,
      final_price: finalPrice,
    })
  }

  const firstItem = taskLineItems.find((t) => t.is_first_task)!
  const addonItems = taskLineItems.filter((t) => !t.is_first_task)

  const customerSubtotal = taskLineItems.reduce((sum, t) => sum + t.final_price, 0)
  const totalCustomerCharge = customerSubtotal // no service fee in v1
  const cleanerPayout = Math.round(customerSubtotal * CLEANER_PAYOUT_RATE * 100) / 100
  const platformFee = Math.round(customerSubtotal * PLATFORM_FEE_RATE * 100) / 100
  const stripeFeeEstimate = Math.round((totalCustomerCharge * 0.029 + 0.30) * 100) / 100

  return {
    pricing_version: PRICING_VERSION,
    first_task: { name: firstItem.name, tier: firstItem.tier, price: firstItem.final_price },
    addon_tasks: addonItems.map((t) => ({ name: t.name, tier: t.tier, price: t.final_price })),
    task_list: taskLineItems,
    customer_subtotal: customerSubtotal,
    total_customer_charge: totalCustomerCharge,
    cleaner_payout: cleanerPayout,
    platform_fee: platformFee,
    stripe_fee_estimate: stripeFeeEstimate,
    quote_generated_at: new Date().toISOString(),
  }
}
