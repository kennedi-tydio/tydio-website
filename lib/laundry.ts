import { petDetailLabel, type PetTaskDetails } from './petTasks'

// Each laundry service is its own Tidy Task: a basket count for wash/dry/
// wash & dry/fold, plus a separate machine-load count for wash/dry/wash & dry,
// and an item count for iron. Nothing here adds one service for another.
//
// Wash and Dry on their own mean the Tidy Pro starts the load and doesn't stay
// for the cycle. "Wash & dry", or a Wash and a Dry task marked as the same
// laundry, is the full cycle: the Tidy Pro stays through washing and drying.
//
// Pure and dependency-free so client components can import it.

export type LaundryService = 'wash' | 'dry' | 'washDry' | 'fold' | 'iron'

export const LAUNDRY_SERVICES: LaundryService[] = ['wash', 'dry', 'washDry', 'fold', 'iron']

export const LAUNDRY_SERVICE_LABEL: Record<LaundryService, string> = {
  wash: 'Wash',
  dry: 'Dry',
  washDry: 'Wash & dry',
  fold: 'Fold',
  iron: 'Iron',
}

// Shown under each choice so customers know whether the Tidy Pro stays.
export const LAUNDRY_SERVICE_HINT: Record<LaundryService, string | null> = {
  wash: 'Your Tidy Pro puts one load in the washer but doesn’t stay for the cycle. Choose Wash & dry if you want them to stay for the full cycle',
  dry: 'Your Tidy Pro puts one load in the dryer but doesn’t stay for the cycle. Choose Wash & dry if you want them to stay for the full cycle',
  washDry: 'Your Tidy Pro stays for the full wash and dry cycle',
  fold: null,
  iron: null,
}

// Shown once after a laundry task is added.
export const LAUNDRY_ADDED_MESSAGE: Record<LaundryService, string> = {
  wash: 'Washing only has been added. Drying, folding, and ironing are separate tasks. If you’d like any of those services, please add them separately.',
  dry: 'Drying only has been added. Washing, folding, and ironing are separate tasks. If you’d like any of those services, please add them separately.',
  washDry: 'Washing and drying have been added. Folding and ironing are separate tasks. If you’d like either of those services, please add them separately.',
  fold: 'Folding only has been added. Washing, drying, and ironing are separate tasks. If you’d like any of those services, please add them separately.',
  iron: 'Ironing only has been added. Washing, drying, and folding are separate tasks. If you’d like any of those services, please add them separately.',
}

export function isLaundryService(value: unknown): value is LaundryService {
  return typeof value === 'string' && (LAUNDRY_SERVICES as string[]).includes(value)
}

// A task name that's about laundry at all (opens the laundry questions).
export function isLaundryTaskName(name: string): boolean {
  return /laundry|\bclothes\b|\blaundering\b|\biron(ing)?\b/i.test(name)
}

// The one service a laundry task name points to, or null if it names none or
// more than one (the customer then picks).
export function laundryServiceFromName(name: string): LaundryService | null {
  const found: LaundryService[] = []
  if (/\bwash/i.test(name)) found.push('wash')
  if (/\bdry|\bdrying|\bdryer/i.test(name)) found.push('dry')
  if (/\bfold/i.test(name)) found.push('fold')
  if (/\biron/i.test(name)) found.push('iron')
  if (found.length === 2 && found[0] === 'wash' && found[1] === 'dry') return 'washDry'
  return found.length === 1 ? found[0] : null
}

// ── Basket quantities (wash / dry / fold) ────────────────────────────────────

export const BASKET_STEP = 0.5
export const MORE_THAN_ONE_BASKET_MIN = 1.5
export const MAX_BASKETS = 10

export function isValidBasketCount(n: unknown): n is number {
  return (
    typeof n === 'number' &&
    Number.isFinite(n) &&
    n >= BASKET_STEP &&
    n <= MAX_BASKETS &&
    Number.isInteger(n / BASKET_STEP)
  )
}

export function formatBaskets(n: number): string {
  if (n === 0.5) return 'Half a basket'
  if (n === 1) return '1 basket'
  return `${n} baskets`
}

