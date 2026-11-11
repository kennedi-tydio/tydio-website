// Pet cage / enclosure cleaning and litter box cleaning are typed by the
// customer like any other task, then get their own follow-up questions and
// photos in Add Task. The photos are checked by AI (are they the right thing,
// clear enough, showing everything to be cleaned?) before the same AI
// estimate that prices every other task is made from them.
//
// Pure and dependency-free so client components can import it.

export type PetTaskKind = 'enclosure' | 'litterBox'

export type LitterOption = 'scoop' | 'fullChange'

export const LITTER_OPTIONS: LitterOption[] = ['scoop', 'fullChange']

export const LITTER_OPTION_LABEL: Record<LitterOption, string> = {
  scoop: 'Scoop only',
  fullChange: 'Empty, wash & refill',
}

export const LITTER_OPTION_SCOPE: Record<LitterOption, string> = {
  scoop: 'Remove waste, top up litter, and clean up scattered litter immediately around the box.',
  fullChange:
    'Empty the litter, wash and dry the box, refill it with fresh litter, and clean up scattered litter immediately around it.',
}

export const ENCLOSURE_DEFAULT_SCOPE =
  'Remove waste and used bedding, clean the enclosure base and washable accessories, dry surfaces, and replace bedding.'

export const PET_TASK_PREP_NOTICE: Record<PetTaskKind, string> = {
  enclosure:
    'Please have fresh bedding and any pet-safe cleaning supplies ready, and keep your pet secured away from the enclosure while it’s cleaned.',
  litterBox:
    'Please have fresh litter and any supplies you’d like used (like a scoop and waste bags) ready, and keep your pets away from the litter box area while it’s cleaned.',
}

export const PET_PHOTO_REQUIREMENT: Record<PetTaskKind, string> = {
  enclosure: 'Add at least one photo showing the entire enclosure. Add more for areas that are hard to see.',
  litterBox: 'Add photos that together show every litter box in this task, including inside each box.',
}

export const MAX_PET_TASK_PHOTOS = 6

// What's saved on the task once its photos pass the check.
export type PetTaskDetails = {
  kind: PetTaskKind
  // Enclosure only: what lives in it (from the description or asked for).
  petType?: string | null
  // Litter box only.
  litterOption?: LitterOption | null
  // The work the estimate covers: the default, a narrower one the customer
  // asked for, or the chosen litter option.
  scope: string
  // Storage paths in the private customer-task-photos bucket.
  photos: string[]
}

export function isPetTaskKind(value: unknown): value is PetTaskKind {
  return value === 'enclosure' || value === 'litterBox'
}

export function isLitterOption(value: unknown): value is LitterOption {
  return value === 'scoop' || value === 'fullChange'
}

// ── Detection from what the customer typed ───────────────────────────────────

const LITTER_RE = /\blitter\b|\bcat\s*box\b|\bkitty\s*box\b/i
const ENCLOSURE_RE =
  /\b(cage|cages|enclosure|enclosures|hutch|hutches|terrarium|terrariums|vivarium|vivariums|habitat|habitats|aviary|pen|playpen|tank|tanks|coop)\b/i

// Pet names the description can give, mapped to how they're shown back.
const PET_TYPES: { re: RegExp; label: string }[] = [
  { re: /\bguinea\s*pigs?\b|\bcav(y|ies)\b/i, label: 'Guinea pig' },
  { re: /\brabbits?\b|\bbunn(y|ies)\b/i, label: 'Rabbit' },
  { re: /\bhamsters?\b/i, label: 'Hamster' },
  { re: /\bgerbils?\b/i, label: 'Gerbil' },
  { re: /\bmice\b|\bmouse\b/i, label: 'Mouse' },
  { re: /\brats?\b/i, label: 'Rat' },
  { re: /\bferrets?\b/i, label: 'Ferret' },
  { re: /\bchinchillas?\b/i, label: 'Chinchilla' },
  { re: /\bhedgehogs?\b/i, label: 'Hedgehog' },
  { re: /\bbirds?\b|\bparrots?\b|\bparakeets?\b|\bbudgies?\b|\bcockatiels?\b|\bfinch(es)?\b|\bcanar(y|ies)\b/i, label: 'Bird' },
  { re: /\bchickens?\b|\bhens?\b/i, label: 'Chicken' },
  { re: /\breptiles?\b|\blizards?\b|\bgeckos?\b|\bbearded\s*dragons?\b|\biguanas?\b/i, label: 'Reptile' },
  { re: /\bsnakes?\b|\bpythons?\b|\bboas?\b/i, label: 'Snake' },
  { re: /\bturtles?\b|\btortoises?\b/i, label: 'Turtle' },
  { re: /\bdogs?\b|\bpupp(y|ies)\b/i, label: 'Dog' },
  { re: /\bcats?\b|\bkittens?\b/i, label: 'Cat' },
]

