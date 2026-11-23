import { describe, expect, it } from 'vitest'
import {
  ADD_ONS,
  FULL_SERVICE_PAYOUT_RATE,
  customerPriceForTakeHome,
  defaultTakeHome,
  emptySelection,
  fullServiceChecklistRows,
  roomPercentForPrice,
  roomPriceForPercent,
  isCompleteSelection,
  normalizeFullServiceSelection,
  selectionLabel,
} from './fullService'
import { CLEANER_PAYOUT_RATE } from './pricingRules'

describe('normalizeFullServiceSelection', () => {
  it('rejects anything without a known service type', () => {
    expect(normalizeFullServiceSelection(null)).toBeNull()
    expect(normalizeFullServiceSelection({ type: 'platinum' })).toBeNull()
  })

  it('drops unknown keys and zero quantities, clamps and floors quantities', () => {
    const sel = normalizeFullServiceSelection({
      type: 'standard',
      scope: 'rooms',
      rooms: { kitchen: 1, bedroom: 2.7, full_bath: 99, garage: 3, dining_room: 0, hallway: -2 },
      addOns: { inside_oven: 1, inside_cabinets: 500, made_up: 4 },
      priorities: ['floors', 'dusting', 'floors', 'nope'],
      step: 'add-ons',
    })
    expect(sel).toEqual({
      version: 1,
      type: 'standard',
      scope: 'rooms',
      rooms: { kitchen: 1, full_bath: 10, bedroom: 2 },
      addOns: { inside_oven: 1, inside_cabinets: 40 },
      priorities: ['dusting', 'floors'],
      step: 'add-ons',
    })
  })

  it('removes Standard-only add-ons from Deep Cleaning (they are included)', () => {
    const sel = normalizeFullServiceSelection({
      type: 'deep',
      scope: 'entire_home',
      addOns: { detailed_baseboards: 3, detailed_blinds: 2, inside_fridge: 1 },
    })
    expect(sel?.addOns).toEqual({ inside_fridge: 1 })
  })

  it('ignores rooms for an entire-home cleaning', () => {
    const sel = normalizeFullServiceSelection({ type: 'standard', scope: 'entire_home', rooms: { kitchen: 2 } })
    expect(sel?.rooms).toEqual({})
  })

  it('strips a client-sent estimate unless reading back from the database', () => {
    const raw = { type: 'standard', estimate: { minutes: 5, source: 'ai', inputHash: 'x', at: '2026-01-01' } }
    expect(normalizeFullServiceSelection(raw)?.estimate).toBeUndefined()
    expect(normalizeFullServiceSelection(raw, { keepEstimate: true })?.estimate?.minutes).toBe(5)
  })
})

describe('isCompleteSelection', () => {
  it('needs the entire home or at least one room', () => {
    expect(isCompleteSelection(emptySelection('standard'))).toBe(true)
    expect(isCompleteSelection({ ...emptySelection('deep'), scope: 'rooms' })).toBe(false)
    expect(isCompleteSelection({ ...emptySelection('deep'), scope: 'rooms', rooms: { kitchen: 1 } })).toBe(true)
    expect(isCompleteSelection(null)).toBe(false)
  })
})

describe('take-home and customer price', () => {
  it('uses the same 80% as the rest of pricing', () => {
    expect(FULL_SERVICE_PAYOUT_RATE).toBe(CLEANER_PAYOUT_RATE)
  })

  it('grosses take-home up by Tydio’s 20%', () => {
    expect(customerPriceForTakeHome(200)).toBe(250)
    expect(customerPriceForTakeHome(160)).toBe(200)
    expect(customerPriceForTakeHome(66)).toBe(82.5)
  })

  it('round-trips every catalog add-on’s default price', () => {
    for (const a of ADD_ONS) expect(customerPriceForTakeHome(defaultTakeHome(a.defaultCustomerPrice))).toBe(a.defaultCustomerPrice)
  })
})

describe('selectionLabel', () => {
  it('names the service and what is being cleaned', () => {
    expect(selectionLabel(emptySelection('standard'))).toBe('Standard Cleaning · Entire home')
    expect(
      selectionLabel({ ...emptySelection('deep'), scope: 'rooms', rooms: { kitchen: 1, full_bath: 2 } })
    ).toBe('Deep Cleaning · 1 kitchen, 2 full bathrooms')
  })
})

describe('fullServiceChecklistRows', () => {
  it('makes one row per room and splits the line price exactly', () => {
    const rows = fullServiceChecklistRows('standard', [
      { kind: 'room', key: 'bedroom', label: 'Bedroom', quantity: 3, customer_price: 100 },
      { kind: 'addon', key: 'inside_oven', label: 'Inside oven', quantity: 2, customer_price: 90 },
    ])
    expect(rows.map((r) => r.name)).toEqual(['Bedroom 1 of 3', 'Bedroom 2 of 3', 'Bedroom 3 of 3', 'Inside oven ×2'])
    expect(rows.slice(0, 3).map((r) => r.servicePrice)).toEqual([33.33, 33.33, 33.34])
    expect(rows[3]).toMatchObject({ kind: 'full_service_addon', servicePrice: 90, category: 'Standard Cleaning' })
  })

  it('makes a single row for the entire home', () => {
    const rows = fullServiceChecklistRows('deep', [
      { kind: 'home', key: 'entire_home', label: 'Deep Cleaning: Entire home', quantity: 1, customer_price: 300 },
    ])
    expect(rows).toEqual([{ name: 'Deep Cleaning: Entire home', category: 'Deep Cleaning', kind: 'full_service_home', servicePrice: 300 }])
  })
})

describe('room prices in dollars', () => {
  it('round-trips a typed price through the stored percentage to the cent', () => {
    for (const base of [20, 99.99, 160, 237.5, 2000]) {
      for (const price of [0.5, 1, 13.37, 33.33, 50, 99.99]) {
        if (price > base) continue
        expect(roomPriceForPercent(base, roomPercentForPrice(base, price))).toBe(price)
      }
    }
  })

  it('moves room prices with the whole-home price', () => {
    const pct = roomPercentForPrice(160, 50)
    expect(pct).toBe(31.25)
    expect(roomPriceForPercent(200, pct)).toBe(62.5)
  })
})
