// A Tidy Task has to be one specific job ("Scrub the toilet"), not a whole
// room or the whole home ("Clean bathroom"). Broad requests are caught here
// before any AI estimate is made — the Add Task modal checks as soon as the
// customer moves past the first step, and /api/validate-task checks again so
// the rule can't be skipped. The AI validator's prompt carries the same rule
// for broad wordings this list doesn't cover.

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
  if (matched == null) return null

  return `That’s too broad for a Tidy Task. Add each specific job as its own task, like ${examplesFor(matched || r)}.`
}
