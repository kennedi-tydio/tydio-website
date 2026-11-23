import { describe, expect, it, vi } from 'vitest'
import { applyQuote, hasQuoteTasks, isValidQuotePrice, QUOTE_PLACEHOLDER_MINUTES, withoutTidyProQuote } from './taskQuotes'
import { estimateTaskDuration } from '@/lib/aiTaskEstimate'
import { buildValidatedTaskPool, ensurePriceableTasks, isTaskPriceable, priceTaskListForState, visitDurationMinutes } from '@/app/dashboard/taskPricing'
import type { TidyTask } from '@/app/dashboard/types'

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

const quoteTask = (overrides: Partial<TidyTask> = {}) => tidyTask({ id: 'q1', name: 'Scrub the oven racks', needsQuote: true, ...overrides })

describe('isValidQuotePrice', () => {
  it('accepts dollars and cents from $1 to $500', () => {
    for (const value of [1, 12.5, 18.99, 500]) expect(isValidQuotePrice(value)).toBe(true)
  })

  it('rejects zero, too much, fractions of a cent and non-numbers', () => {
    for (const value of [0, 0.5, 500.01, 10.005, -3, Number.NaN, '15', null, undefined]) {
      expect(isValidQuotePrice(value)).toBe(false)
    }
  })
})

describe('applyQuote', () => {
  it('fills in the Tidy Pro’s price and clears needsQuote', () => {
    const quoted = applyQuote([tidyTask(), quoteTask()], { q1: 24.5 })
    expect(quoted).not.toBeNull()
    expect(quoted![0]).toEqual(tidyTask())
    expect(quoted![1]).toMatchObject({ needsQuote: false, quotedByTidyPro: true, quotedPrice: 24.5 })
    expect(hasQuoteTasks(quoted!)).toBe(false)
  })

  it('refuses a quote missing a task or out of range', () => {
    expect(applyQuote([quoteTask()], {})).toBeNull()
    expect(applyQuote([quoteTask()], { q1: 0 })).toBeNull()
    expect(applyQuote([quoteTask()], { q1: 900 })).toBeNull()
  })
})

describe('pricing a task waiting on a quote', () => {
  it('is bookable but charges nothing and holds the longest a Tidy Task takes', () => {
    const task = quoteTask({ dirtLevel: 'heavy', unusual: ['Pet hair'] })
    expect(isTaskPriceable(task)).toBe(true)
    const [item] = buildValidatedTaskPool([task])
    expect(item).toMatchObject({ tier: 'Quote', flat_price: 0, cleaning_type_surcharge: 0, additional_issue_surcharge: 0 })
    expect(visitDurationMinutes([task])).toBe(QUOTE_PLACEHOLDER_MINUTES)
  })

  it('adds nothing to the price of the tasks around it', () => {
    const priced = tidyTask({ estimatedMinutes: 15 })
    const alone = priceTaskListForState([priced], 'GA', 240)
    const withQuote = priceTaskListForState([priced, quoteTask()], 'GA', 240)
    expect(withQuote.total_customer_charge).toBe(alone.total_customer_charge)
    expect(withQuote.total_task_minutes).toBe(alone.total_task_minutes + QUOTE_PLACEHOLDER_MINUTES)
  })

  it('once quoted, charges exactly the Tidy Pro’s price, with no surcharges on top', () => {
    const priced = tidyTask({ estimatedMinutes: 15 })
    const [quoted] = applyQuote([quoteTask({ dirtLevel: 'heavy', unusual: ['Mold'] })], { q1: 22 })!
    const [item] = buildValidatedTaskPool([quoted])
    expect(item).toMatchObject({ flat_price: 22, cleaning_type_surcharge: 0, additional_issue_surcharge: 0, estimated_minutes: QUOTE_PLACEHOLDER_MINUTES })
    const alone = priceTaskListForState([priced], 'GA', 240)
    const withQuoted = priceTaskListForState([priced, quoted], 'GA', 240)
    expect(withQuoted.total_customer_charge).toBeCloseTo(alone.total_customer_charge + 22, 2)
  })

  it('still refuses a pet task whose photos expired', () => {
    const task = quoteTask({ pet: { kind: 'litterBox', litterOption: 'scoop', scope: 'Scoop', photos: [] } })
    expect(isTaskPriceable(task)).toBe(false)
  })
})

describe('withoutTidyProQuote', () => {
  it('turns a quoted price on a customer’s own list back into a quote request', () => {
    expect(withoutTidyProQuote(tidyTask({ quotedPrice: 0.01, quotedByTidyPro: true }))).toMatchObject({
      quotedPrice: null,
      quotedByTidyPro: null,
      needsQuote: true,
    })
  })

  it('leaves every other task alone', () => {
    const task = tidyTask({ estimatedMinutes: 12 })
    expect(withoutTidyProQuote(task)).toBe(task)
  })
})

describe('ensurePriceableTasks when the AI is down', () => {
  it('marks the task as needing a quote instead of leaving it unpriceable', async () => {
    vi.mocked(estimateTaskDuration).mockRejectedValueOnce(new Error('insufficient_quota'))
    const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }))
    const admin = { from: vi.fn(() => ({ update })) } as never
    const [repaired] = await ensurePriceableTasks(admin, 'draft-1', [tidyTask({ tier: null, estimatedMinutes: null })])
    expect(repaired.needsQuote).toBe(true)
    expect(isTaskPriceable(repaired)).toBe(true)
    expect(update).toHaveBeenCalled()
  })
})
