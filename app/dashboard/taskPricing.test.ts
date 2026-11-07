import { describe, expect, it, vi } from 'vitest'
import { estimateTaskDuration } from '@/lib/aiTaskEstimate'
import { buildValidatedTaskPool, ensurePriceableTasks, isTaskPriceable, resolveStatePricing, UnpriceableTaskError } from './taskPricing'
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
