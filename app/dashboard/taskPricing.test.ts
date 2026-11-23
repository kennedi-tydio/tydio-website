import { describe, expect, it, vi } from 'vitest'
import { estimateTaskDuration } from '@/lib/aiTaskEstimate'
import { buildValidatedTaskPool, ensurePriceableTasks, isTaskPriceable, priceTaskListForState, resolveStatePricing, UnpriceableTaskError, visitDurationMinutes } from './taskPricing'
import type { TidyTask } from './types'

vi.mock('@/lib/aiTaskEstimate', () => ({
  estimateTaskDuration: vi.fn(),
}))

function tidyTask(overrides: Partial<TidyTask> = {}): TidyTask {
  return {
    id: 't1',
    name: 'Wipe counters',
    notes: '',
    room: 'Kitchen',
    dirtLevel: 'standard',
    unusual: [],
    completed: true,
    ...overrides,
  }
}

describe('buildValidatedTaskPool — per-task surcharge mapping', () => {
  it('maps dirtLevel light to $0 cleaning-type surcharge', () => {
    const [validated] = buildValidatedTaskPool([tidyTask({ dirtLevel: 'light', estimatedMinutes: 15 })])
    expect(validated.cleaning_type_surcharge).toBe(0)
  })

  it('maps dirtLevel standard to +$5 cleaning-type surcharge', () => {
    const [validated] = buildValidatedTaskPool([tidyTask({ dirtLevel: 'standard', estimatedMinutes: 15 })])
    expect(validated.cleaning_type_surcharge).toBe(5)
  })

  it('maps dirtLevel heavy (deep cleaning) to +$10', () => {
    const [validated] = buildValidatedTaskPool([tidyTask({ dirtLevel: 'heavy', estimatedMinutes: 15 })])
    expect(validated.cleaning_type_surcharge).toBe(10)
  })

  it('adds $10 per selected additional issue', () => {
    const [validated] = buildValidatedTaskPool([
      tidyTask({ unusual: ['Pet mess', 'Mold/mildew'], estimatedMinutes: 15 }),
    ])
    expect(validated.additional_issue_surcharge).toBe(20)
  })

  it('laundry sub-tasks contribute $0 surcharge regardless of dirtLevel/unusual on the parent task', () => {
    const validated = buildValidatedTaskPool([
      tidyTask({ laundryLoads: { wash: 1, dry: 1, fold: 1 }, dirtLevel: 'heavy', unusual: ['Pet mess'] }),
    ])
    expect(validated.length).toBe(3)
    for (const t of validated) {
      expect(t.cleaning_type_surcharge).toBe(0)
      expect(t.additional_issue_surcharge).toBe(0)
    }
  })

  it('dish sub-tasks contribute $0 surcharge regardless of dirtLevel/unusual on the parent task', () => {
    const [validated] = buildValidatedTaskPool([
      tidyTask({ hasDishwasher: true, dirtLevel: 'heavy', unusual: ['Mold/mildew'] }),
    ])
    expect(validated.cleaning_type_surcharge).toBe(0)
    expect(validated.additional_issue_surcharge).toBe(0)
  })

  it('uses the AI-estimated minutes as-is, not a tier midpoint, when one was returned', () => {
    const [validated] = buildValidatedTaskPool([tidyTask({ tier: 'Standard', estimatedMinutes: 18 })])
    expect(validated.estimated_minutes).toBe(18)
    expect(validated.has_estimated_duration).toBe(true)
  })

  it('rejects a task the AI never estimated instead of silently pricing it as the cheapest tier', () => {
    // Regression test: a task that failed AI validation (e.g. network error)
    // is saved with tier=null and estimatedMinutes=null. It must be treated
    // as unpriceable, not fall through to the "Tiny" (7-minute) tier.
    const unestimated = tidyTask({ tier: null, estimatedMinutes: null })
    expect(() => buildValidatedTaskPool([unestimated])).toThrow(UnpriceableTaskError)
  })
})