// ── Machine loads (wash / dry / wash & dry) ──────────────────────────────────
//
// Only asked for Wash & dry, where the Tidy Pro stays for every cycle: one
// basket can need several loads when whites, darks or delicates are run
// separately. Saved separately from the basket count. Whole numbers from 1.
//
// Wash or Dry on its own is always one load: the Tidy Pro puts a load in and
// leaves, so the customer isn't asked.

export const MAX_MACHINE_LOADS = 20

// Loads a Wash-only or Dry-only task runs.
export const START_ONLY_LOADS = 1

export function needsMachineLoads(service: LaundryService | null | undefined): boolean {
  return service === 'washDry'
}

export function isValidMachineLoadCount(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= MAX_MACHINE_LOADS
}

export function formatMachineLoads(n: number): string {
  return n === 1 ? '1 load' : `${n} loads`
}

// ── Wash or Dry only: start the load, nothing more ───────────────────────────
//
// A Wash-only or Dry-only task is the Tidy Pro putting a load in and leaving
// it, priced as such. The customer confirms that's all they want; if they
// want the laundry taken out, it's a Wash & dry task (FULL_CYCLE_MINUTES_PER_LOAD
// at MACHINE_LAUNDRY_HOURLY_RATE) instead.

// `linked`: the task is the same laundry as the customer's other Wash/Dry task.
export function startOnlyQuestion(service: 'wash' | 'dry', linked: boolean): string {
  if (linked) return 'Should your Tidy Pro only put a load in the washer and a load in the dryer, without taking them out?'
  return `Should your Tidy Pro only put a load in the ${service === 'wash' ? 'washer' : 'dryer'}, without taking it out?`
}

export const START_ONLY_YES = 'Yes, only put it in'
export const START_ONLY_NO = 'No, take it out too'

// Shown once a Wash/Dry task becomes Wash & dry because the customer wants
// the laundry taken out. `partner` names the linked Wash/Dry task it replaces,
// so the laundry is one Wash & dry task, not two.
export function switchedToWashDryMessage(partner: { label: string; name: string } | null): string {
  const replaces = partner ? ` It replaces your ${partner.label} task (${partner.name}), so it’s all one task.` : ''
  return `This is now a Wash & dry task: your Tidy Pro stays for the full cycle, at $50 a load.${replaces} Please fill in the booking details.`
}

// A task name that only names washing or drying ("Wash towels") is renamed
// for the Wash & dry task it becomes; any other name is kept.
export function washDryTaskName(name: string): string {
  const service = laundryServiceFromName(name)
  return service === 'wash' || service === 'dry' ? 'Wash & dry laundry' : name
}

export const MACHINE_LOADS_QUESTION = 'How many separate loads should we wash and dry?'

export const MACHINE_LOADS_HINT = 'Count each group you want run separately, such as whites, darks, or delicates.'

// The loads a wash / dry / wash & dry task runs. Wash or Dry only: always one
// (any count saved on an older task is ignored). Wash & dry: the saved count,
// or for a task saved before loads were asked, one load per basket
// (part-baskets rounded up, as those tasks were priced). Null when it can't be
// told, or for any other task.
export function machineLoadsFor(task: LaundryFields): number | null {
  if (task.laundryService === 'wash' || task.laundryService === 'dry') return START_ONLY_LOADS
  if (!needsMachineLoads(task.laundryService)) return null
  if (task.machineLoads != null) return isValidMachineLoadCount(task.machineLoads) ? task.machineLoads : null
  return isValidBasketCount(task.laundryBaskets) ? billableLoadsForBaskets(task.laundryBaskets) : null
}

// ── Wash and Dry for the same laundry ────────────────────────────────────────
//
// Wash and Dry stay separate tasks. A customer can mark one as the same
// laundry as the other (sameLaundryAsTaskId on whichever was added second).
// Loads both washed and dried in the same visit keep the Tidy Pro on site for
// the full cycle, so each reserves FULL_CYCLE_MINUTES_PER_LOAD of the visit.

type PairableTask = LaundryFields & { id: string }

