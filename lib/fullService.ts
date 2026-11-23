// Full-service cleaning: Standard and Deep Cleaning, priced by each Tidy Pro.
//
// The catalog (room types, default room percentages, add-ons, cleaning
// priorities, what each service includes) and the customer's selection.
// Pure and dependency-free so client components can import it. Pricing lives
// in lib/fullServicePricing.ts; each Tidy Pro's rates in lib/fullServiceRates.ts.

import type { TidyProService } from './tidyProServices'

export type FullServiceType = 'standard' | 'deep'

// Whether customers can book Standard / Deep Cleaning yet. Until it's on, Tidy
// Pros can set their prices (Services Provided → Standard & Deep Cleaning
// prices) and the services show "Coming soon" to them. It also shows the
// customer FAQ entries, home page copy and the Terms section about them.
//
// Set NEXT_PUBLIC_FULL_SERVICE_CUSTOMER_ENABLED=true to turn it on: in
// .env.local to test locally, in Vercel to launch. NEXT_PUBLIC_ so client
// components see the same value (it's fixed at build time).
export const FULL_SERVICE_CUSTOMER_ENABLED = process.env.NEXT_PUBLIC_FULL_SERVICE_CUSTOMER_ENABLED === 'true'

export const FULL_SERVICE_TYPES: FullServiceType[] = ['standard', 'deep']

export const FULL_SERVICE_LABEL: Record<FullServiceType, string> = {
  standard: 'Standard Cleaning',
  deep: 'Deep Cleaning',
}

export function isFullServiceType(value: unknown): value is FullServiceType {
  return value === 'standard' || value === 'deep'
}

// The Tidy Pro service a full-service booking needs (lib/tidyProServices).
export function requiredServiceForFullService(type: FullServiceType): TidyProService {
  return type === 'deep' ? 'deepCleaning' : 'standardCleaning'
}

// ── What each service includes ───────────────────────────────────────────────

export const STANDARD_SCOPE: string[] = [
  'Dusting accessible surfaces',
  'Wiping countertops and surfaces',
  'Cleaning sinks and faucets',
  'Cleaning toilets, bathtubs, and showers',
  'Cleaning appliance exteriors',
  'Sweeping and mopping',
  'Vacuuming',
  'Cleaning mirrors',
  'General tidying of accessible surfaces',
]

export const DEEP_EXTRA_SCOPE: string[] = [
  'Detailed baseboard scrubbing',
  'Detailed blinds cleaning',
  'Detailed ceiling fan cleaning',
  'Detailed cleaning of doors and doorframes',
  'Interior wall spot-cleaning',
  'More intensive cleaning of fixtures, edges, corners, and buildup',
]

export const SERVICE_SCOPE: Record<FullServiceType, string[]> = {
  standard: STANDARD_SCOPE,
  deep: [...STANDARD_SCOPE, ...DEEP_EXTRA_SCOPE],
}

export const SCOPE_EXCLUSIONS_NOTE =
  'Inside the refrigerator, oven, cabinets, and drawers are paid add-ons for both Standard and Deep Cleaning.'

// ── Rooms ────────────────────────────────────────────────────────────────────

export type RoomTypeKey =
  | 'kitchen'
  | 'full_bath'
  | 'half_bath'
  | 'bedroom'
  | 'living_room'
  | 'dining_room'
  | 'home_office'
  | 'hallway'

export type RoomType = { key: RoomTypeKey; label: string; plural: string; noun: string }

// `noun` is how the duplicate-task pop-up names the room ("the same bathroom").
export const ROOM_TYPES: RoomType[] = [
  { key: 'kitchen', label: 'Kitchen', plural: 'Kitchens', noun: 'kitchen' },
  { key: 'full_bath', label: 'Full bathroom', plural: 'Full bathrooms', noun: 'bathroom' },
  { key: 'half_bath', label: 'Half bathroom', plural: 'Half bathrooms', noun: 'bathroom' },
  { key: 'bedroom', label: 'Bedroom', plural: 'Bedrooms', noun: 'bedroom' },
  { key: 'living_room', label: 'Living room', plural: 'Living rooms', noun: 'living room' },
  { key: 'dining_room', label: 'Dining room', plural: 'Dining rooms', noun: 'dining room' },
  { key: 'home_office', label: 'Home office', plural: 'Home offices', noun: 'office' },
  { key: 'hallway', label: 'Hallway / entryway', plural: 'Hallways / entryways', noun: 'hallway' },
]

