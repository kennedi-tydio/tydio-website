import { describe, expect, it } from 'vitest'
import { emptySelection, type FullServiceSelection } from './fullService'
import { resolveRates } from './fullServiceRates'
import { grossUpForStripeFee } from './pricingRules'
import { FullServiceUnavailableError, HomeSizeRequiredError, priceFullService, tryPriceFullService } from './fullServicePricing'

const ratesRow = {
  standard_base_take_home: 200,
  deep_base_take_home: 320,
  standard_room_percents: { full_bath: 25 },
  deep_room_percents: {},
  add_ons: { inside_oven: { enabled: true, take_home: 40 }, inside_freezer: { enabled: false, take_home: null } },
}
const rates = resolveRates(ratesRow)

const rooms = (r: FullServiceSelection['rooms'], extra: Partial<FullServiceSelection> = {}): FullServiceSelection => ({
  ...emptySelection('standard'),
  scope: 'rooms',
  rooms: r,
  ...extra,
})

describe('priceFullService: entire home', () => {
  it.each([
    ['under_1000', 200, 250],
    ['1000_1999', 220, 275],
    ['2000_2999', 240, 300],
    ['3000_plus', 260, 325],
  ] as const)('%s: base × multiplier', (sqft, takeHome, customer) => {
    const quote = priceFullService(emptySelection('standard'), rates, sqft)
    expect(quote.lines).toHaveLength(1)
    expect(quote.take_home_total).toBe(takeHome)
    expect(quote.customer_total).toBe(customer)
  })

  it('uses the Deep base for Deep Cleaning', () => {
    expect(priceFullService(emptySelection('deep'), rates, 'under_1000').take_home_total).toBe(320)
  })

  // A Tidy Pro at $300 Deep, 1,000-1,999 sqft: $300 × 1.1 = $330 take-home,
  // ÷ 0.8 = $412.50, plus the US card fee ($412.50 + $0.30) ÷ 0.971 = $425.13.
  it('Deep $300, 1,000-1,999 sqft: $412.50 before the card fee, $425.13 charged', () => {
    const quote = priceFullService(emptySelection('deep'), resolveRates({ ...ratesRow, deep_base_take_home: 300 }), '1000_1999')
    expect(quote.take_home_total).toBe(330)
    expect(quote.customer_total).toBe(412.5)
    expect(grossUpForStripeFee(quote.customer_total)).toBe(425.13)
  })
})

describe('priceFullService: rooms', () => {
  it('prices each room as base × multiplier × room % × quantity', () => {
    // Base $200, 1,500 sq ft (×1.1): kitchen 30% = $66, bathroom 25% (the
    // Tidy Pro's own) = $55, two bedrooms at 15% = $66.
    const quote = priceFullService(rooms({ kitchen: 1, full_bath: 1, bedroom: 2 }), rates, '1000_1999')
    expect(quote.lines.map((l) => [l.key, l.percent, l.take_home, l.customer_price])).toEqual([
      ['kitchen', 30, 66, 82.5],
      ['full_bath', 25, 55, 68.75],
      ['bedroom', 15, 66, 82.5],
    ])
    expect(quote.take_home_total).toBe(187)
    expect(quote.customer_total).toBe(233.75)
    expect(quote.rates_used.room_percents.full_bath).toBe(25)
  })

  it('needs at least one room', () => {
    expect(() => priceFullService(rooms({}), rates, 'under_1000')).toThrow(FullServiceUnavailableError)
  })
})

describe('priceFullService: add-ons', () => {
  it('are flat per unit and never scaled by home size', () => {
    const sel: FullServiceSelection = { ...emptySelection('standard'), addOns: { inside_oven: 2, inside_cabinets: 10 } }
    const small = priceFullService(sel, rates, 'under_1000')
    const big = priceFullService(sel, rates, '3000_plus')
    const addOnLines = (q: typeof small) => q.lines.filter((l) => l.kind === 'addon').map((l) => [l.key, l.take_home, l.customer_price])
    // Oven at the Tidy Pro's $40 take-home ($50 to the customer); cabinets at the
    // default $6.40 take-home ($8 to the customer).
    expect(addOnLines(small)).toEqual([
      ['inside_oven', 80, 100],
      ['inside_cabinets', 64, 80],
    ])
    expect(addOnLines(big)).toEqual(addOnLines(small))
  })

  it('throws when the Tidy Pro doesn’t offer a chosen add-on', () => {
    const sel: FullServiceSelection = { ...emptySelection('standard'), addOns: { inside_freezer: 1 } }
    expect(() => priceFullService(sel, rates, 'under_1000')).toThrow(FullServiceUnavailableError)
    expect(tryPriceFullService(sel, rates, 'under_1000')).toBeNull()
  })
})

describe('priceFullService: requirements', () => {
  it('needs a home size', () => {
    expect(() => priceFullService(emptySelection('standard'), rates, null)).toThrow(HomeSizeRequiredError)
  })

  it('throws when the Tidy Pro hasn’t priced the service', () => {
    const unpriced = resolveRates({ ...{ standard_room_percents: {}, deep_room_percents: {}, add_ons: {} }, standard_base_take_home: null, deep_base_take_home: null })
    expect(() => priceFullService(emptySelection('standard'), unpriced, 'under_1000')).toThrow(FullServiceUnavailableError)
  })

  it('totals are the sums of the lines', () => {
    const sel = rooms({ kitchen: 1, bedroom: 3, hallway: 1 }, { addOns: { inside_drawers: 7 } })
    const quote = priceFullService(sel, rates, '2000_2999')
    const sum = (k: 'take_home' | 'customer_price') => Math.round(quote.lines.reduce((s, l) => s + l[k], 0) * 100) / 100
    expect(quote.take_home_total).toBe(sum('take_home'))
    expect(quote.customer_total).toBe(sum('customer_price'))
  })
})
