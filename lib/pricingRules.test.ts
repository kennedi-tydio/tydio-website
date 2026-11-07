import { describe, expect, it } from 'vitest'
import {
  lateCancelCleanerPay,
  lateCancelRefund,
  BASE_PRICE_DIVISOR_MINUTES,
  CLEANING_TYPE_SURCHARGE,
  TOP_TIDY_PRO_SURCHARGE,
  distanceSurcharge,
  calculatePrice,
  grossUpForStripeFee,
  netOfStripeFee,
  cleanerPayoutForServicePrice,
  refundableAmount,
  stripePercentageForCardCountry,
  stripeProcessingFee,
  servicePriceForCleaner,
  tierFromEstimatedMinutes,
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
    expect(breakdown.cleaning_type_surcharge).toBe(15) // heavy (10) + standard (5)
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

  it('never includes the distance surcharge — that is also applied by the caller per cleaner', () => {
    const breakdown = calculatePrice([task({ estimated_minutes: 240 })], 'GA', 200)
    expect(breakdown.total_customer_charge).toBe(200)
    expect(servicePriceForCleaner(breakdown.total_customer_charge, { isTopTidyPro: false, distanceMiles: 7.4 })).toBe(205)
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

describe('calculatePrice — square footage multiplier', () => {
  it.each([
    [null, 1, 200],
    ['under_1000', 1, 200],
    ['1000_1999', 1.1, 220],
    ['2000_2999', 1.2, 240],
    ['3000_plus', 1.3, 260],
  ] as const)('%s prices at %sx', (squareFootage, multiplier, total) => {
    const breakdown = calculatePrice([task({ estimated_minutes: 240 })], 'GA', 200, squareFootage)
    expect(breakdown.square_footage_multiplier).toBe(multiplier)
    expect(breakdown.total_customer_charge).toBe(total)
    expect(breakdown.square_footage_adjustment).toBe(total - 200)
  })

  it('scales the surcharges along with the base price, and keeps payout at 80% of the result', () => {
    // $100 base + $5 standard + $10 issue = $115, then x1.2.
    const breakdown = calculatePrice(
      [task({ estimated_minutes: 120, cleaning_type_surcharge: 5, additional_issue_surcharge: 10 })],
      'GA',
      200,
      '2000_2999'
    )
    expect(breakdown.base_price).toBe(100)
    expect(breakdown.total_customer_charge).toBe(138)
    expect(breakdown.square_footage_adjustment).toBe(23)
    expect(breakdown.cleaner_payout).toBe(110.4)
  })
})

describe('tierFromEstimatedMinutes', () => {
  it('clamps low-but-nonnegative estimates to Tiny', () => {
    expect(tierFromEstimatedMinutes(0)).toBe('Tiny')
    expect(tierFromEstimatedMinutes(9)).toBe('Tiny')
  })

  it('maps each documented boundary to the matching tier', () => {
    expect(tierFromEstimatedMinutes(10)).toBe('Quick')
    expect(tierFromEstimatedMinutes(14)).toBe('Quick')
    expect(tierFromEstimatedMinutes(15)).toBe('Standard')
    expect(tierFromEstimatedMinutes(24)).toBe('Standard')
    expect(tierFromEstimatedMinutes(25)).toBe('Heavy')
    expect(tierFromEstimatedMinutes(29)).toBe('Heavy')
  })

  it('rejects 30+ minutes as too long for a Tidy Task', () => {
    expect(tierFromEstimatedMinutes(30)).toBeNull()
    expect(tierFromEstimatedMinutes(45)).toBeNull()
  })

  it('rejects negative minutes rather than clamping to Tiny — callers pass negative as a "no estimate" sentinel', () => {
    expect(tierFromEstimatedMinutes(-1)).toBeNull()
  })
})

describe('cleanerPayoutForServicePrice', () => {
  it('pays 80% of the booking price before Stripe fees', () => {
    expect(cleanerPayoutForServicePrice(36.35)).toBe(29.08)
    expect(cleanerPayoutForServicePrice(100)).toBe(80)
  })

  it('leaves the Stripe fee out of the split', () => {
    const servicePrice = 100
    const charge = grossUpForStripeFee(servicePrice)
    const cleanerPay = cleanerPayoutForServicePrice(servicePrice)
    const tydioKeeps = charge - stripeProcessingFee(charge) - cleanerPay
    expect(cleanerPay).toBe(80)
    expect(Math.abs(tydioKeeps - 20)).toBeLessThanOrEqual(0.01)
  })
})

describe('servicePriceForCleaner', () => {
  it('adds surcharges that apply to this cleaner', () => {
    expect(servicePriceForCleaner(30, { isTopTidyPro: false, distanceMiles: 1 })).toBe(30)
    expect(servicePriceForCleaner(30, { isTopTidyPro: true, distanceMiles: 1 })).toBe(30 + TOP_TIDY_PRO_SURCHARGE)
    expect(servicePriceForCleaner(30, { isTopTidyPro: false, distanceMiles: 6 })).toBe(35)
    expect(servicePriceForCleaner(30, { isTopTidyPro: true, distanceMiles: 19 })).toBe(30 + TOP_TIDY_PRO_SURCHARGE + 15)
    expect(servicePriceForCleaner(30, { isTopTidyPro: false, distanceMiles: null })).toBe(30)
  })
})

describe('distanceSurcharge', () => {
  it.each([
    [0, 0],
    [5, 0],
    [5.1, 5],
    [10, 5],
    [10.1, 10],
    [15, 10],
    [15.1, 15],
    [19, 15],
    [20, 15],
    [20.1, 20],
    [25, 20],
    [25.1, 30],
    [30, 30],
    [42, 30],
  ])('%d miles adds $%d', (miles, expected) => {
    expect(distanceSurcharge(miles)).toBe(expected)
  })

  it('adds nothing when the distance is unknown', () => {
    expect(distanceSurcharge(null)).toBe(0)
    expect(distanceSurcharge(Number.NaN)).toBe(0)
  })
})

describe('refundableAmount', () => {
  it('returns everything except Stripe’s nonrefundable fee', () => {
    expect(stripeProcessingFee(37.74)).toBe(1.39)
    expect(refundableAmount(37.74)).toBe(36.35)
  })

  it('matches the price before the fee was added on', () => {
    expect(refundableAmount(grossUpForStripeFee(36.35))).toBeCloseTo(36.35, 1)
  })
})

describe('fee by card', () => {
  it('uses the standard rate for US cards, and when the country is unknown', () => {
    expect(stripePercentageForCardCountry('US')).toBe(0.029)
    expect(stripePercentageForCardCountry(null)).toBe(0.029)
  })

  it('uses the international rate for cards issued elsewhere', () => {
    expect(stripePercentageForCardCountry('BR')).toBe(0.044)
  })

  it('leaves the same amount after Stripe’s cut, whichever the card', () => {
    const domestic = grossUpForStripeFee(36.35, stripePercentageForCardCountry('US'))
    const international = grossUpForStripeFee(36.35, stripePercentageForCardCountry('BR'))
    expect(domestic).toBe(37.74)
    expect(international).toBe(38.34)
    expect(refundableAmount(international, 0.044)).toBeCloseTo(36.35, 1)
  })
})

describe('netOfStripeFee', () => {
  it('recovers the pre-fee price from a grossed-up charge, to the cent', () => {
    for (const net of [20, 36.35, 7, 112.5]) {
      for (const pct of [stripePercentageForCardCountry('US'), stripePercentageForCardCountry('GB')]) {
        expect(Math.abs(netOfStripeFee(grossUpForStripeFee(net, pct), pct) - net)).toBeLessThanOrEqual(0.01)
      }
    }
  })

  it('never goes below zero', () => {
    expect(netOfStripeFee(0)).toBe(0)
  })
})

describe('late cancellation', () => {
  it('refunds half, and pays the cleaner half their usual pay', () => {
    expect(lateCancelRefund(100)).toBe(50)
    expect(lateCancelCleanerPay(80)).toBe(40)
  })

  it('rounds to the cent', () => {
    expect(lateCancelRefund(37.75)).toBe(18.88)
    expect(lateCancelCleanerPay(29.07)).toBe(14.54)
  })
})
