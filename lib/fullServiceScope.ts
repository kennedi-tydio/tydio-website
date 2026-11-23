// Duplicate-cleaning checks for Tidy Tasks added alongside a Standard / Deep
// Cleaning. Tasks are never removed from the saved list (ones that can't be
// added at all are hidden on the booking's task step; see canAddWithCleaning).
// When one looks like it's for a
// room the cleaning already covers, the customer is asked (same room or a
// different one), so they don't pay twice for the same work but can still book
// it for another room. Laundry, laundromat, pet enclosure and litter box tasks
// are separate services and never prompt.
//
// Tidy Tasks are free text, so this works from keywords. It only decides which
// question to ask; the customer's answer decides what's added.
//
// Pure and dependency-light so client components can import it.

import { isLaundryTaskName } from './laundry'
import { isPetTask, petTaskKindFromName, type PetTaskDetails } from './petTasks'
import {
  FULL_SERVICE_LABEL,
  addOn,
  roomType,
  type AddOnKey,
  type FullServiceSelection,
  type FullServiceType,
  type RoomTypeKey,
} from './fullService'

export type OverlapTask = {
  name: string
  room: string
  laundryService?: unknown
  laundryLoads?: unknown
  pet?: PetTaskDetails | null
}

// Laundry by name too ("Wash and dry towels", "Fold clothes"), since neither
// cleaning includes it. Sheets and bedding stay with the change-linens add-on.
const LAUNDRY_NAME_RE =
  /\blaundr|\blaundromat|\bwash(?:ing)?\s*(?:and|&|\+|\/)\s*dry|\b(?:wash|dry|fold|iron)\w*\s+(?:\w+\s+)?(?:clothes|clothing|towels?|shirts?|pants|socks|loads?)\b/i

// Laundry, laundromat, pet enclosure and litter box tasks are never part of a
// Standard / Deep Cleaning. Checked by name as well as by saved details, so a
// task typed as "Wash litterbox" is never called "already included".
export function isExemptFromOverlap(task: OverlapTask): boolean {
  return (
    !!task.laundryService ||
    !!task.laundryLoads ||
    isPetTask(task) ||
    petTaskKindFromName(task.name) != null ||
    isLaundryTaskName(task.name) ||
    LAUNDRY_NAME_RE.test(task.name)
  )
}

const ENTIRE_HOME_RE = /^entire home$/i