describe('isTaskPriceable', () => {
  it('is false for a regular task with no tier and no estimate', () => {
    expect(isTaskPriceable(tidyTask({ tier: null, estimatedMinutes: null }))).toBe(false)
  })

  it('is true once a tier or estimate is present', () => {
    expect(isTaskPriceable(tidyTask({ tier: 'Standard', estimatedMinutes: null }))).toBe(true)
    expect(isTaskPriceable(tidyTask({ tier: null, estimatedMinutes: 12 }))).toBe(true)
  })

  it('dish and laundry tasks are always priceable — they use fixed tiers, not an AI estimate', () => {
    expect(isTaskPriceable(tidyTask({ tier: null, estimatedMinutes: null, hasDishwasher: false }))).toBe(true)
    expect(isTaskPriceable(tidyTask({ tier: null, estimatedMinutes: null, laundryLoads: { wash: 1, dry: 0, fold: 0 } }))).toBe(true)
  })
})

function mockDraftsAdmin() {
  const updateCalls: unknown[] = []
  const admin = {
    from: (table: string) => {
      if (table !== 'booking_drafts') throw new Error(`unexpected table ${table}`)
      return {
        update: (patch: unknown) => ({
          eq: async () => {
            updateCalls.push(patch)
            return { error: null }
          },
        }),
      }
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
  return { admin, updateCalls }
}

describe('ensurePriceableTasks — self-healing backfill', () => {
  it('leaves an already-priceable task list untouched and never calls the AI', async () => {
    const mockEstimate = vi.mocked(estimateTaskDuration)
    mockEstimate.mockClear()
    const { admin } = mockDraftsAdmin()
    const tasks = [tidyTask({ tier: 'Standard', estimatedMinutes: 15 })]

    const result = await ensurePriceableTasks(admin, 'draft-1', tasks)

    expect(result).toBe(tasks)
    expect(mockEstimate).not.toHaveBeenCalled()
  })

  it('backfills a task missing an estimate using its full details, and persists the fix', async () => {
    const mockEstimate = vi.mocked(estimateTaskDuration)
    mockEstimate.mockReset()
    mockEstimate.mockResolvedValue({ valid: true, reason: '', estimated_minutes: 22, tier: 'Standard' })

    const { admin, updateCalls } = mockDraftsAdmin()
    const broken = tidyTask({ id: 'broken-1', tier: null, estimatedMinutes: null, dirtLevel: 'heavy', unusual: ['Pet mess'] })
    const fine = tidyTask({ id: 'fine-1', tier: 'Quick', estimatedMinutes: 12 })

    const result = await ensurePriceableTasks(admin, 'draft-1', [broken, fine])

    // The AI gets the same task info a customer entered — name, room, notes,
    // mess level, and any additional issues — not just the bare name.
    expect(mockEstimate).toHaveBeenCalledTimes(1)
    expect(mockEstimate).toHaveBeenCalledWith({
      name: broken.name,
      room: broken.room,
      notes: broken.notes,
      dirtLevel: 'heavy',
      unusual: ['Pet mess'],
    })

    expect(result.find((t) => t.id === 'broken-1')).toMatchObject({ tier: 'Standard', estimatedMinutes: 22 })
    expect(result.find((t) => t.id === 'fine-1')).toEqual(fine)
    expect(updateCalls).toHaveLength(1)
  })

  it('sends a task for a Tidy Pro quote, without throwing, if the AI itself is unreachable', async () => {
    const mockEstimate = vi.mocked(estimateTaskDuration)
    mockEstimate.mockReset()
    mockEstimate.mockRejectedValue(new Error('network down'))

    const { admin } = mockDraftsAdmin()
    const broken = tidyTask({ tier: null, estimatedMinutes: null })

    const result = await ensurePriceableTasks(admin, 'draft-1', [broken])

    // Bookable, but only through a quote request (lib/quoteRequests.ts): no tier yet.
    expect(result[0]).toMatchObject({ needsQuote: true, tier: null })
    expect(isTaskPriceable(result[0])).toBe(true)
  })
})

type AreaRow = { city: string | null; state: string } | null
type PricingRow = { state: string; median_four_hour_price: number; pricing_active: boolean } | null

function mockAdmin(areaRow: AreaRow, pricingRow: PricingRow) {
  return {
    from: (table: string) => {
      if (table === 'service_areas') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: areaRow, error: null }) }) }) }
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: pricingRow, error: null }) }) }) }
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('resolveStatePricing — never falls back to a guessed price', () => {
  it('returns not configured when there is no service area id', async () => {
    const result = await resolveStatePricing(mockAdmin(null, null), null)
    expect(result.configured).toBe(false)
  })

  it('returns not configured when the service area does not exist', async () => {
    const result = await resolveStatePricing(mockAdmin(null, null), 'area-1')
    expect(result.configured).toBe(false)
  })

  it('returns not configured when no state_pricing row exists for that state', async () => {
    const result = await resolveStatePricing(mockAdmin({ city: 'Atlanta', state: 'GA' }, null), 'area-1')
    expect(result).toEqual({ configured: false, city: 'Atlanta', state: 'GA' })
  })

  it('returns not configured when pricing_active is false, even if a price exists', async () => {
    const result = await resolveStatePricing(
      mockAdmin({ city: 'Atlanta', state: 'GA' }, { state: 'GA', median_four_hour_price: 200, pricing_active: false }),
      'area-1'
    )
    expect(result.configured).toBe(false)
  })

  it('returns the configured admin-set state price when active', async () => {
    const result = await resolveStatePricing(
      mockAdmin({ city: 'Atlanta', state: 'GA' }, { state: 'GA', median_four_hour_price: 200, pricing_active: true }),
      'area-1'
    )
    expect(result).toEqual({ configured: true, state: 'GA', medianFourHourPrice: 200 })
  })

  it('uses the profile state when the customer has no service area', async () => {
    const result = await resolveStatePricing(
      mockAdmin(null, { state: 'GA', median_four_hour_price: 215, pricing_active: true }),
      null,
      { city: 'Atlanta', state: 'GA' }
    )
    expect(result).toEqual({ configured: true, state: 'GA', medianFourHourPrice: 215 })
  })

  it('still returns not configured when the profile state has no active price', async () => {
    const result = await resolveStatePricing(mockAdmin(null, null), null, { city: 'Austin', state: 'TX' })
    expect(result).toEqual({ configured: false, city: 'Austin', state: 'TX' })
  })

  it('returns not configured when neither a service area nor a profile state is known', async () => {
    const result = await resolveStatePricing(mockAdmin(null, null), null, { city: null, state: null })
    expect(result.configured).toBe(false)
  })
})

