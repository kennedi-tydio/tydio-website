import type { SquareFootage } from './squareFootage'

export const PRICING_VERSION = 'v5-square-footage'

export const CLEANER_PAYOUT_RATE = 0.80
export const PLATFORM_FEE_RATE = 0.20

// No service fee in MVP v1
// Tips pass 100% to cleaner on top of 80% payout

// Stripe's standard US card processing rate — passed through to the
// customer rather than absorbed by the platform or the cleaner, on both the
// booking charge and tip charges. Measured against real test charges rather
// than assumed; re-verify against Dashboard > Settings > Pricing if this
// account ever moves to a negotiated rate.
export const STRIPE_PERCENTAGE_FEE = 0.029
export const STRIPE_FIXED_FEE = 0.30
// What Stripe charges for a card issued outside the US (measured the same way).
export const STRIPE_INTERNATIONAL_PERCENTAGE_FEE = 0.044

// An unknown country gets the standard rate.
export function stripePercentageForCardCountry(country: string | null | undefined): number {
  return country && country !== 'US' ? STRIPE_INTERNATIONAL_PERCENTAGE_FEE : STRIPE_PERCENTAGE_FEE
}

// Grosses up `netAmount` so that, after Stripe deducts its processing fee
// from the resulting charge, the platform/cleaner still nets exactly
// `netAmount` — i.e. solves `charge - (charge * rate + fixed) = netAmount`
// for `charge`. Used for both the booking total and tip charges so neither
// the platform's margin nor the cleaner's payout/tip is diminished by card
// processing costs.
export function grossUpForStripeFee(netAmount: number, percentage: number = STRIPE_PERCENTAGE_FEE): number {
  return Math.round(((netAmount + STRIPE_FIXED_FEE) / (1 - percentage)) * 100) / 100
}

// The inverse of grossUpForStripeFee: what a charge was before Stripe's fee
// was added on top. Can be a cent off the original, so callers showing both
// halves should derive the fee as `charge - net` to keep the sum exact.
export function netOfStripeFee(charge: number, percentage: number = STRIPE_PERCENTAGE_FEE): number {
  return Math.max(0, Math.round((charge * (1 - percentage) - STRIPE_FIXED_FEE) * 100) / 100)
}

export const TIER_ORDER =['Tiny', 'Quick', 'Standard', 'Heavy'] as const
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
// Anything under 5 minutes (but not negative) clamps to Tiny; 30+ minutes or
// a negative/missing estimate is invalid (must be rejected, or split into
// smaller tasks) and returns null. Negative input is what callers pass to
// mean "the AI never produced an estimate for this task" — it must not
// silently resolve to Tiny, or an unestimated task gets priced as if it were
// a confident 7-minute estimate instead of being flagged as unpriceable.
export function tierFromEstimatedMinutes(minutes: number): Tier | null {
  if (minutes < 0) return null
  if (minutes < 10) return 'Tiny'
  if (minutes < 15) return 'Quick'
  if (minutes < 25) return 'Standard'
  if (minutes < 30) return 'Heavy'
  return null
}

// Denominator for the base-price ratio: a 4-hour (240 minute) full clean is
// priced at exactly the admin-configured state median.
export const BASE_PRICE_DIVISOR_MINUTES = 240

// Per-task cleaning-type surcharge, keyed by that task's dirt level. Only
// Light touch-ups carry no surcharge; Standard is +$5 and Heavy (deep
// cleaning) is +$10.
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

// Added per cleaner when they're farther than this many miles away (but
// still within the search radius) — applied the same way as the Top Tidy Pro
// surcharge, downstream of calculatePrice.
export const FAR_DISTANCE_SURCHARGE_MILES = 5
export const FAR_DISTANCE_SURCHARGE = 5

// Scales the whole task price (base + cleaning-type + additional-issue
// surcharges) by the size of the home being cleaned. Per-cleaner surcharges
// and the card fee are added on afterwards and aren't scaled.
export const SQUARE_FOOTAGE_MULTIPLIER: Record<SquareFootage, number> = {
  under_1000: 1.0,
  '1000_1999': 1.1,
  '2000_2999': 1.2,
  '3000_plus': 1.3,
}

// Unknown size (current-location bookings, or an address saved before square
// footage was required) prices at the base rate.
export function squareFootageMultiplier(squareFootage: SquareFootage | null | undefined): number {
  return squareFootage ? SQUARE_FOOTAGE_MULTIPLIER[squareFootage] : 1
}

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
  square_footage: SquareFootage | null
  square_footage_multiplier: number
  // What the multiplier added on top of the three amounts above.
  square_footage_adjustment: number
  // (base_price + cleaning_type_surcharge + additional_issue_surcharge) * square_footage_multiplier.
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
// for cleaning type (dirt level) and additional issues, all scaled by the
// home's square footage multiplier. This is the sole,
// backend-only price computation — it never accepts a total from the
// frontend or an AI response, only the raw task list and the DB-sourced
// median price.
export function calculatePrice(
  tasks: ValidatedTask[],
  state: string,
  medianFourHourPrice: number,
  squareFootage: SquareFootage | null = null
): PricingBreakdown {
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
  const multiplier = squareFootageMultiplier(squareFootage)
  const totalCustomerCharge = round2((basePrice + cleaningTypeSurcharge + additionalIssueSurcharge) * multiplier)

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
    square_footage: squareFootage,
    square_footage_multiplier: multiplier,
    square_footage_adjustment: round2(totalCustomerCharge - round2(basePrice) - cleaningTypeSurcharge - additionalIssueSurcharge),
    total_customer_charge: totalCustomerCharge,
    cleaner_payout: cleanerPayout,
    platform_fee: platformFee,
    task_list: taskLineItems,
    calculated_at: new Date().toISOString(),
  }
}

// What a booking costs with this cleaner, before Stripe's fee: the task price plus
// their per-cleaner surcharges.
export function servicePriceForCleaner(
  taskPrice: number,
  cleaner: { isTopTidyPro: boolean; distanceMiles: number | null }
): number {
  return (
    taskPrice +
    (cleaner.isTopTidyPro ? TOP_TIDY_PRO_SURCHARGE : 0) +
    (cleaner.distanceMiles != null && cleaner.distanceMiles > FAR_DISTANCE_SURCHARGE_MILES ? FAR_DISTANCE_SURCHARGE : 0)
  )
}

// A cleaner earns 80% of the total the customer pays for the booking, including
// surcharges and the card processing fee. Tips are separate and go to them in full.
export function cleanerPayoutForTotal(totalCustomerCharge: number): number {
  return round2(totalCustomerCharge * CLEANER_PAYOUT_RATE)
}

// Stripe keeps its fee on a refund, so it's nonrefundable and disclosed as such on the
// payment page. Everything else the customer paid comes back.
export function stripeProcessingFee(totalCharge: number, percentage: number = STRIPE_PERCENTAGE_FEE): number {
  return round2(totalCharge * percentage + STRIPE_FIXED_FEE)
}

export function refundableAmount(totalCharge: number, percentage: number = STRIPE_PERCENTAGE_FEE): number {
  return round2(totalCharge - stripeProcessingFee(totalCharge, percentage))
}