// The built-in room choices in Add Task and on the full-service Tidy Tasks
// step, so a task's room lines up with the cleaning's room types.
export const DEFAULT_TASK_ROOMS: string[] = ROOM_TYPES.map((r) => r.label)

const ROOM_KEYS = new Set<string>(ROOM_TYPES.map((r) => r.key))

export function isRoomTypeKey(value: unknown): value is RoomTypeKey {
  return typeof value === 'string' && ROOM_KEYS.has(value)
}

export function roomType(key: RoomTypeKey): RoomType {
  return ROOM_TYPES.find((r) => r.key === key)!
}

// What cleaning one room costs, as a percentage of the Tidy Pro's full-home
// base rate. Independent room rates, so they don't add up to 100. Tidy Pros
// can change each one; only their changes are stored (lib/fullServiceRates).
const DEFAULT_PERCENTS: Record<RoomTypeKey, number> = {
  kitchen: 30,
  full_bath: 20,
  half_bath: 10,
  bedroom: 15,
  living_room: 20,
  dining_room: 10,
  home_office: 10,
  hallway: 5,
}

export const DEFAULT_ROOM_PERCENTS: Record<FullServiceType, Record<RoomTypeKey, number>> = {
  standard: { ...DEFAULT_PERCENTS },
  deep: { ...DEFAULT_PERCENTS },
}

export const MAX_ROOM_PERCENT = 100
export const MAX_ROOM_QTY = 10

// Tidy Pros set a dollar price for each room; it's stored as a percentage of
// their whole-home price (so a new whole-home price moves every room with it).
export function roomPriceForPercent(baseTakeHome: number, percent: number): number {
  return round2((baseTakeHome * percent) / 100)
}

export function roomPercentForPrice(baseTakeHome: number, price: number): number {
  return Math.round((price / baseTakeHome) * 100 * 10000) / 10000
}

// ── Add-ons ──────────────────────────────────────────────────────────────────

export type AddOnKey =
  | 'inside_fridge'
  | 'inside_freezer'
  | 'inside_oven'
  | 'inside_cabinets'
  | 'inside_drawers'
  | 'interior_windows'
  | 'window_tracks'
  | 'change_linens'
  | 'wash_dishes'
  | 'heavy_pet_hair'
  | 'detailed_baseboards'
  | 'detailed_blinds'
  | 'detailed_ceiling_fan'
  | 'detailed_doors'
  | 'wall_spot_cleaning'

export type AddOn = {
  key: AddOnKey
  label: string
  // Singular unit, shown as "per {unit}".
  unit: string
  unitPlural: string
  // Proposed Atlanta launch price the customer pays. A Tidy Pro's default
  // take-home is 80% of it (defaultTakeHome).
  defaultCustomerPrice: number
  // Standard-only add-ons are part of Deep Cleaning, so they're never sold on Deep.
  services: FullServiceType[]
  maxQty: number
  // Time per unit for the visit-length fallback (lib/aiFullServiceEstimate).
  // Scheduling only; never affects the price.
  fallbackMinutesPerUnit: number
}

const BOTH: FullServiceType[] = ['standard', 'deep']
const STANDARD_ONLY: FullServiceType[] = ['standard']

