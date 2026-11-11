// Tasks customers sometimes type that Tydio doesn't offer. Add Task stops on
// these with a clear message instead of sending them to the AI check or the
// laundry questions.
//
// Pure and dependency-free so client components can import it.

export const OUTDOOR_TASK_MESSAGE =
  'Tydio doesn’t provide that service right now. Taking out the trash is the only outdoor task we offer.'

// Taking out the trash is the one outdoor job Tydio does, so any task about
// trash, garbage, recycling or bins skips the outdoor check.
const TRASH = /\b(trash|garbage|rubbish|recycl\w*|compost|bins?|trash\s*cans?|garbage\s*cans?)\b/i

// Fully outside jobs: yard work, gutters, snow, exterior washing, etc.
const OUTDOOR = new RegExp(
  [
    String.raw`\bleaves\b`,
    String.raw`\bleaf\s*blow`,
    String.raw`\bgutters?\b`,
    String.raw`\bdownspouts?\b`,
    String.raw`\bmow(s|ed|ing)?\b`,
    String.raw`\blawns?\b`,
    String.raw`\b(back|front|side)?\s*yards?\b`,
    String.raw`\byard\s*work\b`,
    String.raw`\bgarden(s|ing)?\b`,
    String.raw`\bweed(s|ing)?\b`,
    String.raw`\bmulch`,
    String.raw`\bhedges?\b`,
    String.raw`\b(trim|prune)\w*\s+(the\s+)?(bush|bushes|shrubs?|trees?|branches)\b`,
    String.raw`\bshovel\w*\b`,
    String.raw`\bsnow\b`,
    String.raw`\b(pressure|power)[\s-]*wash`,
    String.raw`\bdriveways?\b`,
    String.raw`\bsidewalks?\b`,
    String.raw`\bpatios?\b`,
    String.raw`\bdecks?\b`,
    String.raw`\bporch(es)?\b`,
    String.raw`\b(swimming\s+)?pools?\b`,
    String.raw`\bhot\s*tubs?\b`,
    String.raw`\b(bbq|barbecue|outdoor\s+grill)`,
    String.raw`\broofs?\b`,
    String.raw`\bsiding\b`,
    String.raw`\boutdoors?\b`,
    // Not bare "outside"/"exterior": "Wipe the outside of the fridge" is fine.
    String.raw`\b(outside|exterior)\s+(windows?|walls?|of\s+the\s+(house|home))\b`,
    String.raw`\b(wash|clean|detail)\w*\s+(the\s+|my\s+)?(car|truck|vehicle)s?\b`,
  ].join('|'),
  'i'
)

const UNSUPPORTED: { re: RegExp; message: string; unless?: RegExp }[] = [
  {
    // "dry cleaning", "dry-clean my suit", "take clothes to the dry cleaners", "drycleaner"
    re: /\bdry[\s-]*clean/i,
    message: 'Tydio doesn’t offer dry cleaning right now.',
  },
  {
    // "Rake leaves", "Clean the gutters", "Mow the lawn", "Sweep the patio"
    re: OUTDOOR,
    message: OUTDOOR_TASK_MESSAGE,
    unless: TRASH,
  },
]

// The message to show for a task Tydio doesn't offer, or null if it's fine.
export function unsupportedTaskMessage(name: string): string | null {
  return UNSUPPORTED.find((u) => u.re.test(name) && !u.unless?.test(name))?.message ?? null
}
