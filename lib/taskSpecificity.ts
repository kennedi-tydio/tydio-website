// A Tidy Task has to be one specific job ("Scrub the toilet"), not a whole
// room or the whole home ("Clean bathroom"). Broad requests are caught here
// before any AI estimate is made — the Add Task modal checks as soon as the
// customer moves past the first step, and /api/validate-task checks again so
// the rule can't be skipped. The AI validator's prompt carries the same rule
// for broad wordings this list doesn't cover.

import { petTaskKindFromName } from './petTasks'

// Verbs that, on their own or with only a place after them, don't say what
// the work is.
const GENERIC_VERBS = [
  'clean',
  'cleaning',
  'clean up',
  'clean out',
  'deep clean',
  'deep cleaning',
  'general clean',
  'general cleaning',
  'full clean',
  'quick clean',
  'tidy',
  'tidy up',
  'tidying',
  'straighten',
  'straighten up',
  'organize',
  'organise',
  'declutter',
  'sanitize',
  'disinfect',
  'refresh',
  'freshen up',
  'pick up',
  'do',
]

// Whole rooms, areas and the home itself.
const PLACES = [
  'bathroom',
  'bathrooms',
  'bath',
  'restroom',
  'powder room',
  'kitchen',
  'bedroom',
  'bedrooms',
  'master bedroom',
  'primary bedroom',
  'guest room',
  'guest bedroom',
  'kids room',
  'living room',
  'dining room',
  'family room',
  'den',
  'office',
  'home office',
  'playroom',
  'nursery',
  'laundry room',
  'mudroom',
  'basement',
  'garage',
  'attic',
  'closet',
  'hallway',
  'entryway',
  'upstairs',
  'downstairs',
  'house',
  'home',
  'apartment',
  'condo',
  'place',
  'room',
  'rooms',
  'everything',
]

const FILLERS = ['the', 'my', 'our', 'a', 'entire', 'whole', 'all', 'of', 'full', 'in']

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function alt(words: string[]): string {
  // Longest first so "clean up" wins over "clean".
  return [...words].sort((a, b) => b.length - a.length).map(escape).join('|')
}

const EXAMPLES: Record<string, string> = {
  bathroom: '“Scrub the toilet”, “Wipe the bathroom mirror” or “Clean the shower”',
  kitchen: '“Wipe down the counters”, “Clean the microwave” or “Scrub the sink”',
  bedroom: '“Make the bed”, “Dust the dresser” or “Vacuum the bedroom floor”',
  living: '“Dust the TV stand”, “Vacuum the couch” or “Wipe the coffee table”',
}

function examplesFor(place: string): string {
  if (/bath|restroom|powder/.test(place)) return EXAMPLES.bathroom
  if (/kitchen/.test(place)) return EXAMPLES.kitchen
  if (/bed|guest|kids|nursery/.test(place)) return EXAMPLES.bedroom
  if (/living|family|den/.test(place)) return EXAMPLES.living
  return '“Scrub the toilet”, “Wipe down the counters” or “Vacuum the rug”'
}

// The message to show when the task names a whole room or the whole home
// instead of a specific job, or null when it's specific enough to go on to
// the AI check. `room` is the room the customer picked, so a custom room
// ("Clean sunroom" in "Sunroom") is caught too.
export function broadTaskMessage(name: string, room?: string | null): string | null {
  const n = normalize(name)
  if (!n) return null

  const places = [...PLACES]
  const r = room ? normalize(room) : ''
  if (r) places.push(r)

  const verbs = alt(GENERIC_VERBS)
  const fillers = `(?:(?:${alt(FILLERS)}) )*`
  const place = `(?:${alt(places)})`

  const justVerb = new RegExp(`^(?:${verbs})$`)
  const verbPlace = new RegExp(`^(?:${verbs}) ${fillers}(${place})(?: (?:room|area))?(?: up)?$`)
  const placeVerb = new RegExp(`^${fillers}(${place}) (?:${verbs})$`)
  const justPlace = new RegExp(`^${fillers}(${place})$`)

  let matched: string | null = null
  if (justVerb.test(n)) matched = r || ''
  else {
    const m = n.match(verbPlace) ?? n.match(placeVerb) ?? n.match(justPlace)
    if (m) matched = m[1]
  }
  if (matched == null) return vagueFloorMessage(name, room)

  return `That’s too broad for a Tidy Task. Add each specific job as its own task, like ${examplesFor(matched || r)}.`
}