const PARTNER_SERVICE: Partial<Record<LaundryService, LaundryService>> = { wash: 'dry', dry: 'wash' }

// The other half of a Wash/Dry pair among `tasks`, if this task names one
// (or is named by one) and it's the matching service.
function linkedPartner<T extends PairableTask>(task: T, tasks: T[]): T | null {
  const partnerService = task.laundryService ? PARTNER_SERVICE[task.laundryService] : undefined
  if (!partnerService) return null
  return (
    tasks.find(
      (t) =>
        t.id !== task.id &&
        t.laundryService === partnerService &&
        (t.id === task.sameLaundryAsTaskId || t.sameLaundryAsTaskId === task.id)
    ) ?? null
  )
}

// Loads washed and dried in the same visit, across every linked Wash/Dry pair
// in `tasks` (each pair counted once). A pair with 3 wash loads and 2 dry
// loads has 2 paired loads; the third wash load is unpaired.
export function pairedMachineLoads(tasks: PairableTask[]): number {
  let total = 0
  for (const wash of tasks) {
    if (wash.laundryService !== 'wash') continue
    const dry = linkedPartner(wash, tasks)
    if (!dry) continue
    const w = machineLoadsFor(wash)
    const d = machineLoadsFor(dry)
    if (w && d) total += Math.min(w, d)
  }
  return total
}

// The Wash (for a Dry) or Dry (for a Wash) task this one is linked to, or null.
export function sameLaundryPartner<T extends PairableTask>(task: T, tasks: T[]): T | null {
  return linkedPartner(task, tasks)
}

// The tasks with any same-laundry link cleared whose partner isn't among
// them (e.g. only the Wash task of a pair was booked).
export function dropUnmatchedLaundryLinks<T extends PairableTask>(tasks: T[]): T[] {
  return tasks.map((t) =>
    t.sameLaundryAsTaskId && !linkedPartner(t, tasks) ? { ...t, sameLaundryAsTaskId: null } : t
  )
}

// Tasks of the other service a new Wash/Dry task could be linked to: ones not
// already linked to a partner.
export function linkableLaundryTasks<T extends PairableTask>(service: LaundryService | null, tasks: T[]): T[] {
  const partnerService = service ? PARTNER_SERVICE[service] : undefined
  if (!partnerService) return []
  return tasks.filter((t) => t.laundryService === partnerService && !linkedPartner(t, tasks))
}

// ── Visit length ─────────────────────────────────────────────────────────────

export function formatVisitDuration(minutes: number): string {
  const m = Math.round(minutes)
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h === 0) return `${rest} min`
  const hours = `${h} hr`
  return rest ? `${hours} ${rest} min` : hours
}

// ── Ironing quantity ─────────────────────────────────────────────────────────

export const MAX_IRON_ITEMS = 99

export function isValidIronItemCount(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= MAX_IRON_ITEMS
}

export function formatIronItems(n: number): string {
  return n === 1 ? '1 item' : `${n} items`
}

// ── Display ──────────────────────────────────────────────────────────────────

type LaundryFields = {
  laundryService?: LaundryService | null
  laundryBaskets?: number | null
  machineLoads?: number | null
  sameLaundryAsTaskId?: string | null
  ironItems?: number | null
  hasWasherDryer?: boolean | null
}

// ── Washer and dryer ─────────────────────────────────────────────────────────

// The services that need a washer or dryer, so ask whether the customer has one.
export function needsWasherDryer(service: LaundryService | null | undefined): boolean {
  return service === 'wash' || service === 'dry' || service === 'washDry'
}

// True only when the customer said they don't have a working washer and
// dryer. Tasks saved before this was asked (no answer) aren't laundromat trips.
export function usesLaundromat(task: LaundryFields): boolean {
  return needsWasherDryer(task.laundryService) && task.hasWasherDryer === false
}

export const LAUNDROMAT_LABEL = 'At a laundromat'

// A laundromat trip is only booked as a full wash & dry cycle: the Tidy Pro
// can't start a load there and leave. True for a Wash-only or Dry-only task
// without a washer and dryer, which can't be booked.
export function isLaundromatPartialCycle(task: LaundryFields): boolean {
  return usesLaundromat(task) && task.laundryService !== 'washDry'
}

