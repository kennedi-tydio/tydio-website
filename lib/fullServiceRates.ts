// Each Tidy Pro's Standard / Deep Cleaning rates (tidypro_full_service_rates,
// migration 085). They enter what they take home; customers pay it ÷ 0.8.
//
// Room prices are stored as percentages of the base rate (only the ones the
// Tidy Pro changed from Tydio's defaults), so they follow the base rate when it
// changes. Add-ons default to offered at 80% of the catalog price.

import type { createAdminClient } from '@/lib/supabase/admin'
import {
  ADD_ONS,
  DEFAULT_ROOM_PERCENTS,
  FULL_SERVICE_TYPES,
  MAX_ADD_ON_TAKE_HOME,
  MAX_BASE_TAKE_HOME,
  MAX_ROOM_PERCENT,
  MIN_BASE_TAKE_HOME,
  ROOM_TYPES,
  defaultTakeHome,
  isAddOnKey,
  isRoomTypeKey,
  round2,
  selectedAddOns,
  type AddOnKey,
  type FullServiceSelection,
  type FullServiceType,
  type RoomTypeKey,
} from '@/lib/fullService'
import { normalizeServices, type TidyProService } from '@/lib/tidyProServices'

type Admin = ReturnType<typeof createAdminClient>

export type ServiceRates = {
  baseTakeHome: number
  roomPercents: Record<RoomTypeKey, number>
}

export type AddOnRate = { enabled: boolean; takeHome: number }

export type FullServiceRates = {
  standard: ServiceRates | null
  deep: ServiceRates | null
  addOns: Record<AddOnKey, AddOnRate>
}

export type FullServiceRatesRow = {
  tidy_pro_id?: string
  standard_base_take_home: number | string | null
  deep_base_take_home: number | string | null
  standard_room_percents: unknown
  deep_room_percents: unknown
  add_ons: unknown
}

function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  return Number.isFinite(n) ? n : null
}

function validBase(value: unknown): number | null {
  const n = num(value)
  return n != null && n >= MIN_BASE_TAKE_HOME && n <= MAX_BASE_TAKE_HOME ? round2(n) : null
}

// Tidy Pros enter a dollar price for each room; it's kept as that price's
// percentage of their whole-home price, to 4 decimal places so the dollars
// they typed come back to the cent (lib/fullService roomPercentForPrice).
function validPercent(value: unknown): number | null {
  const n = num(value)
  return n != null && n > 0 && n <= MAX_ROOM_PERCENT ? Math.round(n * 10000) / 10000 : null
}

function validAddOnTakeHome(value: unknown): number | null {
  const n = num(value)
  return n != null && n > 0 && n <= MAX_ADD_ON_TAKE_HOME ? round2(n) : null
}

// Stored overrides → every room's percentage.
export function resolveRoomPercents(type: FullServiceType, overrides: unknown): Record<RoomTypeKey, number> {
  const out = { ...DEFAULT_ROOM_PERCENTS[type] }
  if (overrides && typeof overrides === 'object') {
    for (const [key, value] of Object.entries(overrides as Record<string, unknown>)) {
      const pct = validPercent(value)
      if (isRoomTypeKey(key) && pct != null) out[key] = pct
    }
  }
  return out
}

export function resolveAddOns(stored: unknown): Record<AddOnKey, AddOnRate> {
  const out = {} as Record<AddOnKey, AddOnRate>
  const raw = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {}
  for (const a of ADD_ONS) {
    const entry = raw[a.key] && typeof raw[a.key] === 'object' ? (raw[a.key] as Record<string, unknown>) : {}
    out[a.key] = {
      enabled: entry.enabled !== false,
      takeHome: validAddOnTakeHome(entry.take_home) ?? defaultTakeHome(a.defaultCustomerPrice),
    }
  }
  return out
}

// A stored row (or none) → the rates used for pricing. A service without a
// base rate is null: the Tidy Pro hasn't priced it, so they can't be booked for it.
export function resolveRates(row: FullServiceRatesRow | null | undefined): FullServiceRates {
  const standardBase = validBase(row?.standard_base_take_home)
  const deepBase = validBase(row?.deep_base_take_home)
  return {
    standard: standardBase == null ? null : { baseTakeHome: standardBase, roomPercents: resolveRoomPercents('standard', row?.standard_room_percents) },
    deep: deepBase == null ? null : { baseTakeHome: deepBase, roomPercents: resolveRoomPercents('deep', row?.deep_room_percents) },
    addOns: resolveAddOns(row?.add_ons),
  }
}

// Whether this Tidy Pro has priced the selection's service and offers every
// add-on in it.
export function canPerform(rates: FullServiceRates, sel: FullServiceSelection): boolean {
  if (!rates[sel.type]) return false
  return selectedAddOns(sel).every(({ addOn }) => rates.addOns[addOn.key].enabled)
}

// The full-service services a Tidy Pro has said they offer but not priced yet.
// Each is a required step (lib/cleanerOnboarding), and until it's done they're
// only kept out of full-service bookings, not every booking.
export function unpricedFullServices(servicesProvided: unknown, rates: FullServiceRates): FullServiceType[] {
  const offered = new Set<TidyProService>(normalizeServices(servicesProvided))
  return FULL_SERVICE_TYPES.filter((t) => offered.has(t === 'deep' ? 'deepCleaning' : 'standardCleaning') && !rates[t])
}