export const ADD_ONS: AddOn[] = [
  { key: 'inside_fridge', label: 'Inside refrigerator', unit: 'refrigerator', unitPlural: 'refrigerators', defaultCustomerPrice: 45, services: BOTH, maxQty: 3, fallbackMinutesPerUnit: 30 },
  { key: 'inside_freezer', label: 'Inside freezer', unit: 'freezer', unitPlural: 'freezers', defaultCustomerPrice: 25, services: BOTH, maxQty: 3, fallbackMinutesPerUnit: 20 },
  { key: 'inside_oven', label: 'Inside oven', unit: 'oven', unitPlural: 'ovens', defaultCustomerPrice: 45, services: BOTH, maxQty: 3, fallbackMinutesPerUnit: 30 },
  { key: 'inside_cabinets', label: 'Inside cabinets', unit: 'cabinet', unitPlural: 'cabinets', defaultCustomerPrice: 8, services: BOTH, maxQty: 40, fallbackMinutesPerUnit: 5 },
  { key: 'inside_drawers', label: 'Inside drawers', unit: 'drawer', unitPlural: 'drawers', defaultCustomerPrice: 5, services: BOTH, maxQty: 40, fallbackMinutesPerUnit: 3 },
  { key: 'interior_windows', label: 'Interior windows', unit: 'window', unitPlural: 'windows', defaultCustomerPrice: 10, services: BOTH, maxQty: 40, fallbackMinutesPerUnit: 5 },
  { key: 'window_tracks', label: 'Window tracks', unit: 'window', unitPlural: 'windows', defaultCustomerPrice: 5, services: BOTH, maxQty: 40, fallbackMinutesPerUnit: 4 },
  { key: 'change_linens', label: 'Change bed linens', unit: 'bed', unitPlural: 'beds', defaultCustomerPrice: 15, services: BOTH, maxQty: 10, fallbackMinutesPerUnit: 10 },
  { key: 'wash_dishes', label: 'Wash dishes / load dishwasher', unit: 'sink load', unitPlural: 'sink loads', defaultCustomerPrice: 20, services: BOTH, maxQty: 5, fallbackMinutesPerUnit: 20 },
  { key: 'heavy_pet_hair', label: 'Heavy pet hair removal', unit: 'affected room', unitPlural: 'affected rooms', defaultCustomerPrice: 25, services: BOTH, maxQty: 10, fallbackMinutesPerUnit: 15 },
  { key: 'detailed_baseboards', label: 'Detailed baseboard scrubbing', unit: 'room', unitPlural: 'rooms', defaultCustomerPrice: 15, services: STANDARD_ONLY, maxQty: 15, fallbackMinutesPerUnit: 15 },
  { key: 'detailed_blinds', label: 'Detailed blinds cleaning', unit: 'set', unitPlural: 'sets', defaultCustomerPrice: 10, services: STANDARD_ONLY, maxQty: 30, fallbackMinutesPerUnit: 10 },
  { key: 'detailed_ceiling_fan', label: 'Detailed ceiling fan cleaning', unit: 'fan', unitPlural: 'fans', defaultCustomerPrice: 10, services: STANDARD_ONLY, maxQty: 10, fallbackMinutesPerUnit: 10 },
  { key: 'detailed_doors', label: 'Detailed door and doorframe cleaning', unit: 'room', unitPlural: 'rooms', defaultCustomerPrice: 10, services: STANDARD_ONLY, maxQty: 15, fallbackMinutesPerUnit: 10 },
  { key: 'wall_spot_cleaning', label: 'Interior wall spot-cleaning', unit: 'room', unitPlural: 'rooms', defaultCustomerPrice: 15, services: STANDARD_ONLY, maxQty: 15, fallbackMinutesPerUnit: 15 },
]

const ADD_ON_KEYS = new Set<string>(ADD_ONS.map((a) => a.key))

export function isAddOnKey(value: unknown): value is AddOnKey {
  return typeof value === 'string' && ADD_ON_KEYS.has(value)
}

export function addOn(key: AddOnKey): AddOn {
  return ADD_ONS.find((a) => a.key === key)!
}

export function addOnsFor(type: FullServiceType): AddOn[] {
  return ADD_ONS.filter((a) => a.services.includes(type))
}

// ── Cleaning priorities ──────────────────────────────────────────────────────

export type PriorityKey =
  | 'dusting'
  | 'bathroom_fixtures'
  | 'floors'
  | 'kitchen_surfaces'
  | 'mirrors_glass'
  | 'corners_edges'
  | 'surface_dirt'
  | 'tidiness'

// Free. They point the Tidy Pro at what matters most inside the selected
// service; they can't add work to it.
export const PRIORITIES: { key: PriorityKey; label: string }[] = [
  { key: 'dusting', label: 'Focus on dusting.' },
  { key: 'bathroom_fixtures', label: 'Pay special attention to bathroom fixtures.' },
  { key: 'floors', label: 'Prioritize floors.' },
  { key: 'kitchen_surfaces', label: 'Pay special attention to kitchen surfaces.' },
  { key: 'mirrors_glass', label: 'Focus on mirrors and glass.' },
  { key: 'corners_edges', label: 'Pay special attention to corners and edges already included in the selected service.' },
  { key: 'surface_dirt', label: 'Focus on removing visible surface dirt.' },
  { key: 'tidiness', label: 'Prioritize general tidiness.' },
]

const PRIORITY_KEYS = new Set<string>(PRIORITIES.map((p) => p.key))

export function isPriorityKey(value: unknown): value is PriorityKey {
  return typeof value === 'string' && PRIORITY_KEYS.has(value)
}

export function priorityLabel(key: PriorityKey): string {
  return PRIORITIES.find((p) => p.key === key)!.label
}

export const PRIORITIES_COPY = {
  title: 'What does clean look like to you?',
  body: 'Everyone has different cleaning preferences. Let your Tidy Pro know which areas or tasks matter most to you.',
}

