// Guardrails on the AI's Tidy Task time estimate (lib/aiTaskEstimate.ts).
//
// The model sometimes inflates a simple job ("Mop floor" → 45 minutes), which
// either rejects a valid task as "too long" or bumps it into a pricier tier.
// For common tasks we know roughly how long the job takes, so the AI's answer
// is kept within a range of that baseline, scaled by the mess level and any
// additional issues. Tasks with no baseline keep the AI's answer, still
// bounded by the absolute limits below.

export interface TaskBaseline {
  pattern: RegExp
  // Typical minutes for one person at a "Standard cleaning" mess level.
  minutes: number
}

// Checked in order: put the more specific wording first ("shower door"
// before "shower", "vacuum couch" before "vacuum").
export const TASK_BASELINES: TaskBaseline[] = [
  { pattern: /\b(?:trash|garbage|recycling|bins?)\b/, minutes: 5 },
  { pattern: /\bmirrors?\b/, minutes: 5 },
  { pattern: /\bmake (?:the |my )?beds?\b/, minutes: 5 },
  { pattern: /\b(?:change|strip)\b.*\b(?:sheets|bedding|linens|beds?)\b|\b(?:sheets|bedding|linens)\b/, minutes: 10 },
  { pattern: /\btoilets?\b/, minutes: 10 },
  { pattern: /\bshower (?:door|glass|screen)s?\b/, minutes: 10 },
  { pattern: /\b(?:bath ?tubs?|tubs?)\b/, minutes: 15 },
  { pattern: /\bshowers?\b/, minutes: 15 },
  { pattern: /\bsinks?\b/, minutes: 8 },
  { pattern: /\b(?:counters?|countertops?)\b/, minutes: 8 },
  { pattern: /\b(?:stove ?tops?|cooktops?|stoves?|burners?)\b/, minutes: 10 },
  { pattern: /\bmicrowaves?\b/, minutes: 8 },
  { pattern: /\b(?:fridge|refrigerator)s?\b/, minutes: 20 },
  { pattern: /\bovens?\b/, minutes: 20 },
  { pattern: /\bdishwashers?\b/, minutes: 8 },
  { pattern: /\bdishes\b/, minutes: 15 },
  { pattern: /\bcabinets?\b/, minutes: 10 },
  { pattern: /\bbaseboards?\b/, minutes: 15 },
  { pattern: /\bblinds?\b/, minutes: 10 },
  { pattern: /\bwindows?\b/, minutes: 10 },
  { pattern: /\bceiling fans?\b/, minutes: 8 },
  { pattern: /\b(?:fold|laundry)\b/, minutes: 15 },
  { pattern: /\bvacuum\w*\b.*\b(?:couch|sofa|upholstery|cushions?)\b/, minutes: 10 },
  { pattern: /\bvacuum\w*\b.*\b(?:rugs?|mats?)\b/, minutes: 8 },
  { pattern: /\bvacuum\w*\b/, minutes: 12 },
  { pattern: /\bmop\w*\b/, minutes: 12 },
  { pattern: /\bsweep\w*\b|\bswept\b/, minutes: 10 },
  { pattern: /\bdust\w*\b/, minutes: 8 },
  { pattern: /\b(?:tables?|desks?)\b/, minutes: 5 },
]

const MESS_MULTIPLIER: Record<string, number> = {
  light: 0.7,
  standard: 1,
  heavy: 1.5,
}

// Each additional issue (pet mess, mold/mildew, hard water…) adds this much.
const MINUTES_PER_ISSUE = 4

// How far the AI may stray from the scaled baseline.
const LOW_FACTOR = 0.5
const HIGH_FACTOR = 1.75

// No single Tidy Task takes less than this, and anything above the ceiling
// is treated as a hallucination rather than a real estimate (Tidy Tasks are
// capped at 30 minutes, so a sane "too long" answer sits well below this).
export const MIN_TASK_MINUTES = 2
export const MAX_PLAUSIBLE_TASK_MINUTES = 90
// Matches tierFromEstimatedMinutes in lib/pricingRules.ts: 30+ is invalid.
const TIDY_TASK_CAP_MINUTES = 30

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function baselineMinutesFor(name: string): number | null {
  const n = normalize(name)
  if (!n) return null
  return TASK_BASELINES.find((b) => b.pattern.test(n))?.minutes ?? null
}

// The expected time for this task given its mess level and issues, or null
// when the task isn't one we have a baseline for.
export function expectedTaskMinutes(input: {
  name: string
  dirtLevel?: string | null
  unusual?: string[] | null
}): number | null {
  const base = baselineMinutesFor(input.name)
  if (base == null) return null
  const mess = MESS_MULTIPLIER[input.dirtLevel ?? 'standard'] ?? 1
  const issues = (input.unusual?.length ?? 0) * MINUTES_PER_ISSUE
  return base * mess + issues
}

// The AI's minutes made safe to price from: a whole number, kept within range
// of the expected time when there is one. Null when the AI gave nothing usable
// (non-number, zero/negative, or wildly implausible with no baseline to fall
// back on).
export function guardTaskMinutes(
  aiMinutes: unknown,
  input: { name: string; dirtLevel?: string | null; unusual?: string[] | null }
): number | null {
  const expected = expectedTaskMinutes(input)
  const raw = typeof aiMinutes === 'string' ? Number(aiMinutes) : aiMinutes
  const usable = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 && raw <= MAX_PLAUSIBLE_TASK_MINUTES

  if (expected == null) return usable ? Math.max(MIN_TASK_MINUTES, Math.round(raw as number)) : null

  // A known task the AI couldn't estimate sensibly gets the expected time.
  if (!usable) return Math.max(MIN_TASK_MINUTES, Math.round(expected))

  const low = expected * LOW_FACTOR
  // When the expected time fits in a Tidy Task, the AI alone can't push it
  // past the 30-minute cap and get a normal job rejected as "too long".
  const high = expected < TIDY_TASK_CAP_MINUTES ? Math.min(expected * HIGH_FACTOR, TIDY_TASK_CAP_MINUTES - 1) : expected * HIGH_FACTOR
  return Math.max(MIN_TASK_MINUTES, Math.round(Math.min(high, Math.max(low, raw as number))))
}