describe('laundry service tasks — one service, one quantity', () => {
  const minutesFor = (overrides: Partial<TidyTask>) => {
    const pool = buildValidatedTaskPool([tidyTask({ dirtLevel: null, ...overrides })])
    expect(pool).toHaveLength(1)
    return pool[0].estimated_minutes
  }

  it('prices wash or dry only as one load started, whatever the baskets', () => {
    expect(minutesFor({ laundryService: 'wash', laundryBaskets: 1 })).toBe(7)
    expect(minutesFor({ laundryService: 'dry', laundryBaskets: 0.5 })).toBe(7)
    expect(minutesFor({ laundryService: 'dry', laundryBaskets: 2.5 })).toBe(7)
  })

  it('prices a full wash & dry cycle at 2 hours a load, part-baskets rounding up', () => {
    expect(minutesFor({ laundryService: 'washDry', laundryBaskets: 1 })).toBe(120)
    expect(minutesFor({ laundryService: 'washDry', laundryBaskets: 0.5 })).toBe(120)
    expect(minutesFor({ laundryService: 'washDry', laundryBaskets: 2.5 })).toBe(360)
  })

  it('does the household tasks during a full wash & dry cycle: the visit is the longer of the two', () => {
    const washDry = tidyTask({ id: 'wd', dirtLevel: null, laundryService: 'washDry', laundryBaskets: 1, machineLoads: 1 })
    const kitchen = tidyTask({ id: 'k', tier: 'Standard', estimatedMinutes: 20 })
    const bath = tidyTask({ id: 'b', tier: 'Heavy', estimatedMinutes: 25 })
    const fold = tidyTask({ id: 'f', dirtLevel: null, laundryService: 'fold', laundryBaskets: 1 })
    const cycle = (tasks: TidyTask[]) => buildValidatedTaskPool(tasks).find((t) => t.tier === 'Full cycle')!

    // The cycle is always charged in full, as task time at the state rate.
    expect(cycle([washDry, kitchen, bath]).estimated_minutes).toBe(120)
    expect(cycle([washDry, kitchen, bath]).flat_price).toBeUndefined()
    // Household tasks under 2 hours: the visit is 2 hours.
    expect(visitDurationMinutes([washDry, kitchen, bath])).toBe(120)
    // Household tasks over 2 hours: the visit is their time.
    const long = Array.from({ length: 6 }, (_, i) => tidyTask({ id: `l${i}`, tier: 'Heavy', estimatedMinutes: 25 }))
    expect(visitDurationMinutes([washDry, ...long])).toBe(150)
    // Other laundry tasks are added on top.
    expect(visitDurationMinutes([washDry, fold])).toBe(140)
  })

  it('fits 60 minutes of tasks inside a wash & dry load: just the 2 hours, $107.50 at a $215 state rate', () => {
    const washDry = tidyTask({ id: 'wd', dirtLevel: null, laundryService: 'washDry', laundryBaskets: 1, machineLoads: 1 })
    const chores = [30, 30].map((m, i) =>
      tidyTask({ id: `c${i}`, name: 'Wipe counters', tier: 'Heavy', estimatedMinutes: m, dirtLevel: 'light' })
    )
    // 120/240 × $215; the chores' time is covered, and light chores have no surcharge.
    const breakdown = priceTaskListForState([washDry, ...chores], 'GA', 215)
    expect(breakdown.total_customer_charge).toBe(107.5)
    expect(breakdown.total_task_minutes).toBe(120)
  })

  it('charges cleaning time past the laundry 2 hours: $106 + $53 = $159 in Atlanta', () => {
    // Atlanta: $212 for 4 hours, $53 an hour.
    const washDry = tidyTask({ id: 'wd', dirtLevel: null, laundryService: 'washDry', laundryBaskets: 1, machineLoads: 1 })
    const threeHours = Array.from({ length: 6 }, (_, i) =>
      tidyTask({ id: `c${i}`, name: 'Wipe counters', tier: 'Heavy', estimatedMinutes: 30, dirtLevel: 'light' })
    )
    expect(priceTaskListForState([washDry, ...threeHours], 'GA', 212).total_customer_charge).toBe(159)
  })

  it('still charges the surcharges of tasks done during the laundry', () => {
    const washDry = tidyTask({ id: 'wd', dirtLevel: null, laundryService: 'washDry', laundryBaskets: 1, machineLoads: 1 })
    const heavy = tidyTask({ id: 'h', name: 'Scrub tub', tier: 'Heavy', estimatedMinutes: 30, dirtLevel: 'heavy', unusual: ['Mold'] })
    // $106 laundry + $10 heavy + $10 for the extra issue.
    expect(priceTaskListForState([washDry, heavy], 'GA', 212).total_customer_charge).toBe(126)
  })

  it('adds only the home-size multiplier for floor tasks done during the laundry', () => {
    const washDry = tidyTask({ id: 'wd', dirtLevel: null, laundryService: 'washDry', laundryBaskets: 1, machineLoads: 1 })
    const floors = tidyTask({ id: 'f', name: 'Sweep and mop floors', tier: 'Heavy', estimatedMinutes: 60, dirtLevel: 'light' })
    // 1,500 sq ft is 1.1x: an hour of floors is $53, so the multiplier adds $5.30.
    const breakdown = priceTaskListForState([washDry, floors], 'GA', 212, '1000_1999')
    expect(breakdown.square_footage_adjustment).toBe(5.3)
    expect(breakdown.total_customer_charge).toBe(111.3)
  })

  it('overlaps the household tasks with every cycle in the booking', () => {
    const wd1 = tidyTask({ id: 'wd1', dirtLevel: null, laundryService: 'washDry', laundryBaskets: 1, machineLoads: 1 })
    const wd2 = tidyTask({ id: 'wd2', dirtLevel: null, laundryService: 'washDry', laundryBaskets: 1, machineLoads: 1 })
    const others = Array.from({ length: 6 }, (_, i) => tidyTask({ id: `o${i}`, tier: 'Heavy', estimatedMinutes: 25 }))
    // 240 minutes of cycles, 150 of household tasks.
    expect(visitDurationMinutes([wd1, wd2, ...others])).toBe(240)
  })

  it('charges a wash & dry load as 2 hours at the state rate, not scaled by home size', () => {
    const washDry = tidyTask({ dirtLevel: null, laundryService: 'washDry', laundryBaskets: 1, machineLoads: 1 })
    expect(priceTaskListForState([washDry], 'GA', 212).total_customer_charge).toBe(106)
    expect(priceTaskListForState([washDry], 'CA', 600, '3000_plus').total_customer_charge).toBe(300)
    expect(priceTaskListForState([{ ...washDry, machineLoads: 2 }], 'GA', 212).total_customer_charge).toBe(212)
    // Wash or Dry only: 7 minutes a load at $25 an hour.
    const wash = tidyTask({ dirtLevel: null, laundryService: 'wash', laundryBaskets: 1, machineLoads: 1 })
    expect(priceTaskListForState([wash], 'GA', 240).total_customer_charge).toBe(2.92)
  })

  it('prices folding from its time at the state rate, not the laundry hourly rate', () => {
    const fold = tidyTask({ dirtLevel: null, laundryService: 'fold', laundryBaskets: 1 })
    // 20 minutes at $1 a minute.
    expect(priceTaskListForState([fold], 'GA', 240).total_customer_charge).toBe(20)
  })

  it('covers floor tasks time with the cycle, charging their home-size multiplier and any time past it', () => {
    const washDry = tidyTask({ id: 'wd', dirtLevel: null, laundryService: 'washDry', laundryBaskets: 1, machineLoads: 1 })
    const chores = (minutes: number[]) =>
      minutes.map((m, i) =>
        tidyTask({ id: `c${i}`, name: 'Sweep and mop kitchen floor', tier: 'Heavy', estimatedMinutes: m, dirtLevel: 'light' })
      )

    // $240 / 4 hours = $1 a minute, 1.2x home.
    const short = priceTaskListForState([washDry, ...chores([30, 30])], 'GA', 240, '2000_2999')
    // The $120 cycle; the 60 minutes of chores fit in it, so only their 1.2x ($12) is added.
    expect(short.total_task_minutes).toBe(120)
    expect(short.base_price).toBe(120)
    expect(short.square_footage_adjustment).toBe(12)
    expect(short.total_customer_charge).toBe(132)

    // 180 minutes of chores: the cycle covers 120, the other 60 are charged, and the 1.2x is on all 180.
    const long = priceTaskListForState([washDry, ...chores([25, 25, 25, 25, 25, 25, 30])], 'GA', 240, '2000_2999')
    expect(long.total_task_minutes).toBe(180)
    expect(long.base_price).toBe(180)
    expect(long.square_footage_adjustment).toBe(36)
    expect(long.total_customer_charge).toBe(216)

    const laundryOnly = priceTaskListForState([washDry], 'GA', 240, '2000_2999')
    expect(laundryOnly.square_footage_adjustment).toBe(0)
    expect(laundryOnly.total_customer_charge).toBe(120)
  })

  it('refuses a wash-only or dry-only laundromat trip, but prices a full cycle there', () => {
    const laundromat = (laundryService: 'wash' | 'dry' | 'washDry') =>
      tidyTask({ dirtLevel: null, laundryService, laundryBaskets: 1, machineLoads: 1, hasWasherDryer: false })
    for (const service of ['wash', 'dry'] as const) {
      expect(isTaskPriceable(laundromat(service))).toBe(false)
      expect(() => buildValidatedTaskPool([laundromat(service)])).toThrow(UnpriceableTaskError)
    }
    expect(isTaskPriceable(laundromat('washDry'))).toBe(true)
    expect(minutesFor({ laundryService: 'washDry', laundryBaskets: 1, machineLoads: 1, hasWasherDryer: false })).toBe(120)
  })

  it('charges a laundromat trip 2 hours for every 3 loads, run side by side', () => {
    const trip = (machineLoads: number) =>
      tidyTask({ id: 'lm', dirtLevel: null, laundryService: 'washDry', laundryBaskets: 1, machineLoads, hasWasherDryer: false })
    for (const [loads, minutes] of [[1, 120], [3, 120], [4, 240], [6, 240], [7, 360], [9, 360]]) {
      expect(minutesFor({ laundryService: 'washDry', laundryBaskets: 1, machineLoads: loads, hasWasherDryer: false })).toBe(minutes)
    }
    // Atlanta, $53 an hour: 5 loads is 4 hours, $212.
    expect(priceTaskListForState([trip(5)], 'GA', 212).total_customer_charge).toBe(212)
  })

  it('never lets a laundromat trip cover the other tasks: the Tidy Pro is away for it', () => {
    const trip = tidyTask({ id: 'lm', dirtLevel: null, laundryService: 'washDry', laundryBaskets: 1, machineLoads: 2, hasWasherDryer: false })
    const hour = [30, 30].map((m, i) => tidyTask({ id: `c${i}`, name: 'Wipe counters', tier: 'Heavy', estimatedMinutes: m, dirtLevel: 'light' }))
    // $106 for the trip + $53 for the hour of cleaning, done before or after it.
    expect(priceTaskListForState([trip, ...hour], 'GA', 212).total_customer_charge).toBe(159)
    expect(visitDurationMinutes([trip, ...hour])).toBe(180)
  })

  it('still lets laundry at home cover the other tasks when there is also a laundromat trip', () => {
    const trip = tidyTask({ id: 'lm', dirtLevel: null, laundryService: 'washDry', laundryBaskets: 1, machineLoads: 1, hasWasherDryer: false })
    const home = tidyTask({ id: 'wd', dirtLevel: null, laundryService: 'washDry', laundryBaskets: 1, machineLoads: 1 })
    const hour = tidyTask({ id: 'c', name: 'Wipe counters', tier: 'Heavy', estimatedMinutes: 60, dirtLevel: 'light' })
    // Trip $106 + home cycle $106; the hour of cleaning fits in the home cycle.
    expect(priceTaskListForState([trip, home, hour], 'GA', 212).total_customer_charge).toBe(212)
    expect(visitDurationMinutes([trip, home, hour])).toBe(240)
  })

  it('prices folding at 20 minutes a basket, scaled exactly', () => {
    expect(minutesFor({ laundryService: 'fold', laundryBaskets: 0.5 })).toBe(10)
    expect(minutesFor({ laundryService: 'fold', laundryBaskets: 1.5 })).toBe(30)
  })

  it('prices ironing at a flat $5 an item, not scaled by home size or the state rate', () => {
    const tasks = [tidyTask({ laundryService: 'iron', ironItems: 3 })]
    const big = priceTaskListForState(tasks, 'GA', 300, '3000_plus')
    expect(big.total_customer_charge).toBe(15)
    expect(big.flat_price_total).toBe(15)
    expect(big.total_task_minutes).toBe(15) // still blocks time on the schedule
    expect(isTaskPriceable(tasks[0])).toBe(true)
  })

  it('never scales laundry by home size', () => {
    const breakdown = priceTaskListForState(
      [tidyTask({ laundryService: 'washDry', laundryBaskets: 1 }), tidyTask({ id: 't2', laundryService: 'iron', ironItems: 2 })],
      'GA',
      200,
      '2000_2999'
    )
    // 2 hours at $50 an hour = $100, + 2 x $5 = $110. No 1.2x for the home size.
    expect(breakdown.total_customer_charge).toBe(110)
    expect(breakdown.square_footage_adjustment).toBe(0)
  })

  it('still scales the non-laundry tasks in the same booking', () => {
    const breakdown = priceTaskListForState(
      [
        tidyTask({ laundryService: 'fold', laundryBaskets: 1 }), // 20 min → $16.67, unscaled
        tidyTask({ id: 't2', name: 'Mop bathroom floor', tier: 'Standard', estimatedMinutes: 24, dirtLevel: 'light' }), // 24 min → $20, × 1.3
      ],
      'GA',
      200,
      '3000_plus'
    )
    expect(breakdown.square_footage_adjustment).toBe(6)
    expect(breakdown.total_customer_charge).toBe(42.67)
  })

  it('also stops scaling older multi-load laundry tasks', () => {
    const tasks = [tidyTask({ laundryLoads: { wash: 0, dry: 0, fold: 1 } })]
    expect(priceTaskListForState(tasks, 'GA', 240, '3000_plus').total_customer_charge).toBe(20)
  })

  it('rejects a missing or malformed basket count', () => {
    for (const laundryBaskets of [null, 0, -1, 0.75, 11]) {
      const task = tidyTask({ laundryService: 'wash', laundryBaskets })
      expect(() => buildValidatedTaskPool([task])).toThrow(UnpriceableTaskError)
      expect(isTaskPriceable(task)).toBe(false)
    }
  })

  it('rejects a missing or malformed ironing count', () => {
    for (const ironItems of [null, 0, 1.5, 100]) {
      const task = tidyTask({ laundryService: 'iron', ironItems })
      expect(() => buildValidatedTaskPool([task])).toThrow(UnpriceableTaskError)
      expect(isTaskPriceable(task)).toBe(false)
    }
  })

  it('still prices legacy multi-load laundry tasks saved without a service', () => {
    expect(buildValidatedTaskPool([tidyTask({ laundryLoads: { wash: 1, dry: 0, fold: 1 } })])).toHaveLength(2)
  })

  it('does not send laundry tasks to the AI estimator', async () => {
    const mockEstimate = vi.mocked(estimateTaskDuration)
    mockEstimate.mockReset()
    const { admin } = mockDraftsAdmin()
    await ensurePriceableTasks(admin, 'draft-1', [tidyTask({ laundryService: 'iron', ironItems: 2 })])
    expect(mockEstimate).not.toHaveBeenCalled()
  })
})

