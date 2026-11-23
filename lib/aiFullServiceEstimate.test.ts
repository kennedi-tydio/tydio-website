import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const create = vi.fn()
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create } }
  },
}))

import {
  cachedEstimateMinutes,
  clampEstimate,
  estimateFullServiceMinutes,
  estimateInputHash,
  fallbackFullServiceMinutes,
  fullServiceMinutesWithoutAi,
} from './aiFullServiceEstimate'
import { emptySelection, type FullServiceSelection } from './fullService'

const rooms: FullServiceSelection = { ...emptySelection('standard'), scope: 'rooms', rooms: { kitchen: 1, full_bath: 2 } }

describe('fallbackFullServiceMinutes', () => {
  it('scales entire-home time by home size and rounds up to 15 minutes', () => {
    expect(fallbackFullServiceMinutes(emptySelection('standard'), 'under_1000')).toBe(150)
    expect(fallbackFullServiceMinutes(emptySelection('standard'), '3000_plus')).toBe(270)
    expect(fallbackFullServiceMinutes(emptySelection('deep'), 'under_1000')).toBe(270)
  })

  it('adds up rooms and add-ons, with a one-hour minimum', () => {
    // kitchen 40 + 2 × bath 30 = 100, + 2 ovens × 30 = 160 → 165
    expect(fallbackFullServiceMinutes({ ...rooms, addOns: { inside_oven: 2 } }, 'under_1000')).toBe(165)
    expect(fallbackFullServiceMinutes({ ...emptySelection('standard'), scope: 'rooms', rooms: { hallway: 1 } }, 'under_1000')).toBe(60)
  })
})

describe('clampEstimate', () => {
  it('keeps the AI near the formula and rounds up to 15 minutes', () => {
    expect(clampEstimate(140, 120)).toBe(150)
    expect(clampEstimate(1000, 120)).toBe(210)
    expect(clampEstimate(10, 120)).toBe(75)
    expect(clampEstimate('lots', 120)).toBe(120)
    expect(clampEstimate(NaN, 120)).toBe(120)
  })
})

describe('estimateInputHash', () => {
  it('changes with what’s booked and the home size, not with the wizard step', () => {
    const h = estimateInputHash(rooms, 'under_1000')
    expect(estimateInputHash({ ...rooms, step: 'notes' }, 'under_1000')).toBe(h)
    expect(estimateInputHash(rooms, '1000_1999')).not.toBe(h)
    expect(estimateInputHash({ ...rooms, addOns: { inside_oven: 1 } }, 'under_1000')).not.toBe(h)
  })
})

describe('cached estimate', () => {
  it('is used only while it matches the selection', () => {
    const estimate = { minutes: 140, source: 'ai' as const, inputHash: estimateInputHash(rooms, 'under_1000'), at: '' }
    expect(cachedEstimateMinutes({ ...rooms, estimate }, 'under_1000')).toBe(150)
    expect(cachedEstimateMinutes({ ...rooms, estimate }, '2000_2999')).toBeNull()
    expect(fullServiceMinutesWithoutAi({ ...rooms, estimate }, '2000_2999')).toBe(fallbackFullServiceMinutes(rooms, '2000_2999'))
  })
})

describe('estimateFullServiceMinutes', () => {
  const key = process.env.OPENAI_API_KEY
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test'
    create.mockReset()
  })
  afterEach(() => {
    process.env.OPENAI_API_KEY = key
  })

  it('uses the AI’s answer, clamped', async () => {
    create.mockResolvedValue({ choices: [{ message: { content: '{"minutes": 130}' } }] })
    expect(await estimateFullServiceMinutes(rooms, 'under_1000')).toEqual({ minutes: 135, source: 'ai' })
  })

  it('falls back to the formula when the AI fails or answers nonsense', async () => {
    const fallback = fallbackFullServiceMinutes(rooms, 'under_1000')
    create.mockRejectedValue(new Error('timeout'))
    expect(await estimateFullServiceMinutes(rooms, 'under_1000')).toEqual({ minutes: fallback, source: 'fallback' })
    create.mockResolvedValue({ choices: [{ message: { content: '{"minutes": "a while"}' } }] })
    expect(await estimateFullServiceMinutes(rooms, 'under_1000')).toEqual({ minutes: fallback, source: 'fallback' })
  })

  it('doesn’t call the AI without a key', async () => {
    delete process.env.OPENAI_API_KEY
    expect((await estimateFullServiceMinutes(rooms, 'under_1000')).source).toBe('fallback')
    expect(create).not.toHaveBeenCalled()
  })
})
