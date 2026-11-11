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

  it('leaves a task unpriceable, without throwing, if the AI itself is unreachable', async () => {
    const mockEstimate = vi.mocked(estimateTaskDuration)
    mockEstimate.mockReset()
    mockEstimate.mockRejectedValue(new Error('network down'))

    const { admin } = mockDraftsAdmin()
    const broken = tidyTask({ tier: null, estimatedMinutes: null })

    const result = await ensurePriceableTasks(admin, 'draft-1', [broken])

    expect(isTaskPriceable(result[0])).toBe(false)
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

  it('takes the booking’s non-laundry task time off a full wash & dry cycle', () => {
    const washDry = tidyTask({ id: 'wd', dirtLevel: null, laundryService: 'washDry', laundryBaskets: 1, machineLoads: 1 })
    const kitchen = tidyTask({ id: 'k', tier: 'Standard', estimatedMinutes: 20 })
    const bath = tidyTask({ id: 'b', tier: 'Heavy', estimatedMinutes: 25 })
    const fold = tidyTask({ id: 'f', dirtLevel: null, laundryService: 'fold', laundryBaskets: 1 })
    const cycle = (tasks: TidyTask[]) => buildValidatedTaskPool(tasks).find((t) => t.tier === 'Full cycle')!.estimated_minutes

    expect(cycle([washDry, kitchen, bath])).toBe(75) // 120 − 45
    expect(cycle([washDry, fold])).toBe(120) // laundry tasks don't count
    // Other tasks longer than the cycle: laundry adds no time.
    const long = Array.from({ length: 6 }, (_, i) => tidyTask({ id: `l${i}`, tier: 'Heavy', estimatedMinutes: 25 }))
    expect(cycle([washDry, ...long])).toBe(0)
    // The visit lasts as long as the cycle, with the other tasks done meanwhile.
    expect(visitDurationMinutes([washDry, kitchen, bath])).toBe(120)
  })

  it('takes the other tasks’ time off only once across several wash & dry tasks', () => {
    const wd1 = tidyTask({ id: 'wd1', dirtLevel: null, laundryService: 'washDry', laundryBaskets: 1, machineLoads: 1 })
    const wd2 = tidyTask({ id: 'wd2', dirtLevel: null, laundryService: 'washDry', laundryBaskets: 1, machineLoads: 1 })
    const others = Array.from({ length: 6 }, (_, i) => tidyTask({ id: `o${i}`, tier: 'Heavy', estimatedMinutes: 25 }))
    const minutes = buildValidatedTaskPool([wd1, wd2, ...others])
      .filter((t) => t.tier === 'Full cycle')
      .map((t) => t.estimated_minutes)
    // 150 minutes of other tasks: 120 off the first cycle, the last 30 off the second.
    expect(minutes).toEqual([0, 90])
  })

  it('charges washing and drying at $25 an hour, the same in every state: $50 a full-cycle load', () => {
    const washDry = tidyTask({ dirtLevel: null, laundryService: 'washDry', laundryBaskets: 1, machineLoads: 1 })
    expect(priceTaskListForState([washDry], 'GA', 240).total_customer_charge).toBe(50)
    expect(priceTaskListForState([washDry], 'CA', 600, '3000_plus').total_customer_charge).toBe(50)
    expect(priceTaskListForState([{ ...washDry, machineLoads: 2 }], 'GA', 240).total_customer_charge).toBe(100)
    // Wash or Dry only: 7 minutes a load at $25 an hour.
    const wash = tidyTask({ dirtLevel: null, laundryService: 'wash', laundryBaskets: 1, machineLoads: 1 })
    expect(priceTaskListForState([wash], 'GA', 240).total_customer_charge).toBe(2.92)
  })

  it('prices folding from its time at the state rate, not the laundry hourly rate', () => {
    const fold = tidyTask({ dirtLevel: null, laundryService: 'fold', laundryBaskets: 1 })
    // 20 minutes at $1 a minute.
    expect(priceTaskListForState([fold], 'GA', 240).total_customer_charge).toBe(20)
  })

  it('charges only the cycle time the other tasks don’t cover, scaling only the floor tasks', () => {
    const washDry = tidyTask({ id: 'wd', dirtLevel: null, laundryService: 'washDry', laundryBaskets: 1, machineLoads: 1 })
    const chores = (minutes: number[]) =>
      minutes.map((m, i) =>
        tidyTask({ id: `c${i}`, name: 'Sweep and mop kitchen floor', tier: 'Heavy', estimatedMinutes: m, dirtLevel: 'light' })
      )

    // $240 / 4 hours = $1 a minute, 1.2× home.
    const short = priceTaskListForState([washDry, ...chores([30, 30])], 'GA', 240, '2000_2999')
    // 60 minutes of chores ($60 × 1.2) plus the cycle's other 60 minutes at $25 an hour.
    expect(short.total_task_minutes).toBe(120)
    expect(short.base_price).toBe(60)
    expect(short.square_footage_adjustment).toBe(12)
    expect(short.total_customer_charge).toBe(97)

    const long = priceTaskListForState([washDry, ...chores([25, 25, 25, 25, 25, 25, 30])], 'GA', 240, '2000_2999')
    expect(long.total_task_minutes).toBe(180)
    expect(long.base_price).toBe(180)
    expect(long.square_footage_adjustment).toBe(36)
    expect(long.total_customer_charge).toBe(216)

    const laundryOnly = priceTaskListForState([washDry], 'GA', 240, '2000_2999')
    expect(laundryOnly.square_footage_adjustment).toBe(0)
    expect(laundryOnly.total_customer_charge).toBe(50)
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
    // 2 hours at $25 = $50, + 2 × $5 = $60. No 1.2× for the home size.
    expect(breakdown.total_customer_charge).toBe(60)
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

  it('reserves the 2-hour cycle once for a linked Wash + Dry', () => {
    expect(visitDurationMinutes([wash(1), dry(1)])).toBe(120)
    expect(visitDurationMinutes([wash(3), dry(2)])).toBe(120)
  })

  it('treats Wash and Dry that are not the same laundry as start-the-load tasks', () => {
    expect(visitDurationMinutes([wash(1), dry(1, { sameLaundryAsTaskId: null })])).toBe(14)
    // The link only counts when both tasks are in the booking.
    expect(visitDurationMinutes([dry(1)])).toBe(7)
  })

  it('adds the booking’s other tasks to the visit', () => {
    const fold = tidyTask({ id: 'fold', dirtLevel: null, laundryService: 'fold', laundryBaskets: 1 })
    expect(visitDurationMinutes([wash(1), dry(1), fold])).toBe(140)
  })

  it('keeps pricing per task while the booking length uses the visit duration', () => {
    const breakdown = priceTaskListForState([wash(1), dry(1)], 'CA', 240)
    // 2 loads started at 7 minutes each, at $25 an hour.
    expect(breakdown.base_price).toBe(0)
    expect(breakdown.total_customer_charge).toBe(5.84)
    expect(breakdown.total_task_minutes).toBe(120)
  })

  it('rejects an invalid wash & dry load count', () => {
    for (const machineLoads of [0, 1.5, 21]) {
      const task = tidyTask({ dirtLevel: null, laundryService: 'washDry', laundryBaskets: 1, machineLoads })
      expect(isTaskPriceable(task)).toBe(false)
      expect(() => buildValidatedTaskPool([task])).toThrow(UnpriceableTaskError)
    }
  })
})
