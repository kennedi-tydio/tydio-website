import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/aiTaskEstimate', () => ({ estimateTaskDuration: vi.fn() }))

import { priceTaskAddition, taskAdditionBlockedReason, tasksToAdd } from './bookingTaskAdditions'
import { priceTaskListForState, visitDurationMinutes } from '@/app/dashboard/taskPricing'
import { cleanerPayoutForServicePrice } from '@/lib/pricingRules'
import type { TidyTask } from '@/app/dashboard/types'

function tidyTask(overrides: Partial<TidyTask> = {}): TidyTask {
  return {
    id: 't1',
    name: 'Wipe counters',
    notes: '',
    room: 'Kitchen',
    dirtLevel: 'standard',
    unusual: [],
    completed: false,
    tier: 'Standard',
    estimatedMinutes: 30,
    ...overrides,
  }
}

// 10:00 AM in New York on Nov 20, 2026 (EST, UTC-5) is 15:00 UTC.
const booking = {
  status: 'scheduled',
  tidy_pro_id: 'pro_1',
  progress_status: null,
  scheduled_date: '2026-11-20',
  scheduled_time: '10:00:00',
  time_zone: 'America/New_York',
  suspended_for_upcharge_at: null,
  suspended_for_payment_at: null,
  payment_failed_at: null,
}

describe('taskAdditionBlockedReason', () => {
  it('allows an accepted booking more than 2 hours away', () => {
    expect(taskAdditionBlockedReason(booking, new Date('2026-11-20T12:30:00Z'))).toBeNull()
  })

  it('blocks within 2 hours of the start, and once it has started', () => {
    expect(taskAdditionBlockedReason(booking, new Date('2026-11-20T13:30:00Z'))).toMatch(/2 hours/)
    expect(taskAdditionBlockedReason(booking, new Date('2026-11-20T13:00:00Z'))).toMatch(/2 hours/)
    expect(taskAdditionBlockedReason({ ...booking, progress_status: 'on_the_way' }, new Date('2026-11-20T10:00:00Z'))).not.toBeNull()
  })

  it('blocks requests not yet accepted, and bookings on hold', () => {
    const early = new Date('2026-11-19T12:00:00Z')
    expect(taskAdditionBlockedReason({ ...booking, status: 'pending' }, early)).not.toBeNull()
    expect(taskAdditionBlockedReason({ ...booking, tidy_pro_id: null }, early)).not.toBeNull()
    expect(taskAdditionBlockedReason({ ...booking, suspended_for_upcharge_at: '2026-11-19T00:00:00Z' }, early)).not.toBeNull()
    expect(taskAdditionBlockedReason({ ...booking, payment_failed_at: '2026-11-19T00:00:00Z' }, early)).not.toBeNull()
    expect(taskAdditionBlockedReason({ ...booking, scheduled_time: null }, early)).not.toBeNull()
  })

  it('blocks a booking with a laundromat trip, but not laundry done at home', () => {
    const early = new Date('2026-11-19T12:00:00Z')
    const laundromat = [tidyTask({ id: 'wash', laundryService: 'wash', hasWasherDryer: false })]
    const atHome = [tidyTask({ id: 'wash', laundryService: 'wash', hasWasherDryer: true })]
    expect(taskAdditionBlockedReason({ ...booking, task_list: laundromat }, early)).toMatch(/laundromat/)
    expect(taskAdditionBlockedReason({ ...booking, task_list: atHome }, early)).toBeNull()
  })

  it('also blocks when "I have a washer and dryer" was never checked, but not folding or ironing', () => {
    const early = new Date('2026-11-19T12:00:00Z')
    const unanswered = [tidyTask({ id: 'wash', laundryService: 'washDry', hasWasherDryer: null })]
    const foldOnly = [tidyTask({ id: 'fold', laundryService: 'fold', hasWasherDryer: null })]
    expect(taskAdditionBlockedReason({ ...booking, task_list: unanswered }, early)).toMatch(/laundromat/)
    expect(taskAdditionBlockedReason({ ...booking, task_list: foldOnly }, early)).toBeNull()
  })
})