describe('square footage multiplier — Entire home and floor tasks only', () => {
  const price = (task: Partial<TidyTask>) => priceTaskListForState([tidyTask({ dirtLevel: 'light', ...task })], 'GA', 240, '3000_plus')

  it('does not scale an ordinary room task', () => {
    const breakdown = price({ name: 'Wipe down kitchen counters', tier: 'Standard', estimatedMinutes: 24 })
    expect(breakdown.square_footage_adjustment).toBe(0)
    expect(breakdown.total_customer_charge).toBe(24)
  })

  it('scales a floor sweep or mop task in any room', () => {
    expect(price({ name: 'Sweep kitchen floor', tier: 'Standard', estimatedMinutes: 20 }).total_customer_charge).toBe(26)
    expect(price({ name: 'Mop the bathroom', tier: 'Standard', estimatedMinutes: 20 }).total_customer_charge).toBe(26)
  })

  it('scales an Entire home task', () => {
    // Fixed Heavy tier, 27 min → $27, × 1.3.
    const breakdown = price({ name: 'Clean baseboards', room: 'Entire home' })
    expect(breakdown.total_customer_charge).toBe(35.1)
  })

  it('makes an Entire home task take longer in a bigger home', () => {
    const task = tidyTask({ name: 'Clean baseboards', room: 'Entire home', dirtLevel: 'light' })
    // 27 min × 1.3 = 35.1, rounded.
    const big = priceTaskListForState([task], 'GA', 240, '3000_plus')
    expect(big.total_task_minutes).toBe(35)
    expect(big.task_list[0].estimated_minutes).toBe(35)
    expect(visitDurationMinutes([task], '3000_plus')).toBe(35)
    expect(visitDurationMinutes([task], '2000_2999')).toBe(32)
    expect(visitDurationMinutes([task], null)).toBe(27)
  })

  it('keeps the time of room tasks, floor tasks included, the same in any home', () => {
    const tasks = [
      tidyTask({ name: 'Wipe down kitchen counters', tier: 'Standard', estimatedMinutes: 24, dirtLevel: 'light' }),
      tidyTask({ id: 't2', name: 'Mop the bathroom', tier: 'Standard', estimatedMinutes: 20, dirtLevel: 'light' }),
    ]
    expect(priceTaskListForState(tasks, 'GA', 240, '3000_plus').total_task_minutes).toBe(44)
  })
})