// Offered when the description doesn't name the pet.
export const PET_TYPE_SUGGESTIONS = ['Rabbit', 'Guinea pig', 'Hamster', 'Bird', 'Reptile']

// Fish tanks/aquariums are water-change work, not enclosure cleaning.
const AQUARIUM_RE = /\b(fish|aquarium|aquariums)\b/i

const PET_CONTEXT_RE = new RegExp(
  [ENCLOSURE_RE.source, ...PET_TYPES.map((p) => p.re.source), '\\bpets?\\b'].join('|'),
  'i'
)

// Which pet task the typed name is, or null for any other task.
//
// "Cage"/"enclosure"/"hutch"/... count on their own; "pen", "tank", "habitat"
// and "coop" only count when a pet is also named, so "clean the toilet tank"
// stays an ordinary task.
export function petTaskKindFromName(name: string): PetTaskKind | null {
  if (LITTER_RE.test(name)) return 'litterBox'
  if (AQUARIUM_RE.test(name)) return null
  const match = name.match(ENCLOSURE_RE)
  if (!match) return null
  const word = match[1].toLowerCase()
  const standsAlone = /^(cage|cages|enclosure|enclosures|hutch|hutches|terrarium|terrariums|vivarium|vivariums|aviary)$/.test(word)
  if (standsAlone) return 'enclosure'
  const rest = name.replace(match[0], ' ')
  return PET_CONTEXT_RE.test(rest) ? 'enclosure' : null
}

// The pet the description names, or null when it doesn't name one (the
// customer is then asked).
export function petTypeFromName(name: string): string | null {
  for (const { re, label } of PET_TYPES) {
    if (re.test(name)) return label
  }
  return null
}

// The litter option the description clearly points to, or null when it
// names neither or both (the customer then picks).
export function litterOptionFromName(name: string): LitterOption | null {
  const scoop = /\bscoop/i.test(name)
  const full = /\b(empty|emptying|wash|washing|change|changing|replace|replacing|refill|refilling|deep|scrub|full)\b/i.test(name)
  if (scoop && !full) return 'scoop'
  if (full && !scoop) return 'fullChange'
  return null
}

// ── Display ──────────────────────────────────────────────────────────────────

type PetFields = { pet?: PetTaskDetails | null }

export function isPetTask<T extends PetFields>(task: T): task is T & { pet: PetTaskDetails } {
  return task.pet != null && isPetTaskKind(task.pet.kind)
}

// "Rabbit enclosure" / "Litter box · Scoop only", or null for any other task.
export function petDetailLabel(task: PetFields): string | null {
  if (!isPetTask(task)) return null
  const { pet } = task
  if (pet.kind === 'litterBox') {
    return isLitterOption(pet.litterOption) ? `Litter box · ${LITTER_OPTION_LABEL[pet.litterOption]}` : 'Litter box'
  }
  return pet.petType ? `${pet.petType} enclosure` : 'Pet enclosure'
}

export function formatEstimatedMinutes(minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null
  const rounded = Math.round(minutes)
  return `About ${rounded} min`
}

// ── Photo storage ────────────────────────────────────────────────────────────

// Private bucket: these are photos of the inside of customers' homes, so they
// are read through short-lived signed URLs, never public links.
export const CUSTOMER_TASK_PHOTOS_BUCKET = 'customer-task-photos'

// Paths are "<profileId>/<uuid>.<ext>". Checked on every server read so a
// customer can only ever reference their own uploads.
const PHOTO_PATH_RE = /^([^/]+)\/[0-9a-f-]{36}\.(jpg|png|webp)$/

export function isOwnTaskPhotoPath(path: unknown, profileId: string): path is string {
  if (typeof path !== 'string') return false
  const m = path.match(PHOTO_PATH_RE)
  return m != null && m[1] === profileId
}

// Every photo path saved on a list of tasks (for signing URLs in one call).
export function petTaskPhotoPaths(tasks: PetFields[]): string[] {
  return Array.from(new Set(tasks.flatMap((t) => (isPetTask(t) ? t.pet.photos : []))))
}
