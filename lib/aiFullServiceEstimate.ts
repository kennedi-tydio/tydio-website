// How long a Standard / Deep Cleaning visit should take, for the calendar only:
// conflicts, time off, reminders and the booking's estimated_duration_minutes.
// The price never depends on it (lib/fullServicePricing.ts takes no minutes).
//
// The AI estimates from the booking details (service, home size, rooms and
// quantities, add-ons, priorities). Its answer is kept within a sensible range
// of a fixed formula, and the formula is used outright whenever the AI is
// unavailable, slow or returns nonsense, so a booking always gets a length.
// The estimate is cached on the selection, keyed by a hash of its inputs, so
// it's worked out once per selection and the same everywhere after.

import { createHash } from 'node:crypto'
import OpenAI from 'openai'
import type { createAdminClient } from '@/lib/supabase/admin'
import { squareFootageLabel, type SquareFootage } from '@/lib/squareFootage'
import {
  FULL_SERVICE_LABEL,
  priorityLabel,
  selectedAddOns,
  selectedRooms,
  type FullServiceEstimate,
  type FullServiceSelection,
  type FullServiceType,
  type RoomTypeKey,
} from '@/lib/fullService'

type Admin = ReturnType<typeof createAdminClient>

// Bump when the prompt or the fallback table changes, so cached estimates are redone.
export const ESTIMATE_VERSION = 'fs-1'

// ── Fallback formula ─────────────────────────────────────────────────────────

const ENTIRE_HOME_MINUTES: Record<FullServiceType, number> = { standard: 150, deep: 270 }

const ROOM_MINUTES: Record<RoomTypeKey, Record<FullServiceType, number>> = {
  kitchen: { standard: 40, deep: 70 },
  full_bath: { standard: 30, deep: 55 },
  half_bath: { standard: 15, deep: 25 },
  bedroom: { standard: 20, deep: 35 },
  living_room: { standard: 25, deep: 40 },
  dining_room: { standard: 15, deep: 25 },
  home_office: { standard: 15, deep: 25 },
  hallway: { standard: 10, deep: 15 },
}

// A bigger home takes longer to clean, room for room. Steeper than the price
// multiplier (lib/pricingRules SQUARE_FOOTAGE_MULTIPLIER) on purpose: this is
// time, not money.
const TIME_MULTIPLIER: Record<SquareFootage, number> = {
  under_1000: 1.0,
  '1000_1999': 1.25,
  '2000_2999': 1.5,
  '3000_plus': 1.8,
}

export const MIN_VISIT_MINUTES = 60
export const MAX_VISIT_MINUTES = 720

function roundUpTo15(minutes: number): number {
  return Math.ceil(minutes / 15) * 15
}

export function fallbackFullServiceMinutes(sel: FullServiceSelection, squareFootage: SquareFootage | null): number {
  const sizeFactor = squareFootage ? TIME_MULTIPLIER[squareFootage] : TIME_MULTIPLIER['1000_1999']
  const cleaning =
    sel.scope === 'entire_home'
      ? ENTIRE_HOME_MINUTES[sel.type]
      : selectedRooms(sel).reduce((sum, { room, quantity }) => sum + ROOM_MINUTES[room.key][sel.type] * quantity, 0)
  const addOns = selectedAddOns(sel).reduce((sum, { addOn, quantity }) => sum + addOn.fallbackMinutesPerUnit * quantity, 0)
  const total = roundUpTo15(cleaning * sizeFactor + addOns)
  return Math.min(MAX_VISIT_MINUTES, Math.max(MIN_VISIT_MINUTES, total))
}

// The AI's answer, kept within 0.6× to 1.75× of the formula and the overall
// limits, rounded up to 15 minutes. Anything that isn't a number is the formula.
export function clampEstimate(aiMinutes: unknown, fallback: number): number {
  if (typeof aiMinutes !== 'number' || !Number.isFinite(aiMinutes) || aiMinutes <= 0) return fallback
  const low = Math.max(MIN_VISIT_MINUTES, fallback * 0.6)
  const high = Math.min(MAX_VISIT_MINUTES, fallback * 1.75)
  return Math.min(MAX_VISIT_MINUTES, Math.max(MIN_VISIT_MINUTES, roundUpTo15(Math.min(high, Math.max(low, aiMinutes)))))
}

// ── Inputs and cache key ─────────────────────────────────────────────────────

// Only the structured choices go to the AI. The customer's notes are left out:
// they can't change what's booked, and free text could try to steer the answer.
export function fullServiceEstimateInput(sel: FullServiceSelection, squareFootage: SquareFootage | null) {
  return {
    service: sel.type,
    squareFootage,
    scope: sel.scope,
    rooms: selectedRooms(sel).map(({ room, quantity }) => [room.key, quantity] as const),
    addOns: selectedAddOns(sel).map(({ addOn, quantity }) => [addOn.key, quantity] as const),
    priorities: [...sel.priorities],
  }
}

export function estimateInputHash(sel: FullServiceSelection, squareFootage: SquareFootage | null): string {
  const input = JSON.stringify({ v: ESTIMATE_VERSION, ...fullServiceEstimateInput(sel, squareFootage) })
  return createHash('sha256').update(input).digest('hex').slice(0, 32)
}