describe('buildValidatedTaskPool — Entire home tasks', () => {
  it('prices a whole-home sweep and mop at the fixed Heavy tier, ignoring any client tier', () => {
    const [validated] = buildValidatedTaskPool([
      tidyTask({ name: 'Sweep and mop floors', room: 'Entire home', tier: 'Tiny', estimatedMinutes: null }),
    ])
    expect(validated.tier).toBe('Heavy')
    expect(validated.estimated_minutes).toBe(27)
    expect(validated.has_estimated_duration).toBe(false)
    expect(validated.cleaning_type_surcharge).toBe(5)
  })

  it('rejects a task Entire home does not accept', () => {
    expect(() => buildValidatedTaskPool([tidyTask({ name: 'Vacuum rugs', room: 'Entire home', tier: 'Quick' })])).toThrow(
      UnpriceableTaskError
    )
  })
})

describe('machine loads and visit length for Wash and Dry', () => {
  const wash = (machineLoads: number, extra: Partial<TidyTask> = {}) =>
    tidyTask({ id: 'wash', dirtLevel: null, laundryService: 'wash', laundryBaskets: 1, machineLoads, ...extra })
  const dry = (machineLoads: number, extra: Partial<TidyTask> = {}) =>
    tidyTask({ id: 'dry', dirtLevel: null, laundryService: 'dry', laundryBaskets: 1, machineLoads, sameLaundryAsTaskId: 'wash', ...extra })

  it('prices wash/dry only as one load, ignoring a load count saved on an older task', () => {
    expect(buildValidatedTaskPool([wash(3)])[0].estimated_minutes).toBe(7)
    expect(buildValidatedTaskPool([wash(1, { machineLoads: undefined, laundryBaskets: 1.5 })])[0].estimated_minutes).toBe(7)
  })

  it('prices wash & dry per saved machine load', () => {
    const washDry = (machineLoads?: number) =>
      tidyTask({ dirtLevel: null, laundryService: 'washDry', laundryBaskets: 1.5, machineLoads })
    expect(buildValidatedTaskPool([washDry(3)])[0].estimated_minutes).toBe(360)
    // Saved before loads were asked: one load per basket, rounded up.
    expect(buildValidatedTaskPool([washDry()])[0].estimated_minutes).toBe(240)
  })

  it('reserves 1 hour for a linked Wash + Dry (washed and moved to the dryer)', () => {
    expect(visitDurationMinutes([wash(1), dry(1)])).toBe(60)
    expect(visitDurationMinutes([wash(3), dry(2)])).toBe(60)
  })

  it('treats Wash and Dry that are not the same laundry as start-the-load tasks', () => {
    expect(visitDurationMinutes([wash(1), dry(1, { sameLaundryAsTaskId: null })])).toBe(14)
    // The link only counts when both tasks are in the booking.
    expect(visitDurationMinutes([dry(1)])).toBe(7)
  })

  it('adds other laundry tasks to the visit', () => {
    const fold = tidyTask({ id: 'fold', dirtLevel: null, laundryService: 'fold', laundryBaskets: 1 })
    expect(visitDurationMinutes([wash(1), dry(1), fold])).toBe(80)
  })

  it('prices a linked Wash + Dry as 1 hour at the state rate: $53 in Atlanta', () => {
    const breakdown = priceTaskListForState([wash(1), dry(1)], 'GA', 212)
    expect(breakdown.base_price).toBe(53)
    expect(breakdown.flat_price_total).toBe(0)
    expect(breakdown.total_customer_charge).toBe(53)
    expect(breakdown.total_task_minutes).toBe(60)
    expect(breakdown.task_list).toHaveLength(1)
  })

  it('does the other household tasks during a linked Wash + Dry cycle', () => {
    const chores = (minutes: number[]) =>
      minutes.map((m, i) => tidyTask({ id: `c${i}`, name: 'Wipe counters', tier: 'Heavy', estimatedMinutes: m, dirtLevel: 'light' }))

    // $240 / 4 hours = $1 a minute. The $60 hour covers up to an hour of chores.
    const short = priceTaskListForState([wash(1), dry(1), ...chores([30, 30])], 'GA', 240)
    expect(short.total_task_minutes).toBe(60)
    expect(short.total_customer_charge).toBe(60)

    // Over an hour of chores: the booking is the chores' time, and the extra 90 minutes are charged.
    const long = priceTaskListForState([wash(1), dry(1), ...chores([25, 25, 25, 25, 25, 25])], 'GA', 240)
    expect(long.total_task_minutes).toBe(150)
    expect(long.total_customer_charge).toBe(150)
  })

  it('counts an Entire home task’s home-size time against the cycle', () => {
    const home = tidyTask({ id: 'eh', name: 'Clean baseboards', room: 'Entire home', dirtLevel: 'light' })
    const washDry = tidyTask({ id: 'wd', dirtLevel: null, laundryService: 'washDry', laundryBaskets: 1, machineLoads: 1 })
    const chores = Array.from({ length: 4 }, (_, i) =>
      tidyTask({ id: `c${i}`, name: 'Wipe counters', tier: 'Heavy', estimatedMinutes: 25, dirtLevel: 'light' })
    )
    // 100 min of chores + baseboards 27 min × 1.3 = 35 → 135 min, past the 2-hour cycle.
    expect(visitDurationMinutes([washDry, home, ...chores], '3000_plus')).toBe(135)
    expect(visitDurationMinutes([washDry, home, ...chores], null)).toBe(127)
  })

  it('rejects an invalid wash & dry load count', () => {
    for (const machineLoads of [0, 1.5, 21]) {
      const task = tidyTask({ dirtLevel: null, laundryService: 'washDry', laundryBaskets: 1, machineLoads })
      expect(isTaskPriceable(task)).toBe(false)
      expect(() => buildValidatedTaskPool([task])).toThrow(UnpriceableTaskError)
    }
  })
})
