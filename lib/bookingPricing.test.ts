import { describe, expect, it } from 'vitest'
import { priceTaskListForState } from '@/app/dashboard/taskPricing'
import type { TidyTask } from '@/app/dashboard/types'
import { bookingDurationMinutes, combineWithFullService, priceTasksPart } from './bookingPricing'
import { emptySelection } from './fullService'
import { resolveRates } from './fullServiceRates'
import { priceFullService } from './fullServicePricing'
import { cleanerPayoutForServicePrice, servicePriceForCleaner } from './pricingRules'

function tidyTask(overrides: Partial<TidyTask> = {}): TidyTask {
  return {
    id: 't1',
    name: 'Clean rabbit enclosure',
    notes: '',
    room: 'Kitchen',
    dirtLevel: 'standard',
    unusual: [],
    completed: true,
    estimatedMinutes: 20,
    tier: 'Standard',
    ...overrides,
  }
}

const rates = resolveRates({
  standard_base_take_home: 200,
  deep_base_take_home: null,
  standard_room_percents: {},
  deep_room_percents: {},
  add_ons: {},
})

describe('priceTasksPart', () => {
  it('prices Tidy Tasks exactly as before', () => {
    const tasks = [tidyTask(), tidyTask({ id: 't2', name: 'Sweep the floor', room: 'Bedroom', estimatedMinutes: 15, tier: 'Standard' })]
    const before = priceTaskListForState(tasks, 'GA', 212, '1000_1999')
    const after = priceTasksPart(tasks, 'GA', 212, '1000_1999')
    expect({ ...after, calculated_at: '' }).toEqual({ ...before, calculated_at: '' })
  })

  it('is zero, not an error, with no tasks', () => {
    const part = priceTasksPart([], 'GA', 212, 'under_1000')
    expect(part.total_customer_charge).toBe(0)
    expect(part.task_list).toEqual([])
  })
})

describe('combineWithFullService', () => {
  it('leaves a Tidy-Task-only booking unchanged', () => {
    const part = priceTasksPart([tidyTask()], 'GA', 212, 'under_1000')
    expect(combineWithFullService(part, null)).toEqual(part)
  })

  it('adds the Tidy Pro’s full-service price on top of the Tidy Tasks', () => {
    const part = priceTasksPart([tidyTask()], 'GA', 212, '1000_1999')
    const quote = priceFullService({ ...emptySelection('standard'), scope: 'rooms', rooms: { bedroom: 1, full_bath: 1 } }, rates, '1000_1999')
    const combined = combineWithFullService(part, quote)
    expect(combined.task_subtotal).toBe(part.total_customer_charge)
    expect(combined.full_service_customer_total).toBe(quote.customer_total)
    expect(combined.total_customer_charge).toBe(Math.round((part.total_customer_charge + quote.customer_total) * 100) / 100)
    expect(combined.full_service_type).toBe('standard')
  })

  it('pays the Tidy Pro exactly 80% of the Service Price, surcharges included', () => {
    const quote = priceFullService(emptySelection('standard'), rates, '1000_1999')
    const combined = combineWithFullService(priceTasksPart([], 'GA', 212, '1000_1999'), quote)
    expect(combined.total_customer_charge).toBe(275)
    const servicePrice = servicePriceForCleaner(combined.total_customer_charge, { isTopTidyPro: true, distanceMiles: 8 })
    expect(servicePrice).toBe(285)
    expect(cleanerPayoutForServicePrice(servicePrice)).toBe(228)
    // Their whole-home take-home ($220) plus 80% of the $10 surcharges.
    expect(cleanerPayoutForServicePrice(combined.total_customer_charge)).toBe(quote.take_home_total)
  })

  it('never lets the visit length change the price', () => {
    const quote = priceFullService(emptySelection('standard'), rates, 'under_1000')
    const part = priceTasksPart([tidyTask()], 'GA', 212, 'under_1000')
    const prices = [0, 120, 999].map((minutes) => combineWithFullService(part, quote, minutes).total_customer_charge)
    expect(new Set(prices).size).toBe(1)
    expect(combineWithFullService(part, quote, 180).total_task_minutes).toBe(180)
  })
})

describe('bookingDurationMinutes', () => {
  it('adds the cleaning’s time to the Tidy Tasks’ time', () => {
    const tasks = [tidyTask({ estimatedMinutes: 20 })]
    expect(bookingDurationMinutes(tasks, 'under_1000', 0)).toBe(20)
    expect(bookingDurationMinutes(tasks, 'under_1000', 150)).toBe(170)
    expect(bookingDurationMinutes([], 'under_1000', 150)).toBe(150)
  })

  it('lets a wash & dry run during the cleaning, as it does for household tasks', () => {
    const laundry = tidyTask({ id: 'l1', name: 'Wash & dry', room: 'Laundry', dirtLevel: null, laundryService: 'washDry', laundryBaskets: 1, machineLoads: 1, estimatedMinutes: undefined, tier: undefined })
    // One load's 2-hour cycle overlaps a 3-hour cleaning, so the visit is 3 hours.
    expect(bookingDurationMinutes([laundry], 'under_1000', 180)).toBe(180)
  })
})