// Surfaces that can be cleaned more than one way, so "Clean the floor" doesn't
// say what the work is: swept, mopped or vacuumed.
const FLOORS = ['floor', 'floors', 'flooring', 'ground']
const FLOOR_MESSAGE =
  'That’s too vague for a Tidy Task. Add a “Sweep floor” task and a “Mop floor” task separately.'

// "Floor cleaning", "Clean the kitchen floor", "Floors". A room may come
// before the floor; a specific verb ("Mop the floor") isn't vague. Checked in
// every room, Entire home too, so "Floor cleaning" there gets this message
// rather than Entire home's list of accepted tasks.
export function vagueFloorMessage(name: string, room?: string | null): string | null {
  const n = normalize(name)
  if (!n) return null
  const places = room ? [...PLACES, normalize(room)] : PLACES
  const verbs = alt(GENERIC_VERBS)
  const fillers = `(?:(?:${alt(FILLERS)}) )*`
  const floor = `(?:${fillers}(?:(?:${alt(places)}) )?(?:${alt(FLOORS)}))`
  const vague = [
    new RegExp(`^(?:${verbs}) ${floor}$`),
    new RegExp(`^${floor} (?:${verbs}|care)$`),
    new RegExp(`^${floor}$`),
  ]
  return vague.some((re) => re.test(n)) ? FLOOR_MESSAGE : null
}

// ── More than one task in one ──────────────────────────────────────────────

// Verbs that each start a separate job. "Sweep and mop the floor" is two
// tasks: the Tidy Pro is paid, and timed, per task.
const TASK_VERBS = [
  'sweep', 'mop', 'mop up', 'vacuum', 'dust', 'wipe', 'wipe down', 'scrub', 'scour', 'wash', 'clean',
  'spot clean', 'polish', 'shine', 'disinfect', 'sanitize', 'sanitise', 'deodorize', 'steam', 'tidy',
  'tidy up', 'straighten', 'organize', 'organise', 'sort', 'declutter', 'fold', 'iron', 'launder',
  'empty', 'load', 'unload', 'make', 'change', 'strip', 'take out', 'pick up', 'put away', 'hang up',
  'rinse', 'dry', 'refill', 'replace',
]

// Steps that finish the job before them rather than starting a new one:
// "Wash and dry the dishes", "Fold and put away clothes", "Wipe and sanitize counters".
const FINISHING_VERBS = ['rinse', 'dry', 'put away', 'hang up', 'refill', 'sanitize', 'sanitise', 'disinfect']

const JOINERS = /\s(?:and then|and also|and|then|plus|also|as well as)\s/

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// The message to show when one task names two or more separate jobs ("Sweep
// and mop floor", "Wipe counters, scrub the sink"), or null when it's one job.
// Entire home has its own fixed list (which includes sweeping and mopping
// together), so callers skip this for it. Pet enclosure and litter box tasks
// pick their scope from fixed options instead.
export function combinedTaskMessage(name: string): string | null {
  if (petTaskKindFromName(name)) return null
  const n = ` ${name
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[&+/,;]/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `
  const verbStart = new RegExp(`^(${alt(TASK_VERBS)})(?: (.*))?$`)
  const finishing = new Set(FINISHING_VERBS)

  const jobs = n
    .split(JOINERS)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.match(verbStart))
    .filter((m): m is RegExpMatchArray => m != null)
    .map((m) => ({ verb: m[1], object: m[2]?.trim() ?? '' }))

  if (jobs.length < 2 || !jobs.slice(1).some((j) => !finishing.has(j.verb))) return null

  // "Sweep and mop floor": the first job takes the object named at the end.
  const sharedObject = [...jobs].reverse().find((j) => j.object)?.object ?? ''
  const examples = jobs
    .filter((j) => !finishing.has(j.verb))
    .slice(0, 3)
    .map((j) => `“${capitalize([j.verb, j.object || sharedObject].filter(Boolean).join(' '))}”`)
  const list = examples.length > 1 ? `${examples.slice(0, -1).join(', ')} and ${examples[examples.length - 1]}` : examples[0]

  return `That’s more than one task. Add each job as its own task, like ${list}.`
}