describe('tasksToAdd', () => {
  it('picks the chosen dashboard tasks, marked to be done', () => {
    const dashboard = [tidyTask({ id: 'a' }), tidyTask({ id: 'b' }), tidyTask({ id: 'c' })]
    const added = tasksToAdd(dashboard, ['a', 'c'], [])
    expect(added.map((t) => t.id)).toEqual(['a', 'c'])
    expect(added.every((t) => t.completed)).toBe(true)
  })

  it('skips tasks already on the booking', () => {
    const added = tasksToAdd([tidyTask({ id: 'a' }), tidyTask({ id: 'b' })], ['a', 'b'], [tidyTask({ id: 'a', completed: true })])
    expect(added.map((t) => t.id)).toEqual(['b'])
  })

  it('keeps a laundry link to a task on the booking, and drops one to a task left behind', () => {
    const onBooking = [tidyTask({ id: 'wash', laundryService: 'wash', sameLaundryAsTaskId: null, completed: true })]
    const dashboard = [
      tidyTask({ id: 'dry', laundryService: 'dry', sameLaundryAsTaskId: 'wash' }),
      tidyTask({ id: 'dry2', laundryService: 'dry', sameLaundryAsTaskId: 'other' }),
    ]
    const added = tasksToAdd(dashboard, ['dry', 'dry2'], onBooking)
    expect(added.find((t) => t.id === 'dry2')?.sameLaundryAsTaskId).toBeNull()
  })
})

describe('priceTaskAddition', () => {
  const pricing = { state: 'GA', medianFourHourPrice: 240, squareFootage: null }

  it('charges what the added tasks add to the booking, with the usual 80% share', () => {
    const existing = [tidyTask({ id: 'x', completed: true })]
    const added = [tidyTask({ id: 'a', estimatedMinutes: 60 }), tidyTask({ id: 'b', estimatedMinutes: 15, tier: 'Quick' })]
    const quote = priceTaskAddition(existing, added, pricing, null)
    const alone = priceTaskListForState(added, 'GA', 240, null).total_customer_charge
    // Without laundry on the booking, that's their price on their own.
    expect(quote.amount).toBe(alone)
    expect(quote.cleanerPay).toBe(cleanerPayoutForServicePrice(alone))
  })

  it('charges only the surcharge for a task done during laundry already on the booking', () => {
    const washDry = tidyTask({ id: 'wd', dirtLevel: null, laundryService: 'washDry', laundryBaskets: 1, machineLoads: 1, completed: true })
    const quote = priceTaskAddition([washDry], [tidyTask({ id: 'a', estimatedMinutes: 30, dirtLevel: 'standard' })], pricing, null)
    expect(quote.amount).toBe(5)
  })

  it('makes the visit as long as all its tasks together', () => {
    const existing = [tidyTask({ id: 'x', completed: true })]
    const added = [tidyTask({ id: 'a', estimatedMinutes: 45 })]
    const quote = priceTaskAddition(existing, added, pricing, null)
    expect(quote.newDurationMinutes).toBe(visitDurationMinutes([...existing, ...added]))
    expect(quote.addedMinutes).toBe(quote.newDurationMinutes - visitDurationMinutes(existing))
  })

  it('adds a Standard / Deep Cleaning’s time to the visit, and charges only for the added tasks', () => {
    const withCleaning = { ...pricing, fullServiceMinutes: 150 }
    const added = [tidyTask({ id: 'a', estimatedMinutes: 45 })]
    // A cleaning-only booking: no Tidy Tasks yet.
    const quote = priceTaskAddition([], added, withCleaning, 150)
    expect(quote.amount).toBe(priceTaskListForState(added, 'GA', 240, null).total_customer_charge)
    expect(quote.newDurationMinutes).toBe(195)
    expect(quote.addedMinutes).toBe(45)
  })

  it('never reports negative added time when the booking was stored longer', () => {
    const quote = priceTaskAddition([tidyTask({ id: 'x' })], [tidyTask({ id: 'a', estimatedMinutes: 15 })], pricing, 600)
    expect(quote.addedMinutes).toBe(0)
  })
})
