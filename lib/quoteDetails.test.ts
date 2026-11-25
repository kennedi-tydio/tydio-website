import { describe, expect, it } from 'vitest'
import { buildQuoteDetails, quoteDetailRows } from './quoteDetails'
import type { PricingBreakdown } from './pricingRules'

const breakdown = {
  state: 'GA',
  median_four_hour_price: 160,
  square_footage_multiplier: 1.15,
  base_price: 40,
  cleaning_type_surcharge: 3,
  additional_issue_surcharge: 2,
  square_footage_adjustment: 6.75,
  flat_price_total: 0,
  total_customer_charge: 51.75,
  task_list: [
    {
      name: 'Mop floor',
      tier: 'Standard',
      estimated_minutes: 20,
      has_estimated_duration: true,
      cleaning_type_surcharge: 3,
      additional_issue_surcharge: 2,
      unusual_notes: 'Sticky spots',
    },
  ],
} as unknown as PricingBreakdown

function rowsFor(details: ReturnType<typeof buildQuoteDetails>): Record<string, string[]> {
  return Object.fromEntries(quoteDetailRows(details))
}

describe('buildQuoteDetails', () => {
  it('keeps every input to the price on the review page', () => {
    const rows = rowsFor(
      buildQuoteDetails({
        tasks: [],
        fullService: { version: 1, type: 'deep', scope: 'entire_home', rooms: {}, addOns: { inside_oven: 2 }, priorities: [], step: 'notes' },
        fullServiceQuote: {
          multiplier: 1.15,
          customer_total: 290,
          lines: [
            { kind: 'home', key: 'home', label: 'Entire home', quantity: 1, take_home: 0, customer_price: 200 },
            { kind: 'addon', key: 'inside_oven', label: 'Inside oven', quantity: 2, take_home: 0, customer_price: 90 },
          ],
        },
        breakdown: { ...breakdown, task_subtotal: 51.75 },
        squareFootage: '2000_2999',
        date: '2026-11-20',
        time: '09:00',
        chosen: {
          name: 'Sam Pro',
          isTopTidyPro: true,
          distanceMiles: 12.34,
          servicePrice: 351.75,
          promoDiscount: 20,
          cardPercentage: 0.029,
          processingFee: 10.02,
          totalPrice: 343.76,
        },
      })
    )
    expect(rows['Add-ons']).toEqual(['Inside oven (2 ovens)'])
    expect(rows['Tidy Task pricing']).toContain('State rate: GA · 4-hour median $160.00')
    expect(rows['Tidy Task pricing']).toContain(
      'Mop floor · Standard tier · 20 min · cleaning type +$3.00 · additional issues +$2.00 · (Sticky spots)'
    )
    expect(rows['Cleaning pricing (chosen Tidy Pro’s rates)']).toEqual([
      'Home-size multiplier: ×1.15',
      'Deep Cleaning base: $200.00',
      'Inside oven × 2: $90.00',
      'Cleaning subtotal: $290.00',
    ])
    expect(rows['Price with Sam Pro']).toEqual([
      'Tidy Tasks $51.75',
      'Cleaning $290.00',
      'Top Tidy Pro +$5.00',
      '12.3 mi away +$10.00',
      'Service price: $351.75',
      'Promo discount −$20.00',
      'Trust & Support fee $1.99',
      'Card processing fee $10.02 (2.9% + 30¢ card rate)',
      'Total shown: $343.76',
    ])
  })

  it('lists each Tidy Pro offered with their surcharges', () => {
    const rows = rowsFor(
      buildQuoteDetails({
        tasks: [],
        fullService: null,
        breakdown,
        squareFootage: 'under_1000',
        date: null,
        time: null,
        offers: [{ name: 'Ana', isTopTidyPro: false, distanceMiles: 3, price: 51.75 }],
      })
    )
    expect(rows['Tidy Pros offered']).toEqual(['Ana: $51.75 · Not a Top Tidy Pro +$0.00 · 3 mi away +$0.00'])
    expect(rows['Dates']).toEqual(['Any day'])
  })
})
