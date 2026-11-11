// The kinds of work a Tidy Pro says they do, chosen on "Services provided"
// during onboarding and editable from their profile afterwards.
//
// Pure and dependency-free so client components can import it.

import { usesLaundromat } from './laundry'
import { isPetTask, type PetTaskDetails } from './petTasks'

export type TidyProService =
  | 'taskBased'
  | 'generalCleaning'
  | 'laundry'
  | 'laundromat'
  | 'petEnclosures'
  | 'litterBoxes'

export type TidyProServiceOption = {
  key: TidyProService
  label: string
  description: string
  // Customers can't book this yet; Tidy Pros can still say they offer it.
  comingSoon?: boolean
}

export const TIDY_PRO_SERVICES: TidyProServiceOption[] = [
  {
    key: 'taskBased',
    label: 'Task-based cleaning',
    description: 'Individual Tidy Tasks, like wiping counters, scrubbing a toilet, or vacuuming a rug.',
  },
  {
    key: 'generalCleaning',
    label: 'General cleaning',
    description: 'A general clean of the home.',
    comingSoon: true,
  },
  {
    key: 'laundry',
    label: 'Laundry',
    description: 'Washing, drying, folding, and ironing in the customer’s home.',
  },
  {
    key: 'laundromat',
    label: 'Laundromat trips',
    description: 'Taking a customer’s clothes to a laundromat when they don’t have a working washer and dryer.',
  },
  {
    key: 'petEnclosures',
    label: 'Pet enclosures',
    description: 'Cleaning cages, hutches, habitats, and other pet enclosures.',
  },
  {
    key: 'litterBoxes',
    label: 'Litter boxes',
    description: 'Scooping, or emptying, washing, and refilling litter boxes.',
  },
]

const KEYS = new Set<string>(TIDY_PRO_SERVICES.map((s) => s.key))

export function isTidyProService(value: unknown): value is TidyProService {
  return typeof value === 'string' && KEYS.has(value)
}

// Known services only, each once, in the order they're listed above.
export function normalizeServices(values: unknown): TidyProService[] {
  if (!Array.isArray(values)) return []
  const chosen = new Set(values.filter(isTidyProService))
  return TIDY_PRO_SERVICES.map((s) => s.key).filter((k) => chosen.has(k))
}

// Null means they haven't chosen yet (an onboarding step); an empty list
// isn't allowed to be saved.
export function hasChosenServices(services: unknown): boolean {
  return normalizeServices(services).length > 0
}

export function serviceLabels(services: unknown): string[] {
  const chosen = new Set(normalizeServices(services))
  return TIDY_PRO_SERVICES.filter((s) => chosen.has(s.key)).map((s) => s.label)
}

// ── Matching ─────────────────────────────────────────────────────────────────

type ServiceTaskFields = Parameters<typeof usesLaundromat>[0] & {
  laundryLoads?: unknown
  pet?: PetTaskDetails | null
}

// The service one booked task needs from a Tidy Pro.
export function requiredServiceForTask(task: ServiceTaskFields): TidyProService {
  if (isPetTask(task)) return task.pet.kind === 'litterBox' ? 'litterBoxes' : 'petEnclosures'
  if (task.laundryService) return usesLaundromat(task) ? 'laundromat' : 'laundry'
  if (task.laundryLoads) return 'laundry'
  return 'taskBased'
}

// Every service a booking's tasks need, each once, in list order.
export function requiredServicesForTasks(tasks: ServiceTaskFields[]): TidyProService[] {
  return normalizeServices(tasks.map(requiredServiceForTask))
}

// Whether a Tidy Pro provides every service a booking needs.
export function providesServices(provided: unknown, required: TidyProService[]): boolean {
  const offered = new Set(normalizeServices(provided))
  return required.every((s) => offered.has(s))
}

export const SERVICES_NOT_OFFERED_MESSAGE =
  'This Tidy Pro doesn’t offer every service in your booking. Please go back and choose another Tidy Pro.'