export const LAUNDROMAT_FULL_CYCLE_ONLY_MESSAGE =
  'Laundromat trips are full cycles only. Choose Wash & dry, or check that you have a working washer and dryer.'

// "1.5 baskets" / "1 basket · 3 loads" / "4 items", or null for a task
// without laundry quantity data (any non-laundry task, or one saved before
// quantities existed). Loads only show when they were asked for.
export function laundryQuantityLabel(task: LaundryFields): string | null {
  if (task.laundryService === 'iron') {
    return isValidIronItemCount(task.ironItems) ? formatIronItems(task.ironItems) : null
  }
  if (isLaundryService(task.laundryService)) {
    const parts = [
      isValidBasketCount(task.laundryBaskets) ? formatBaskets(task.laundryBaskets) : null,
      needsMachineLoads(task.laundryService) && isValidMachineLoadCount(task.machineLoads)
        ? formatMachineLoads(task.machineLoads)
        : null,
    ].filter(Boolean)
    return parts.length ? parts.join(' · ') : null
  }
  return null
}

// "Wash · 1.5 baskets" — the service plus its quantity (and "At a
// laundromat" when it is one), or just the service when no quantity was
// saved. Null for a non-laundry task.
export function laundryDetailLabel(task: LaundryFields): string | null {
  if (!isLaundryService(task.laundryService)) return null
  const partnerService = PARTNER_SERVICE[task.laundryService]
  return [
    LAUNDRY_SERVICE_LABEL[task.laundryService],
    laundryQuantityLabel(task),
    partnerService && task.sameLaundryAsTaskId ? `Same laundry as ${LAUNDRY_SERVICE_LABEL[partnerService]}` : null,
    usesLaundromat(task) ? LAUNDROMAT_LABEL : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

// The name a booked task is listed under for the Tidy Pro's checklist, with
// the laundry service and quantity (or pet task details) attached so they
// know how much to do.
export function bookedTaskName(
  task: LaundryFields & { name: string; room: string; pet?: PetTaskDetails | null }
): string {
  const name = task.name || task.room
  const detail = laundryDetailLabel(task) ?? petDetailLabel(task)
  return detail ? `${name} (${detail})` : name
}

// ── Pricing ──────────────────────────────────────────────────────────────────
//
// Washing and drying (Wash, Dry, Wash & dry) are charged at a flat hourly
// rate for their minutes, the same in every state. Folding is charged like any
// other task (minutes / 240 × the state's 4-hour rate). Ironing is a flat
// price per item. Laundry never gets the home-size multiplier.
//
// One basket counts as one load. Starting a load, or running a full cycle,
// takes the same time whatever the size of the load, so part-baskets round up
// to a whole load there. Folding scales with the actual amount.

// Wash or Dry only: the Tidy Pro starts the load and leaves it running.
export const START_LOAD_MINUTES_PER_LOAD = 7

// Wash & dry: the Tidy Pro stays for the full cycle, 2 hours a load. Also
// what a linked Wash + Dry pair (one load) reserves of the visit (not its
// price: those tasks are still priced as a load started each).
export const FULL_CYCLE_MINUTES_PER_LOAD = 120

// Washing and drying: $25 an hour everywhere, so one full wash & dry cycle
// (2 hours) is $50 a load. Not adjusted for state or home size.
export const MACHINE_LAUNDRY_HOURLY_RATE = 25

export function machineLaundryPrice(minutes: number): number {
  return Math.round(((minutes / 60) * MACHINE_LAUNDRY_HOURLY_RATE) * 100) / 100
}

// Folding: 20 minutes a basket, so half a basket is 10.
export const FOLD_MINUTES_PER_BASKET = 20

// Ironing: $5 an item everywhere, not adjusted for state or home size.
export const IRON_PRICE_PER_ITEM = 5

// Time set aside per ironed item. Only affects how long the booking is
// scheduled for, not its price.
export const IRON_MINUTES_PER_ITEM = 5

export function billableLoadsForBaskets(baskets: number): number {
  return Math.ceil(baskets)
}