export const NOTES_COPY = {
  title: 'Anything else your Tidy Pro should know?',
  body: 'Share special instructions for your selected services. Additional cleaning tasks must be booked separately.',
}

export const ADD_TASKS_COPY = {
  title: 'Want to add Tidy Tasks for other rooms or services?',
  body:
    "You've already selected cleaning for your chosen rooms. If you need something cleaned in another room, or want additional services like laundry or pet enclosure cleaning, you can add them here.",
}

// ── The customer's selection ─────────────────────────────────────────────────

export type FullServiceScope = 'entire_home' | 'rooms'

export const WIZARD_STEPS = ['scope', 'priorities', 'add-ons', 'tasks', 'notes'] as const
export type WizardStep = (typeof WIZARD_STEPS)[number]

export function isWizardStep(value: unknown): value is WizardStep {
  return typeof value === 'string' && (WIZARD_STEPS as readonly string[]).includes(value)
}

// The visit-length estimate, written only by the server (lib/aiFullServiceEstimate).
// Scheduling only; never part of the price.
export type FullServiceEstimate = {
  minutes: number
  source: 'ai' | 'fallback'
  inputHash: string
  at: string
}

export type FullServiceSelection = {
  version: 1
  type: FullServiceType
  scope: FullServiceScope
  // Room type → how many. Used only when scope is 'rooms'.
  rooms: Partial<Record<RoomTypeKey, number>>
  addOns: Partial<Record<AddOnKey, number>>
  priorities: PriorityKey[]
  // Furthest wizard step reached, for resuming and for guarding later steps.
  step: WizardStep
  estimate?: FullServiceEstimate
}

export function emptySelection(type: FullServiceType): FullServiceSelection {
  return { version: 1, type, scope: 'entire_home', rooms: {}, addOns: {}, priorities: [], step: 'scope' }
}

function wholeNumber(value: unknown, max: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(max, Math.floor(n)))
}

function isEstimate(value: unknown): value is FullServiceEstimate {
  if (!value || typeof value !== 'object') return false
  const e = value as Record<string, unknown>
  return (
    typeof e.minutes === 'number' &&
    Number.isFinite(e.minutes) &&
    (e.source === 'ai' || e.source === 'fallback') &&
    typeof e.inputHash === 'string' &&
    typeof e.at === 'string'
  )
}

// Cleans up a stored or submitted selection: unknown keys and zero quantities
// dropped, quantities clamped, add-ons not sold on this service removed (a
// customer who switches Standard → Deep loses the Standard-only ones), and
// priorities deduped in catalog order. Returns null when it isn't a selection.
//
// `keepEstimate` is for selections read back from the database; anything that
// came from a client must be normalized without it so a browser can't plant
// its own visit length.
export function normalizeFullServiceSelection(
  raw: unknown,
  { keepEstimate = false }: { keepEstimate?: boolean } = {}
): FullServiceSelection | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!isFullServiceType(r.type)) return null

  const type = r.type
  const scope: FullServiceScope = r.scope === 'rooms' ? 'rooms' : 'entire_home'

  const rooms: Partial<Record<RoomTypeKey, number>> = {}
  if (r.rooms && typeof r.rooms === 'object') {
    for (const room of ROOM_TYPES) {
      const qty = wholeNumber((r.rooms as Record<string, unknown>)[room.key], MAX_ROOM_QTY)
      if (qty > 0) rooms[room.key] = qty
    }
  }

  const addOns: Partial<Record<AddOnKey, number>> = {}
  if (r.addOns && typeof r.addOns === 'object') {
    for (const a of addOnsFor(type)) {
      const qty = wholeNumber((r.addOns as Record<string, unknown>)[a.key], a.maxQty)
      if (qty > 0) addOns[a.key] = qty
    }
  }

  const chosen = new Set(Array.isArray(r.priorities) ? r.priorities.filter(isPriorityKey) : [])
  const priorities = PRIORITIES.map((p) => p.key).filter((k) => chosen.has(k))

  const step: WizardStep = isWizardStep(r.step) ? r.step : 'scope'

  return {
    version: 1,
    type,
    scope,
    rooms: scope === 'rooms' ? rooms : {},
    addOns,
    priorities,
    step,
    ...(keepEstimate && isEstimate(r.estimate) ? { estimate: r.estimate } : {}),
  }
}