// The cached estimate's minutes when it still matches this selection and home
// size, re-clamped in case the stored value was tampered with or the limits
// changed; otherwise null.
export function cachedEstimateMinutes(sel: FullServiceSelection, squareFootage: SquareFootage | null): number | null {
  const est = sel.estimate
  if (!est || est.inputHash !== estimateInputHash(sel, squareFootage)) return null
  return clampEstimate(est.minutes, fallbackFullServiceMinutes(sel, squareFootage))
}

// No AI: the cached estimate when it matches, else the formula. For places
// that must never wait on the AI (recurring visits booked by the cron).
export function fullServiceMinutesWithoutAi(sel: FullServiceSelection, squareFootage: SquareFootage | null): number {
  return cachedEstimateMinutes(sel, squareFootage) ?? fallbackFullServiceMinutes(sel, squareFootage)
}

// ── AI ───────────────────────────────────────────────────────────────────────

// Constructed lazily, like lib/aiTaskEstimate, so importing this never needs a key.
let openai: OpenAI | null = null
function getOpenAI(): OpenAI {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return openai
}

export const ESTIMATE_TIMEOUT_MS = 6000

function describe(sel: FullServiceSelection, squareFootage: SquareFootage | null): string {
  const rooms =
    sel.scope === 'entire_home'
      ? 'The entire home'
      : selectedRooms(sel)
          .map(({ room, quantity }) => `${quantity} × ${room.label}`)
          .join(', ')
  const addOns = selectedAddOns(sel)
    .map(({ addOn, quantity }) => `${quantity} × ${addOn.label} (per ${addOn.unit})`)
    .join(', ')
  return [
    `Service: ${FULL_SERVICE_LABEL[sel.type]}`,
    `Home size: ${squareFootageLabel(squareFootage) ?? 'unknown'}`,
    `Rooms: ${rooms}`,
    `Add-ons: ${addOns || 'none'}`,
    `Customer priorities (no extra work, just focus): ${sel.priorities.map(priorityLabel).join(' ') || 'none'}`,
  ].join('\n')
}

export async function estimateFullServiceMinutes(
  sel: FullServiceSelection,
  squareFootage: SquareFootage | null,
  { timeoutMs = ESTIMATE_TIMEOUT_MS }: { timeoutMs?: number } = {}
): Promise<{ minutes: number; source: 'ai' | 'fallback' }> {
  const fallback = fallbackFullServiceMinutes(sel, squareFootage)
  if (!process.env.OPENAI_API_KEY) return { minutes: fallback, source: 'fallback' }
  try {
    const completion = await getOpenAI().chat.completions.create(
      {
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You estimate how long one professional house cleaner takes to complete a residential cleaning job, for scheduling. ' +
              'Standard Cleaning: dusting accessible surfaces, wiping counters and surfaces, sinks and faucets, toilets, tubs and showers, appliance exteriors, sweeping and mopping, vacuuming, mirrors, general tidying. ' +
              'Deep Cleaning: all of that plus detailed baseboards, blinds, ceiling fans, doors and doorframes, wall spot-cleaning, and more intensive work on fixtures, edges, corners and buildup. ' +
              'Add-ons are extra work on top. Priorities only change focus, not the amount of work. ' +
              'Reply with JSON only: {"minutes": <whole number of minutes for one cleaner>}.',
          },
          { role: 'user', content: describe(sel, squareFootage) },
        ],
      },
      { timeout: timeoutMs, maxRetries: 0 }
    )
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as { minutes?: unknown }
    const minutes = typeof parsed.minutes === 'string' ? Number(parsed.minutes) : parsed.minutes
    if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) return { minutes: fallback, source: 'fallback' }
    return { minutes: clampEstimate(minutes, fallback), source: 'ai' }
  } catch (err) {
    console.error('Full-service duration estimate failed; using the formula', err)
    return { minutes: fallback, source: 'fallback' }
  }
}

export async function freshEstimate(sel: FullServiceSelection, squareFootage: SquareFootage | null): Promise<FullServiceEstimate> {
  const { minutes, source } = await estimateFullServiceMinutes(sel, squareFootage)
  return { minutes, source, inputHash: estimateInputHash(sel, squareFootage), at: new Date().toISOString() }
}

// The visit length for this selection: the cached estimate when it still
// matches, otherwise a fresh one, written back onto the draft's selection so
// every later step uses the same number.
export async function ensureFullServiceEstimate(
  admin: Admin,
  draftId: string,
  sel: FullServiceSelection,
  squareFootage: SquareFootage | null
): Promise<{ minutes: number; estimate: FullServiceEstimate }> {
  const cached = cachedEstimateMinutes(sel, squareFootage)
  if (cached != null && sel.estimate) return { minutes: cached, estimate: { ...sel.estimate, minutes: cached } }

  const estimate = await freshEstimate(sel, squareFootage)
  const { error } = await admin
    .from('booking_drafts')
    .update({ full_service: { ...sel, estimate } as never })
    .eq('id', draftId)
  if (error) console.error('Failed to save the full-service estimate', error)
  return { minutes: estimate.minutes, estimate }
}
