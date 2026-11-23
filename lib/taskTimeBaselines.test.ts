import { describe, expect, it } from 'vitest'
import { baselineMinutesFor, expectedTaskMinutes, guardTaskMinutes } from './taskTimeBaselines'

describe('baselineMinutesFor', () => {
  it('matches common tasks', () => {
    expect(baselineMinutesFor('Scrub the toilet')).toBe(10)
    expect(baselineMinutesFor('Mop floor')).toBe(12)
    expect(baselineMinutesFor('Sweep the kitchen floor')).toBe(10)
    expect(baselineMinutesFor('Clean the shower door')).toBe(10)
    expect(baselineMinutesFor('Clean shower')).toBe(15)
    expect(baselineMinutesFor('Vacuum the couch')).toBe(10)
    expect(baselineMinutesFor('Vacuum the rug')).toBe(8)
    expect(baselineMinutesFor('Take out the trash')).toBe(5)
  })

  it('returns null for tasks it has no baseline for', () => {
    expect(baselineMinutesFor('Water the plants')).toBeNull()
    expect(baselineMinutesFor('')).toBeNull()
  })
})

describe('expectedTaskMinutes', () => {
  it('scales by mess level and issues', () => {
    expect(expectedTaskMinutes({ name: 'Scrub the toilet', dirtLevel: 'light' })).toBeCloseTo(7)
    expect(expectedTaskMinutes({ name: 'Scrub the toilet', dirtLevel: 'heavy' })).toBe(15)
    expect(expectedTaskMinutes({ name: 'Scrub the toilet', dirtLevel: 'heavy', unusual: ['Hard water stains'] })).toBe(19)
  })
})

describe('guardTaskMinutes', () => {
  it('pulls an inflated estimate for a known task back into range', () => {
    // Toilet, standard: expected 10, so at most 17.5.
    expect(guardTaskMinutes(45, { name: 'Scrub the toilet', dirtLevel: 'standard' })).toBe(18)
  })

  it('never lets the AI alone push a task that should fit past 30 minutes', () => {
    // Mop, heavy: expected 18 × 1.75 = 31.5, capped to 29.
    expect(guardTaskMinutes(60, { name: 'Mop floor', dirtLevel: 'heavy' })).toBe(29)
  })

  it('raises an implausibly low estimate', () => {
    expect(guardTaskMinutes(1, { name: 'Clean bathtub' })).toBe(8)
  })

  it('keeps an in-range estimate', () => {
    expect(guardTaskMinutes(12, { name: 'Scrub the toilet' })).toBe(12)
  })

  it('uses the expected time when the AI gives nothing usable for a known task', () => {
    expect(guardTaskMinutes(undefined, { name: 'Mop floor' })).toBe(12)
    expect(guardTaskMinutes(-5, { name: 'Mop floor' })).toBe(12)
    expect(guardTaskMinutes(5000, { name: 'Mop floor' })).toBe(12)
  })

  it('trusts the AI for unknown tasks, within absolute limits', () => {
    expect(guardTaskMinutes(14.6, { name: 'Water the plants' })).toBe(15)
    expect(guardTaskMinutes(45, { name: 'Water the plants' })).toBe(45)
    expect(guardTaskMinutes(500, { name: 'Water the plants' })).toBeNull()
    expect(guardTaskMinutes('nope', { name: 'Water the plants' })).toBeNull()
  })
})