// Ready to price: the whole home, or at least one room.
export function isCompleteSelection(sel: FullServiceSelection | null | undefined): sel is FullServiceSelection {
  if (!sel) return false
  if (sel.scope === 'entire_home') return true
  return Object.values(sel.rooms).some((qty) => (qty ?? 0) > 0)
}

export function selectedRooms(sel: FullServiceSelection): { room: RoomType; quantity: number }[] {
  if (sel.scope !== 'rooms') return []
  return ROOM_TYPES.filter((r) => (sel.rooms[r.key] ?? 0) > 0).map((room) => ({ room, quantity: sel.rooms[room.key]! }))
}

export function selectedAddOns(sel: FullServiceSelection): { addOn: AddOn; quantity: number }[] {
  return addOnsFor(sel.type)
    .filter((a) => (sel.addOns[a.key] ?? 0) > 0)
    .map((a) => ({ addOn: a, quantity: sel.addOns[a.key]! }))
}

export function quantityLabel(quantity: number, singular: string, plural: string): string {
  return `${quantity} ${quantity === 1 ? singular : plural}`
}

export function scopeLabel(sel: FullServiceSelection): string {
  if (sel.scope === 'entire_home') return 'Entire home'
  const rooms = selectedRooms(sel)
  if (rooms.length === 0) return 'No rooms chosen'
  return rooms
    .map(({ room, quantity }) => quantityLabel(quantity, room.label.toLowerCase(), room.plural.toLowerCase()))
    .join(', ')
}

// "Standard Cleaning · Entire home" / "Deep Cleaning · 1 kitchen, 2 full bathrooms"
export function selectionLabel(sel: FullServiceSelection): string {
  return `${FULL_SERVICE_LABEL[sel.type]} · ${scopeLabel(sel)}`
}

// ── Money ────────────────────────────────────────────────────────────────────

// The Tidy Pro's share of the Service Price (lib/pricingRules CLEANER_PAYOUT_RATE).
// Duplicated here rather than imported so this module stays dependency-free;
// lib/fullService.test.ts checks the two agree.
export const FULL_SERVICE_PAYOUT_RATE = 0.8

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// Tidy Pros enter what they want to take home; the customer pays that grossed
// up by Tydio's 20%, so the 80/20 split leaves the Tidy Pro their number.
export function customerPriceForTakeHome(takeHome: number): number {
  return round2(takeHome / FULL_SERVICE_PAYOUT_RATE)
}

export function defaultTakeHome(customerPrice: number): number {
  return round2(customerPrice * FULL_SERVICE_PAYOUT_RATE)
}

export const MIN_BASE_TAKE_HOME = 20
export const MAX_BASE_TAKE_HOME = 2000
export const MAX_ADD_ON_TAKE_HOME = 500

// ── Checklist rows (booking_tasks) ───────────────────────────────────────────

export type FullServiceChecklistKind = 'full_service_home' | 'full_service_room' | 'full_service_addon'

export type FullServiceChecklistRow = {
  name: string
  category: string
  kind: FullServiceChecklistKind
  // This row's share of the Service Price, so an unfinished room or add-on can
  // be refunded on its own (ICA Schedule A, "Unfinished work and task photos").
  servicePrice: number
}

// One row for the whole home, or one per room ("Full bathroom 1 of 2"), plus
// one per add-on. `lines` are the priced lines from priceFullService; a room
// line's price is split evenly across its rooms, with any leftover cent on the
// last one so the rows add up to the line exactly.
export function fullServiceChecklistRows(
  type: FullServiceType,
  lines: { kind: 'home' | 'room' | 'addon'; key: string; label: string; quantity: number; customer_price: number }[]
): FullServiceChecklistRow[] {
  const category = FULL_SERVICE_LABEL[type]
  const rows: FullServiceChecklistRow[] = []
  for (const line of lines) {
    if (line.kind === 'home') {
      rows.push({ name: `${category}: Entire home`, category, kind: 'full_service_home', servicePrice: line.customer_price })
    } else if (line.kind === 'room') {
      const each = Math.floor((line.customer_price / line.quantity) * 100) / 100
      for (let i = 1; i <= line.quantity; i++) {
        const price = i === line.quantity ? round2(line.customer_price - each * (line.quantity - 1)) : each
        const name = line.quantity === 1 ? line.label : `${line.label} ${i} of ${line.quantity}`
        rows.push({ name, category, kind: 'full_service_room', servicePrice: price })
      }
    } else {
      const name = line.quantity === 1 ? line.label : `${line.label} ×${line.quantity}`
      rows.push({ name, category, kind: 'full_service_addon', servicePrice: line.customer_price })
    }
  }
  return rows
}
