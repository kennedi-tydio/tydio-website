export const PRICING_VERSION = 'v4-state'

export const CLEANER_PAYOUT_RATE = 0.80
export const PLATFORM_FEE_RATE = 0.20

// No service fee in MVP v1
// Tips pass 100% to cleaner on top of 80% payout

export const TIER_ORDER = ['Tiny', 'Quick', 'Standard', 'Heavy'] as const
export type Tier = (typeof TIER_ORDER)[number]

// Cosmetic display minutes for line items that don't come from an AI
// estimate (dishwashing/laundry have fixed tiers, not estimated ones).
export const TIER_MINUTE_MIDPOINTS: Record<Tier, number> = {
  Tiny: 7,
  Quick: 12,
  Standard: 20,
  Heavy: 27,
}

// Maps an AI-estimated task duration to a price tier. Boundaries match the
// tier table above (Tiny 5-10, Quick 10-15, Standard 15-25, Heavy 25-30).
// Anything under 5 minutes clamps to Tiny; 30+ minutes is invalid (must be
// rejected or split into smaller tasks) and returns null.
export function tierFromEstimatedMinutes(minutes: number): Tier | null {
  if (minutes < 10) return 'Tiny'
  if (minutes < 15) return 'Quick'
  if (minutes < 25) return 'Standard'
  if (minutes < 30) return 'Heavy'
  return null
}

// Denominator for the base-price ratio: a 4-hour (240 minute) full clean is
// priced at exactly the admin-configured state median.
export const BASE_PRICE_DIVISOR_MINUTES = 240

// Per-task cleaning-type surcharge, keyed by that task's dirt level.
export const CLEANING_TYPE_SURCHARGE: Record<'light' | 'standard' | 'heavy', number> = {
  light: 0,
  standard: 5,
  heavy: 10,
}

// Flat surcharge added per selected "additional issue" (pet mess, mold,
// hard water stains, etc.) on a task.
export const ADDITIONAL_ISSUE_SURCHARGE_PER_ITEM = 10

// Added per cleaner (not per booking) when that cleaner is a Top Tidy Pro —
// applied downstream of calculatePrice, once cleaner search results are
// known, not inside this module.
export const TOP_TIDY_PRO_SURCHARGE = 5

export interface ValidatedTask {
  normalized_task_name: string
  tier: string
  estimated_minutes: number
  // False for tasks whose tier is fixed by task type (dishwashing, laundry)
  // rather than an actual AI time estimate — `estimated_minutes` on those is
  // just the tier's midpoint, not a real duration, so it shouldn't be shown
  // to the customer as one.
  has_estimated_duration?: boolean
  cleaning_type_surcharge: number
  additional_issue_surcharge: number
  unusual_notes?: string
}

export interface TaskLineItem {
  name: string
  tier: string
  estimated_minutes: number
  has_estimated_duration: boolean
  cleaning_type_surcharge: number
  additional_issue_surcharge: number
  unusual_notes?: string
}

export interface PricingBreakdown {
  pricing_version: string
  state: string
  median_four_hour_price: number
  total_task_minutes: number
  base_price: number
  cleaning_type_surcharge: number
  additional_issue_surcharge: number
  // base_price + cleaning_type_surcharge + additional_issue_surcharge.
  // Does NOT include the Top Tidy Pro surcharge — that's per-cleaner and
  // applied by the caller once cleaner search results are known.
  total_customer_charge: number
  cleaner_payout: number
  platform_fee: number
  task_list: TaskLineItem[]
  calculated_at: string
}

// Structured pricing context an AI service may be given to estimate/validate
// task durations. The AI may populate totalTaskMinutes; it must never
// determine or override medianFourHourBookingPrice — that value always comes
// from the administrator-configured state_pricing record in the database.
export interface AIPricingContext {
  serviceState: string
  totalTaskMinutes: number
  medianFourHourBookingPrice: number
  cleaningType: 'standard' | 'deep'
  additionalIssues: string[]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// Prices a booking directly off the administrator-configured state median for
// a 4-hour clean, scaled by total task effort, plus flat per-task surcharges
// for cleaning type (dirt level) and additional issues. This is the sole,
// backend-only price computation — it never accepts a total from the
// frontend or an AI response, only the raw task list and the DB-sourced
// median price.
export function calculatePrice(tasks: ValidatedTask[], state: string, medianFourHourPrice: number): PricingBreakdown {
  if (tasks.length === 0) {
    throw new Error('At least one task is required')
  }

  const taskLineItems: TaskLineItem[] = tasks.map((task) => ({
    name: task.normalized_task_name,
    tier: task.tier,
    estimated_minutes: task.estimated_minutes,
    has_estimated_duration: task.has_estimated_duration ?? true,
    cleaning_type_surcharge: task.cleaning_type_surcharge,
    additional_issue_surcharge: task.additional_issue_surcharge,
    unusual_notes: task.unusual_notes,
  }))

  const totalTaskMinutes = taskLineItems.reduce((sum, t) => sum + t.estimated_minutes, 0)
  const cleaningTypeSurcharge = taskLineItems.reduce((sum, t) => sum + t.cleaning_type_surcharge, 0)
  const additionalIssueSurcharge = taskLineItems.reduce((sum, t) => sum + t.additional_issue_surcharge, 0)

  const basePrice = (totalTaskMinutes / BASE_PRICE_DIVISOR_MINUTES) * medianFourHourPrice
  const totalCustomerCharge = round2(basePrice + cleaningTypeSurcharge + additionalIssueSurcharge)

  const cleanerPayout = round2(totalCustomerCharge * CLEANER_PAYOUT_RATE)
  const platformFee = round2(totalCustomerCharge * PLATFORM_FEE_RATE)

  return {
    pricing_version: PRICING_VERSION,
    state,
    median_four_hour_price: medianFourHourPrice,
    total_task_minutes: totalTaskMinutes,
    base_price: round2(basePrice),
    cleaning_type_surcharge: cleaningTypeSurcharge,
    additional_issue_surcharge: additionalIssueSurcharge,
    total_customer_charge: totalCustomerCharge,
    cleaner_payout: cleanerPayout,
    platform_fee: platformFee,
    task_list: taskLineItems,
    calculated_at: new Date().toISOString(),
  }
}