// Standard and Deep Cleaning can only be saved as services provided once
// they have prices. The message for offering one (or both) without them.
export function missingPricesMessage(unpriced: readonly FullServiceType[]): string | null {
  if (unpriced.length === 0) return null
  if (unpriced.length === 2) return 'Set your Standard and Deep Cleaning prices before adding them to your services. Tap Set prices on each one.'
  const label = unpriced[0] === 'deep' ? 'Deep Cleaning' : 'Standard Cleaning'
  return `Set your ${label} prices before adding it to your services. Tap Set prices on it.`
}

const SELECT = 'tidy_pro_id, standard_base_take_home, deep_base_take_home, standard_room_percents, deep_room_percents, add_ons'

export async function loadRatesRow(admin: Admin, tidyProId: string): Promise<FullServiceRatesRow | null> {
  const { data, error } = await admin.from('tidypro_full_service_rates').select(SELECT).eq('tidy_pro_id', tidyProId).maybeSingle()
  if (error) throw new Error(`Failed to load full-service rates: ${error.message}`)
  return data
}

export async function loadRates(admin: Admin, tidyProId: string): Promise<FullServiceRates> {
  return resolveRates(await loadRatesRow(admin, tidyProId))
}

// For pages that only show whether prices are set (the Tidy Pro dashboard's
// requested actions): a failed read counts as "not priced yet" instead of
// breaking the page. Never used to price or match a booking.
export async function loadRatesForDisplay(admin: Admin, tidyProId: string): Promise<FullServiceRates> {
  try {
    return await loadRates(admin, tidyProId)
  } catch (err) {
    console.error(err)
    return resolveRates(null)
  }
}

// Rates for several Tidy Pros at once. Everyone asked for is in the map;
// someone with no row gets no priced services.
export async function loadRatesFor(admin: Admin, tidyProIds: string[]): Promise<Map<string, FullServiceRates>> {
  const ids = Array.from(new Set(tidyProIds))
  const map = new Map<string, FullServiceRates>()
  if (ids.length === 0) return map
  const { data, error } = await admin.from('tidypro_full_service_rates').select(SELECT).in('tidy_pro_id', ids)
  if (error) throw new Error(`Failed to load full-service rates: ${error.message}`)
  const rows = new Map((data ?? []).map((r) => [r.tidy_pro_id, r]))
  for (const id of ids) map.set(id, resolveRates(rows.get(id) ?? null))
  return map
}

// ── Saving (from the Tidy Pro pricing page) ──────────────────────────────────

export type RatesInput = {
  standardBaseTakeHome: number | null
  deepBaseTakeHome: number | null
  standardRoomPercents: Partial<Record<RoomTypeKey, number>>
  deepRoomPercents: Partial<Record<RoomTypeKey, number>>
  addOns: Partial<Record<AddOnKey, { enabled: boolean; takeHome: number | null }>>
}

// Validates what the pricing page sent and turns it into a row: only the room
// percentages and add-ons that differ from the defaults are stored.
export function ratesRowFromInput(input: RatesInput): { row?: Omit<FullServiceRatesRow, 'tidy_pro_id'>; error?: string } {
  const bases: Record<FullServiceType, number | null> = { standard: null, deep: null }
  for (const type of FULL_SERVICE_TYPES) {
    const raw = type === 'standard' ? input.standardBaseTakeHome : input.deepBaseTakeHome
    if (raw == null) continue
    const base = validBase(raw)
    if (base == null) return { error: `Enter a price between $${MIN_BASE_TAKE_HOME} and $${MAX_BASE_TAKE_HOME}.` }
    bases[type] = base
  }

  const roomOverrides = (type: FullServiceType): Record<string, number> | { error: string } => {
    const raw = (type === 'standard' ? input.standardRoomPercents : input.deepRoomPercents) ?? {}
    const out: Record<string, number> = {}
    for (const room of ROOM_TYPES) {
      const value = raw[room.key]
      if (value == null) continue
      const pct = validPercent(value)
      if (pct == null) return { error: 'Each room price must be more than $0 and no more than your whole-home price.' }
      if (Math.abs(pct - DEFAULT_ROOM_PERCENTS[type][room.key]) > 0.00005) out[room.key] = pct
    }
    return out
  }
  const standardRooms = roomOverrides('standard')
  if ('error' in standardRooms) return { error: standardRooms.error as string }
  const deepRooms = roomOverrides('deep')
  if ('error' in deepRooms) return { error: deepRooms.error as string }

  const addOns: Record<string, { enabled: boolean; take_home: number | null }> = {}
  for (const [key, value] of Object.entries(input.addOns ?? {})) {
    if (!isAddOnKey(key) || !value) continue
    const a = ADD_ONS.find((x) => x.key === key)!
    let takeHome: number | null = null
    if (value.takeHome != null) {
      takeHome = validAddOnTakeHome(value.takeHome)
      if (takeHome == null) return { error: `Add-on prices must be more than $0 and at most $${MAX_ADD_ON_TAKE_HOME}.` }
      if (takeHome === defaultTakeHome(a.defaultCustomerPrice)) takeHome = null
    }
    const enabled = value.enabled !== false
    if (enabled && takeHome == null) continue
    addOns[key] = { enabled, take_home: takeHome }
  }

  return {
    row: {
      standard_base_take_home: bases.standard,
      deep_base_take_home: bases.deep,
      standard_room_percents: standardRooms,
      deep_room_percents: deepRooms,
      add_ons: addOns,
    },
  }
}
