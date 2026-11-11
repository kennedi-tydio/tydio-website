import type { Tier } from './pricingRules'

// "Entire home" is a built-in location in Add Task, alongside the rooms.
// Only whole-home tasks that scale with the size of the home are accepted
// there, and they're priced at a fixed tier (then scaled by the address's
// square footage multiplier) rather than by an AI estimate, since a
// whole-home pass would otherwise blow through the 30-minute Tidy Task cap.
export const ENTIRE_HOME_ROOM = 'Entire home'

export const ENTIRE_HOME_ALLOWED_MESSAGE =
  'Entire home only accepts baseboard cleaning, window cleaning, and floor sweeping and mopping.'

export type EntireHomeTaskKind = 'baseboards' | 'windows' | 'sweepAndMop' | 'sweep' | 'mop'

export const ENTIRE_HOME_TIER: Record<EntireHomeTaskKind, Tier> = {
  baseboards: 'Heavy',
  windows: 'Heavy',
  sweepAndMop: 'Heavy',
  sweep: 'Standard',
  mop: 'Standard',
}

export function isEntireHomeRoom(room: string | null | undefined): boolean {
  return (room ?? '').trim().toLowerCase() === ENTIRE_HOME_ROOM.toLowerCase()
}

// Null when the task isn't one Entire home accepts.
export function entireHomeTaskKind(name: string): EntireHomeTaskKind | null {
  const n = name.toLowerCase()
  if (/baseboard/.test(n)) return 'baseboards'
  if (/window/.test(n)) return 'windows'
  const sweep = /\bsweep/.test(n)
  const mop = /\bmop/.test(n)
  if (sweep && mop) return 'sweepAndMop'
  if (sweep) return 'sweep'
  if (mop) return 'mop'
  return null
}

// A floor sweeping and/or mopping task in any room. Its effort grows with the
// size of the home, so it gets the square footage multiplier.
export function isFloorSweepOrMopTask(name: string | null | undefined): boolean {
  const kind = entireHomeTaskKind(name ?? '')
  return kind === 'sweep' || kind === 'mop' || kind === 'sweepAndMop'
}

export function entireHomeTier(name: string): Tier | null {
  const kind = entireHomeTaskKind(name)
  return kind ? ENTIRE_HOME_TIER[kind] : null
}
