// Server-side glue for bookings with Standard / Deep Cleaning: one Tidy Pro's
// quote, the visit length, the snapshot kept on the booking, and its checklist
// rows. Shared by checkout (lib/placeBooking), search, recurring visits and
// replacements so each Tidy Pro is always priced with their own rates.

import type { createAdminClient } from '@/lib/supabase/admin'
import type { SquareFootage } from '@/lib/squareFootage'
import {
  FULL_SERVICE_LABEL,
  fullServiceChecklistRows,
  isCompleteSelection,
  normalizeFullServiceSelection,
  type FullServiceSelection,
} from '@/lib/fullService'
import { loadRates, loadRatesFor, type FullServiceRates } from '@/lib/fullServiceRates'
import { priceFullService, tryPriceFullService, type FullServiceQuote } from '@/lib/fullServicePricing'
import {
  cachedEstimateMinutes,
  estimateFullServiceMinutes,
  fallbackFullServiceMinutes,
} from '@/lib/aiFullServiceEstimate'

type Admin = ReturnType<typeof createAdminClient>

export const HOME_SIZE_REQUIRED_MESSAGE = 'Please add your home’s size to book. Go back to the schedule step to add it.'
export const FULL_SERVICE_UNAVAILABLE_MESSAGE =
  'This Tidy Pro doesn’t offer every part of this cleaning anymore. Please go back and choose another Tidy Pro.'

// What a booking keeps about its Standard / Deep Cleaning: what was chosen,
// what it cost with the rates used, and how long it was expected to take.
export type FullServiceSnapshot = FullServiceQuote & {
  selection: Omit<FullServiceSelection, 'step' | 'estimate'>
  duration_minutes: number
  duration_source: 'ai' | 'fallback'
}

// A stored selection (draft, recurring series), or null when there's none or
// it isn't complete enough to book.
export function bookableSelection(raw: unknown): FullServiceSelection | null {
  const sel = normalizeFullServiceSelection(raw, { keepEstimate: true })
  return isCompleteSelection(sel) ? sel : null
}

export function readSnapshot(raw: unknown): FullServiceSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Partial<FullServiceSnapshot>
  if (!s.selection || !Array.isArray(s.lines) || typeof s.customer_total !== 'number') return null
  return s as FullServiceSnapshot
}

// The visit length for this selection: the cached estimate while it still
// matches, otherwise a fresh AI estimate (with its timeout and formula
// fallback), or just the formula where the AI must not be waited on.
export async function fullServiceMinutes(
  sel: FullServiceSelection,
  squareFootage: SquareFootage | null,
  { allowAi = true }: { allowAi?: boolean } = {}
): Promise<{ minutes: number; source: 'ai' | 'fallback' }> {
  const cached = cachedEstimateMinutes(sel, squareFootage)
  if (cached != null) return { minutes: cached, source: sel.estimate!.source }
  if (!allowAi) return { minutes: fallbackFullServiceMinutes(sel, squareFootage), source: 'fallback' }
  return estimateFullServiceMinutes(sel, squareFootage)
}

export async function quoteForTidyPro(
  admin: Admin,
  tidyProId: string,
  sel: FullServiceSelection,
  squareFootage: SquareFootage | null
): Promise<FullServiceQuote | null> {
  return tryPriceFullService(sel, await loadRates(admin, tidyProId), squareFootage)
}

// Each Tidy Pro's quote, for search results. A Tidy Pro who can't do it (not
// priced, an add-on switched off) is missing from the map.
export async function quotesForTidyPros(
  admin: Admin,
  tidyProIds: string[],
  sel: FullServiceSelection,
  squareFootage: SquareFootage | null
): Promise<Map<string, FullServiceQuote>> {
  const rates = await loadRatesFor(admin, tidyProIds)
  const quotes = new Map<string, FullServiceQuote>()
  for (const [id, r] of rates) {
    const quote = tryPriceFullService(sel, r, squareFootage)
    if (quote) quotes.set(id, quote)
  }
  return quotes
}

export function priceWithRates(sel: FullServiceSelection, rates: FullServiceRates, squareFootage: SquareFootage | null) {
  return priceFullService(sel, rates, squareFootage)
}

export function buildSnapshot(
  sel: FullServiceSelection,
  quote: FullServiceQuote,
  duration: { minutes: number; source: 'ai' | 'fallback' }
): FullServiceSnapshot {
  const { step: _step, estimate: _estimate, ...selection } = sel
  void _step
  void _estimate
  return { ...quote, selection, duration_minutes: duration.minutes, duration_source: duration.source }
}

// A draft's cleaning as it would be booked with this Tidy Pro (their price and
// the visit length), or null when they can't do it.
export async function snapshotForTidyPro(
  admin: Admin,
  tidyProId: string,
  sel: FullServiceSelection,
  squareFootage: SquareFootage | null
): Promise<FullServiceSnapshot | null> {
  const quote = await quoteForTidyPro(admin, tidyProId, sel, squareFootage)
  return quote ? buildSnapshot(sel, quote, await fullServiceMinutes(sel, squareFootage)) : null
}

// booking_tasks rows for the Tidy Pro's checklist: the whole home or one per
// room, and one per add-on, each with its share of the Service Price.
export function checklistInsertRows(bookingId: string, snapshot: FullServiceSnapshot) {
  return fullServiceChecklistRows(snapshot.type, snapshot.lines).map((row) => ({
    booking_id: bookingId,
    task_name: row.name,
    task_category: row.category,
    task_icon: 'full_service',
    kind: row.kind,
    service_price: row.servicePrice,
    is_completed: false,
  }))
}

export function fullServiceLabel(snapshot: Pick<FullServiceSnapshot, 'type'> | null | undefined): string | null {
  return snapshot ? FULL_SERVICE_LABEL[snapshot.type] : null
}
