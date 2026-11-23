// Prices a Standard / Deep Cleaning selection for one Tidy Pro.
//
//   Entire home:  base take-home × home-size multiplier
//   A room:       base take-home × home-size multiplier × room % × quantity
//   An add-on:    add-on take-home × quantity (no multiplier)
//
// Every line is worked out on the Tidy Pro's take-home first and grossed up
// for the customer (÷ 0.8), so their number is never rounded away.
//
// Visit length never comes in here: the price depends only on the Tidy Pro's
// rates, the home's size, and what was chosen.

import { squareFootageMultiplier } from './pricingRules'
import { isSquareFootage, type SquareFootage } from './squareFootage'
import {
  FULL_SERVICE_LABEL,
  customerPriceForTakeHome,
  round2,
  selectedAddOns,
  selectedRooms,
  type AddOnKey,
  type FullServiceSelection,
  type FullServiceType,
  type RoomTypeKey,
} from './fullService'
import { canPerform, type FullServiceRates } from './fullServiceRates'

export type FullServiceLine = {
  kind: 'home' | 'room' | 'addon'
  key: string
  label: string
  quantity: number
  // Room lines: the room's percentage of the base rate.
  percent?: number
  // Add-on lines: the per-unit take-home and customer price.
  unit_take_home?: number
  unit_customer_price?: number
  take_home: number
  customer_price: number
}

export type FullServiceQuote = {
  type: FullServiceType
  square_footage: SquareFootage
  multiplier: number
  lines: FullServiceLine[]
  // Sum of every line's customer price / take-home.
  customer_total: number
  take_home_total: number
  // The rates these lines were priced with, kept on the booking.
  rates_used: {
    base_take_home: number
    room_percents: Record<RoomTypeKey, number>
    add_on_take_home: Partial<Record<AddOnKey, number>>
  }
}

export class FullServiceUnavailableError extends Error {
  constructor(message = 'This Tidy Pro doesn’t offer every part of this cleaning.') {
    super(message)
    this.name = 'FullServiceUnavailableError'
  }
}

export class HomeSizeRequiredError extends Error {
  constructor() {
    super('Please add your home size to see prices and book.')
    this.name = 'HomeSizeRequiredError'
  }
}

export function priceFullService(
  sel: FullServiceSelection,
  rates: FullServiceRates,
  squareFootage: SquareFootage | null | undefined
): FullServiceQuote {
  if (!isSquareFootage(squareFootage)) throw new HomeSizeRequiredError()
  const serviceRates = rates[sel.type]
  if (!serviceRates || !canPerform(rates, sel)) throw new FullServiceUnavailableError()

  const m = squareFootageMultiplier(squareFootage)
  const base = serviceRates.baseTakeHome
  const lines: FullServiceLine[] = []

  if (sel.scope === 'entire_home') {
    const takeHome = round2(base * m)
    lines.push({
      kind: 'home',
      key: 'entire_home',
      label: `${FULL_SERVICE_LABEL[sel.type]}: Entire home`,
      quantity: 1,
      take_home: takeHome,
      customer_price: customerPriceForTakeHome(takeHome),
    })
  } else {
    const rooms = selectedRooms(sel)
    if (rooms.length === 0) throw new FullServiceUnavailableError('Choose at least one room.')
    for (const { room, quantity } of rooms) {
      const percent = serviceRates.roomPercents[room.key]
      const takeHome = round2(base * m * (percent / 100) * quantity)
      lines.push({
        kind: 'room',
        key: room.key,
        label: room.label,
        quantity,
        percent,
        take_home: takeHome,
        customer_price: customerPriceForTakeHome(takeHome),
      })
    }
  }

  const addOnTakeHome: Partial<Record<AddOnKey, number>> = {}
  for (const { addOn, quantity } of selectedAddOns(sel)) {
    const unit = rates.addOns[addOn.key].takeHome
    addOnTakeHome[addOn.key] = unit
    const takeHome = round2(unit * quantity)
    lines.push({
      kind: 'addon',
      key: addOn.key,
      label: addOn.label,
      quantity,
      unit_take_home: unit,
      unit_customer_price: customerPriceForTakeHome(unit),
      take_home: takeHome,
      customer_price: customerPriceForTakeHome(takeHome),
    })
  }

  return {
    type: sel.type,
    square_footage: squareFootage,
    multiplier: m,
    lines,
    customer_total: round2(lines.reduce((sum, l) => sum + l.customer_price, 0)),
    take_home_total: round2(lines.reduce((sum, l) => sum + l.take_home, 0)),
    rates_used: {
      base_take_home: base,
      room_percents: { ...serviceRates.roomPercents },
      add_on_take_home: addOnTakeHome,
    },
  }
}

// What the customer would pay this Tidy Pro, or null when they can't do it.
export function tryPriceFullService(
  sel: FullServiceSelection,
  rates: FullServiceRates,
  squareFootage: SquareFootage | null | undefined
): FullServiceQuote | null {
  try {
    return priceFullService(sel, rates, squareFootage)
  } catch (err) {
    if (err instanceof FullServiceUnavailableError || err instanceof HomeSizeRequiredError) return null
    throw err
  }
}
