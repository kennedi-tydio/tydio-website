// A booking's price when it can include Standard / Deep Cleaning as well as
// Tidy Tasks.
//
//   Tidy Tasks:       the existing task engine (state median × minutes,
//                     surcharges, home-size multiplier on floor and Entire
//                     home tasks), unchanged.
//   Full service:     the chosen Tidy Pro's own rates (lib/fullServicePricing).
//   Booking price:    the two added together. Top Tidy Pro / distance
//                     surcharges and the card fee are added on top by the
//                     callers, once per booking, as before.
//
// The Tidy Pro earns exactly 80% of the Service Price (ICA Section 6), so
// cleaner_payout is 80% of the combined total. Their full-service take-home
// can be a cent off the number they entered, from rounding.
//
// Visit length never changes the price: full-service minutes only go into
// total_task_minutes, after the price is worked out.

import {
  CLEANER_PAYOUT_RATE,
  PLATFORM_FEE_RATE,
  PRICING_VERSION,
  squareFootageMultiplier,
  type PricingBreakdown,
} from './pricingRules'
import { priceTaskListForState, visitDurationMinutes } from '@/app/dashboard/taskPricing'
import type { TidyTask } from '@/app/dashboard/types'
import type { SquareFootage } from './squareFootage'
import { round2 } from './fullService'
import type { FullServiceQuote } from './fullServicePricing'

// The Tidy Tasks part. A booking with only Standard / Deep Cleaning has no
// tasks, which prices at zero rather than throwing like calculatePrice.
export function priceTasksPart(
  tasks: TidyTask[],
  state: string,
  medianFourHourPrice: number,
  squareFootage: SquareFootage | null
): PricingBreakdown {
  if (tasks.length > 0) return priceTaskListForState(tasks, state, medianFourHourPrice, squareFootage)
  return {
    pricing_version: PRICING_VERSION,
    state,
    median_four_hour_price: medianFourHourPrice,
    total_task_minutes: 0,
    base_price: 0,
    cleaning_type_surcharge: 0,
    additional_issue_surcharge: 0,
    square_footage: squareFootage,
    square_footage_multiplier: squareFootageMultiplier(squareFootage),
    square_footage_adjustment: 0,
    flat_price_total: 0,
    total_customer_charge: 0,
    cleaner_payout: 0,
    platform_fee: 0,
    task_list: [],
    calculated_at: new Date().toISOString(),
  }
}

// Adds one Tidy Pro's full-service quote to the tasks part. With no quote the
// tasks part comes back unchanged, so Tidy-Task-only bookings price exactly as
// before.
export function combineWithFullService(
  taskPart: PricingBreakdown,
  quote: FullServiceQuote | null,
  durationMinutes?: number
): PricingBreakdown {
  const withDuration = durationMinutes == null ? taskPart : { ...taskPart, total_task_minutes: durationMinutes }
  if (!quote) return withDuration
  const total = round2(taskPart.total_customer_charge + quote.customer_total)
  return {
    ...withDuration,
    task_subtotal: taskPart.total_customer_charge,
    full_service_type: quote.type,
    full_service_customer_total: quote.customer_total,
    full_service_take_home_total: quote.take_home_total,
    total_customer_charge: total,
    cleaner_payout: round2(total * CLEANER_PAYOUT_RATE),
    platform_fee: round2(total * PLATFORM_FEE_RATE),
  }
}

// How long the visit is reserved for: the Tidy Tasks' time (laundry
// overlapping household work, as before) plus the cleaning's estimated time
// (lib/aiFullServiceEstimate), which counts as household time.
export function bookingDurationMinutes(
  tasks: TidyTask[],
  squareFootage: SquareFootage | null,
  fullServiceMinutes: number
): number {
  return visitDurationMinutes(tasks, squareFootage, fullServiceMinutes)
}
