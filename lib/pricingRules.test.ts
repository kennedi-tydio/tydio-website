import { describe, expect, it } from 'vitest'
import {
  BASE_PRICE_DIVISOR_MINUTES,
  CLEANING_TYPE_SURCHARGE,
  TOP_TIDY_PRO_SURCHARGE,
  calculatePrice,
  type ValidatedTask,
} from './pricingRules'

function task(overrides: Partial<ValidatedTask> = {}): ValidatedTask {
  return {
    normalized_task_name: 'Vacuum the rug',
    tier: 'Standard',
    estimated_minutes: 20,
    cleaning_type_surcharge: 0,
    additional_issue_surcharge: 0,
    ...overrides,
  }
}

describe('calculatePrice', () => {
  it('anchors base price to totalTaskMinutes / 240 * medianFourHourPrice', () => {
    // 240 minutes of tasks at a $200 median clean = exactly the median.
    const breakdown = calculatePrice([task({ estimated_minutes: 240 })], 'GA', 200)
    expect(breakdown.total_task_minutes).toBe(240)
    expect(breakdown.base_price).toBe(200)
    expect(breakdown.total_customer_charge).toBe(200)
    expect(breakdown.state).toBe('GA')
  })

  it('scales down for partial effort relative to a 4-hour clean', () => {
    // 120 minutes = half of BASE_PRICE_DIVISOR_MINUTES
    const breakdown = calculatePrice([task({ estimated_minutes: 120 })], 'GA', 200)
    expect(BASE_PRICE_DIVISOR_MINUTES).toBe(240)
    expect(breakdown.base_price).toBe(100)
  })

  it('does not cap the price when task effort exceeds 4 hours', () => {
    const breakdown = calculatePrice([task({ estimated_minutes: 480 })], 'GA', 200)
    expect(breakdown.base_price).toBe(400)
  })

  it('sums cleaning-type and additional-issue surcharges across tasks on top of base price', () => {
    const tasks = [
      task({ estimated_minutes: 60, cleaning_type_surcharge: CLEANING_TYPE_SURCHARGE.heavy, additional_issue_surcharge: 20 }),
      task({ estimated_minutes: 60, cleaning_type_surcharge: CLEANING_TYPE_SURCHARGE.standard, additional_issue_surcharge: 0 }),
    ]
    const breakdown = calculatePrice(tasks, 'GA', 240)
    // base = (120/240)*240 = 120
    expect(breakdown.base_price).toBe(120)
    expect(breakdown.cleaning_type_surcharge).toBe(15) // 10 + 5
    expect(breakdown.additional_issue_surcharge).toBe(20)
    expect(breakdown.total_customer_charge).toBe(155)
  })

  it('never includes the Top Tidy Pro surcharge — that is applied by the caller per cleaner', () => {
    const breakdown = calculatePrice([task({ estimated_minutes: 240 })], 'GA', 200)
    expect(breakdown.total_customer_charge).toBe(200)
    expect(TOP_TIDY_PRO_SURCHARGE).toBe(5)
    // simulate the per-cleaner step performed downstream
    const priceForTopPro = breakdown.total_customer_charge + TOP_TIDY_PRO_SURCHARGE
    expect(priceForTopPro).toBe(205)
  })

  it('applies no minimum-price floor', () => {
    const breakdown = calculatePrice([task({ estimated_minutes: 5 })], 'GA', 200)
    expect(breakdown.base_price).toBeCloseTo((5 / 240) * 200, 2)
    expect(breakdown.base_price).toBeLessThan(39) // old MINIMUM_BOOKING_PRICE no longer applies
  })

  it('throws when there are no tasks', () => {
    expect(() => calculatePrice([], 'GA', 200)).toThrow()
  })
})