const ROOM_PATTERNS: { re: RegExp; rooms: RoomTypeKey[] }[] = [
  { re: /kitchen/i, rooms: ['kitchen'] },
  { re: /bath|restroom|powder|washroom|toilet|lavatory|\bwc\b/i, rooms: ['full_bath', 'half_bath'] },
  { re: /bed ?room|nursery|guest ?room|kids?'? ?room|master|primary suite/i, rooms: ['bedroom'] },
  { re: /living|family ?room|\bden\b|lounge|great ?room|sitting ?room/i, rooms: ['living_room'] },
  { re: /dining/i, rooms: ['dining_room'] },
  { re: /office|study/i, rooms: ['home_office'] },
  { re: /hall|entry|foyer|mud ?room|stair|landing/i, rooms: ['hallway'] },
]

// The full-service room types a Tidy Task's room could be. 'all' for an
// Entire home task; null for a room that isn't one of them (a garage, a
// custom room with another name).
export function roomTypesForTaskRoom(room: string): RoomTypeKey[] | 'all' | null {
  const r = room.trim()
  if (ENTIRE_HOME_RE.test(r)) return 'all'
  for (const { re, rooms } of ROOM_PATTERNS) if (re.test(r)) return rooms
  return null
}

// Task wording that matches a catalog add-on. Checked in this order, so the
// more specific ones win ("window tracks" before "windows").
const ADD_ON_PATTERNS: { key: AddOnKey; re: RegExp; unless?: RegExp }[] = [
  { key: 'inside_freezer', re: /freezer/i, unless: /exterior|outside|front|handle/i },
  { key: 'inside_fridge', re: /fridge|refrigerator/i, unless: /exterior|outside|front|door|handle|top of/i },
  { key: 'inside_oven', re: /\boven\b/i, unless: /exterior|outside|door|handle|stove ?top|cook ?top|microwave|toaster/i },
  { key: 'inside_cabinets', re: /cabinet|cupboard/i, unless: /^(?!.*(inside|interior|clean out|wipe out|empty|shelves|shelf)).*$/i },
  { key: 'inside_drawers', re: /drawer/i, unless: /^(?!.*(inside|interior|clean out|wipe out|empty)).*$/i },
  { key: 'window_tracks', re: /window ?(sill )?tracks?|sliding door tracks?/i },
  { key: 'interior_windows', re: /window/i, unless: /exterior|outside|outdoor|sill|blind/i },
  { key: 'change_linens', re: /linen|sheets|bedding|make (the |my )?beds?|change (the |my )?beds?/i, unless: /\b(fold|iron|wash|launder|dry)/i },
  { key: 'wash_dishes', re: /dish|dishwasher/i },
  { key: 'heavy_pet_hair', re: /(pet|dog|cat) hair|\bfur\b/i },
  { key: 'detailed_baseboards', re: /baseboard/i },
  { key: 'detailed_blinds', re: /blinds?\b/i },
  { key: 'detailed_ceiling_fan', re: /ceiling fan|\bfans?\b/i },
  { key: 'detailed_doors', re: /door ?frames?|\bdoors?\b/i, unless: /cabinet|fridge|refrigerator|oven|microwave|shower|closet|garage|sliding door track/i },
  { key: 'wall_spot_cleaning', re: /\bwalls?\b/i, unless: /wash (the |all )?walls|paint/i },
]

export function matchAddOn(taskName: string): AddOnKey | null {
  for (const { key, re, unless } of ADD_ON_PATTERNS) {
    if (re.test(taskName) && !(unless && unless.test(taskName))) return key
  }
  return null
}

// Work neither service includes (and no add-on covers): a Tidy Task is the
// right way to book it, so it never gets the "already included" question.
const OUT_OF_SCOPE_RE =
  /organi[sz]|declutter|closet|garage|grout|microwave|pantry|carpet|rug shampoo|steam clean|patio|deck|yard|outdoor|exterior|car\b|silver|chandelier|wash (the |all )?walls|ceiling(?! fan)|mold|mildew|upholster|couch|sofa|mattress|light fixture|trash can|garbage can|bins? wash|fireplace|grill/i

const INCLUDED_RE =
  /dust|wipe|counter|surface|sink|faucet|toilet|tub|shower|mirror|sweep|mop|vacuum|tidy|tidying|floor|stove ?top|cook ?top|appliance|scrub|spray|disinfect|sanitize|trash|garbage|bathroom|kitchen|clean (the |my )?(room|bedroom|bathroom|kitchen|living room|office|hallway|dining room)/i

const DEEP_EXTRA_RE = /fixture|buildup|build-up|corners?|edges?|detail|intensive|deep clean/i

export type TaskScope = 'included' | 'addon' | 'out_of_scope' | 'unknown'

// Whether a task's wording is part of the service, a paid add-on for it, or
// neither. Standard-only add-ons are part of Deep Cleaning, so on Deep they're
// 'included'.
export function scopeOf(taskName: string, type: FullServiceType): { scope: TaskScope; addOn?: AddOnKey } {
  const match = matchAddOn(taskName)
  if (match) {
    return addOn(match).services.includes(type) ? { scope: 'addon', addOn: match } : { scope: 'included' }
  }
  if (OUT_OF_SCOPE_RE.test(taskName)) return { scope: 'out_of_scope' }
  if (type === 'deep' && DEEP_EXTRA_RE.test(taskName)) return { scope: 'included' }
  if (INCLUDED_RE.test(taskName)) return { scope: 'included' }
  return { scope: 'unknown' }
}

export type OverlapDecision =
  // Nothing to ask; add the task. `outOfScope` adds a short note that it isn't
  // part of the cleaning, so it's being booked as a Tidy Task.
  | { kind: 'none'; outOfScope?: boolean }
  // It's one of the cleaning's add-ons: offer that instead.
  | { kind: 'suggest_addon'; addOn: AddOnKey }
  // "Is this task for the same bathroom included in your Standard Cleaning, or
  // a different bathroom?"
  | { kind: 'ask_same_room'; roomNoun: string; serviceLabel: string }
  // The whole home is being cleaned, so this task is already covered. Only a
  // task whose wording is unclear can still be added ("This is extra work").
  | { kind: 'included_entire_home'; serviceLabel: string; allowAddAnyway: boolean }

export function decideOverlap(task: OverlapTask, sel: FullServiceSelection | null | undefined): OverlapDecision {
  if (!sel || isExemptFromOverlap(task)) return { kind: 'none' }
  const serviceLabel = FULL_SERVICE_LABEL[sel.type]
  const { scope, addOn: addOnKey } = scopeOf(task.name, sel.type)

  if (scope === 'addon' && addOnKey) return { kind: 'suggest_addon', addOn: addOnKey }
  if (scope === 'out_of_scope') return { kind: 'none', outOfScope: true }

  const roomTypes = roomTypesForTaskRoom(task.room)

  if (sel.scope === 'entire_home') {
    return { kind: 'included_entire_home', serviceLabel, allowAddAnyway: scope === 'unknown' }
  }

  // An Entire home Tidy Task (baseboards, windows, floors throughout) covers
  // rooms the cleaning doesn't, so it's booked as is.
  if (roomTypes === 'all' || roomTypes === null) return { kind: 'none' }

  const booked = roomTypes.filter((r) => (sel.rooms[r] ?? 0) > 0)
  if (booked.length === 0) return { kind: 'none' }
  return { kind: 'ask_same_room', roomNoun: roomType(booked[0]).noun, serviceLabel }
}

// False when the task can't be booked alongside this cleaning at all: the
// whole home is being cleaned and the task's wording says it's covered, so the
// prompt offers no way to add it. The full-service Tidy Tasks list hides these.
export function canAddWithCleaning(task: OverlapTask, sel: FullServiceSelection | null | undefined): boolean {
  const d = decideOverlap(task, sel)
  return !(d.kind === 'included_entire_home' && !d.allowAddAnyway)
}

export function sameRoomQuestion(d: Extract<OverlapDecision, { kind: 'ask_same_room' }>): string {
  return `Is this task for the same ${d.roomNoun} included in your ${d.serviceLabel}, or a different ${d.roomNoun}?`
}

export function alreadyIncludedMessage(serviceLabel: string): string {
  return `This task is already included in your ${serviceLabel}, so you don't need to add it separately.`
}
