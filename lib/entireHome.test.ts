import { describe, expect, it } from 'vitest'
import { entireHomeTaskKind, entireHomeTier, isEntireHomeRoom } from './entireHome'

describe('entireHomeTaskKind', () => {
  it.each([
    ['Clean baseboards', 'baseboards'],
    ['Wipe the windows', 'windows'],
    ['Sweep and mop floors', 'sweepAndMop'],
    ['Mop & sweep', 'sweepAndMop'],
    ['Sweep floors', 'sweep'],
    ['Mop the floor', 'mop'],
  ])('accepts "%s" as %s', (name, kind) => {
    expect(entireHomeTaskKind(name)).toBe(kind)
  })

  it.each(['Vacuum the rug', 'Dust shelves', 'Scrub toilet', ''])('rejects "%s"', (name) => {
    expect(entireHomeTaskKind(name)).toBeNull()
  })
})

describe('entireHomeTier', () => {
  it('prices a whole-home sweep and mop at Heavy', () => {
    expect(entireHomeTier('Sweep and mop')).toBe('Heavy')
  })

  it('returns null for a task Entire home does not accept', () => {
    expect(entireHomeTier('Vacuum')).toBeNull()
  })
})

describe('isEntireHomeRoom', () => {
  it('matches regardless of case and spacing', () => {
    expect(isEntireHomeRoom(' entire HOME ')).toBe(true)
    expect(isEntireHomeRoom('Kitchen')).toBe(false)
  })
})
