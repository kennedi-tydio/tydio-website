import { describe, expect, it } from 'vitest'
import { buildValidatedTaskPool, resolveStatePricing } from './taskPricing'
import type { TidyTask } from './types'

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

  it('maps dirtLevel standard to +$5', () => {
    const [validated] = buildValidatedTaskPool([tidyTask({ dirtLevel: 'standard', estimatedMinutes: 15 })])
    expect(validated.cleaning_type_surcharge).toBe(5)
  })

  it('maps dirtLevel heavy to +$10', () => {
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
})
