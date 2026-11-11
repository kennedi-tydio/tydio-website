import OpenAI from 'openai'
import { tierFromEstimatedMinutes, type Tier } from './pricingRules'
import {
  ENCLOSURE_DEFAULT_SCOPE,
  LITTER_OPTION_LABEL,
  LITTER_OPTION_SCOPE,
  type LitterOption,
  type PetTaskKind,
} from './petTasks'

// Constructed lazily, on first actual use — not at module load. The OpenAI
// SDK throws immediately if no API key is in scope, and this module must
// stay safe to *import* (even transitively, even where OPENAI_API_KEY isn't
// set) without that constructor call blowing up the whole import chain.
let openai: OpenAI | null = null
function getOpenAI(): OpenAI {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return openai
}

const DIRT_LEVEL_LABELS: Record<string, string> = {
  light: 'Light touch-up',
  standard: 'Standard cleaning',
  heavy: 'Heavy cleaning',
}

export interface TaskEstimateInput {
  name: string
  room?: string | null
  notes?: string | null
  dirtLevel?: string | null
  unusual?: string[] | null
}

export interface TaskEstimateResult {
  valid: boolean
  reason: string
  estimated_minutes: number | null
  tier: Tier | null
}

// Shared by the live "Add Task" validation call and the server-side repair
// pass (ensurePriceableTasks) that backfills any task saved without an
// estimate — both read the same task info (name, room, mess level, notes,
// additional issues) to produce the same estimate.
export async function estimateTaskDuration(input: TaskEstimateInput): Promise<TaskEstimateResult> {
  const taskDescription = [
    input.name ? `Task: "${input.name}"` : null,
    input.room ? `Room: "${input.room}"` : null,
    input.dirtLevel ? `Mess level: ${DIRT_LEVEL_LABELS[input.dirtLevel] ?? input.dirtLevel}` : null,
    input.unusual && input.unusual.length > 0 ? `Additional issues: ${input.unusual.join(', ')}` : null,
    input.notes ? `Notes: "${input.notes}"` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You validate whether a task is a valid "Tidy Task" for a home cleaning service, and estimate how long it takes.

A valid Tidy Task MUST be:
1. A specific cleaning or tidying activity (wiping, scrubbing, vacuuming, mopping, dusting, organizing, sanitizing, etc.)
2. Completable in under 30 minutes
3. ONE specific job on a specific item or surface — not a whole room, area or home. A task that only names a place ("Clean bathroom", "Tidy the kitchen", "Deep clean bedroom", "Clean the house", "Do the living room") is INVALID even if the room is small, because it doesn't say what work to do. For these, the reason should ask the customer to add each specific job as its own task, with 2 examples for that room.
4. Done inside the home. Fully outdoor jobs (raking leaves, cleaning gutters, mowing, weeding, gardening, shoveling snow, sweeping a patio/deck/porch/driveway, pressure washing, cleaning a pool or grill, washing a car, exterior windows) are INVALID. The ONE exception is taking out the trash/recycling, which is valid. For outdoor tasks, the reason must be exactly: "Tydio doesn’t provide that service right now. Taking out the trash is the only outdoor task we offer."

INVALID examples: "Paint the walls", "Fix the leaky sink", "Cook dinner", "Build a shelf", "Grocery shopping", "Clean bathroom", "Tidy up the kitchen", "Clean my bedroom"
VALID examples: "Vacuum the rug", "Wipe down counters", "Scrub the toilet", "Clean the microwave inside", "Dust the shelves", "Mop the floor"

When estimating time, weigh the reported mess level and any additional issues (pet mess, mold/mildew, hard water stains, etc.) alongside the task and notes — a heavily soiled task, or one with extra issues noted, takes meaningfully longer than a light touch-up of that same task.

Respond with JSON only: { "valid": boolean, "reason": string, "estimated_minutes": number }
- estimated_minutes: your best-effort estimate, in whole minutes, of how long one person would take to complete this specific task given its mess level and any noted issues.
- If valid, reason can be an empty string.
- If invalid, reason should be a short, friendly 1-sentence explanation for the user.`,
      },
      {
        role: 'user',
        content: taskDescription,
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 100,
  })

  const raw = completion.choices[0].message.content ?? '{"valid":true,"reason":"","estimated_minutes":15}'
  const parsed = JSON.parse(raw) as { valid: boolean; reason: string; estimated_minutes?: number }

  const estimatedMinutes = Number.isFinite(parsed.estimated_minutes) ? (parsed.estimated_minutes as number) : null
  const tier = estimatedMinutes != null ? tierFromEstimatedMinutes(estimatedMinutes) : null

  // A task over 30 minutes is invalid regardless of what the model itself claimed.
  const valid = parsed.valid && tier != null
  const reason = valid
    ? ''
    : parsed.reason || 'This task takes too long for a Tidy Task. Please split it into smaller tasks.'

  return { valid, reason, estimated_minutes: estimatedMinutes, tier }
}

// ── Pet enclosure / litter box tasks: photo check, then estimate ─────────────

export type PetPhotoProblem = 'blurry' | 'too_dark' | 'cropped' | 'wrong_subject' | 'missing_area'

export interface PetTaskCheckInput {
  kind: PetTaskKind
  name: string
  petType?: string | null
  litterOption?: LitterOption | null
  notes?: string | null
  // data: URLs, in the order the customer added them.
  photos: string[]
}

export type PetTaskCheckResult =
  // The photos can't be used to judge the work: ask for a new one.
  | { status: 'retake'; problem: PetPhotoProblem | null; message: string; unusablePhotos: number[] }
  // The photos are fine, but this isn't a Tidy Task (e.g. too long).
  | { status: 'invalid'; reason: string }
  | { status: 'ok'; scope: string; estimated_minutes: number; tier: Tier }

const RETAKE_FALLBACK: Record<PetTaskKind, string> = {
  enclosure: 'Please upload a clear, well-lit photo showing the full enclosure, including the floor and bedding.',
  litterBox: 'Please upload a clear photo from above so we can see inside every litter box.',
}

const TOO_LONG_MESSAGE: Record<PetTaskKind, string> = {
  enclosure:
    'This enclosure would take longer than a Tidy Task allows. Try narrowing what you’d like done in your instructions, or split it into separate tasks.',
  litterBox:
    'This would take longer than a Tidy Task allows. Try “Scoop only”, or add each litter box as its own task.',
}

const PET_PROBLEMS: PetPhotoProblem[] = ['blurry', 'too_dark', 'cropped', 'wrong_subject', 'missing_area']

function petCheckPrompt(kind: PetTaskKind): string {
  const subject =
    kind === 'enclosure'
      ? `a pet cage / enclosure (hutch, habitat, terrarium, etc.).
Photo rules for an enclosure:
- Across all the photos together, the FULL enclosure must be visible, including the floor/base and bedding, and every area the customer wants cleaned.
- Extra close-up photos of hard-to-see areas are welcome; they don't each need to show the whole enclosure.
Default scope: remove waste and used bedding, clean the enclosure base and washable accessories, dry surfaces, and replace bedding.
If the task description or instructions ask for LESS than the default (e.g. "just change the bedding"), use that narrower scope. Never widen the scope beyond the default.
Judge the enclosure's size and how dirty it is from the photos; the customer is not asked for a size.`
      : `cat litter box cleaning.
Photo rules for litter boxes:
- Across all the photos together, every litter box in this task must be visible, AND the inside of each box (the litter) must be visible, e.g. a photo from above.
- Count the litter boxes you see; the estimate covers all of them.
The scope is the option the customer chose (given below). Instructions may narrow it, never widen it.`

  return `You review customer photos for a home cleaning service ("Tidy Tasks"), then estimate the work. The task is ${subject}

STEP 1 — Photo check. First describe in "seen" what the photos show (what object, whether it's whole, whether you can see its floor/bedding or litter, how many there are, lighting and focus). Then decide whether the photos, taken together, are good enough to judge this specific task.

DEFAULT TO ACCEPTING (photos_ok=true). A normal phone photo where you can see the whole thing to be cleaned and roughly how dirty it is, is good enough. Reject ONLY for one of these clear problems:
- "wrong_subject": no photo shows the thing to be cleaned at all (e.g. a photo of a sofa for a litter box task).
- "blurry": so blurry you can't make out the bedding/litter or the shape of the thing.
- "too_dark": so dark you can't make out the bedding/litter.
- "cropped": a large part of the enclosure or box is cut off by the edge of every photo.
- "missing_area": a whole part of what needs cleaning appears in no photo, e.g. the inside of a litter box can't be seen at all (only a closed lid or the outside), or the description mentions two litter boxes and only one is shown.
These are NOT problems: the pet being in the enclosure or box, toys, hides, food bowls or the pet covering some of the bedding or litter, glass or bars in front, clutter around it, a slightly angled view, or ordinary indoor lighting. If you can see most of the floor/bedding or litter, that's enough. A problem photo is fine if other photos already cover that area clearly.

If the photos are not good enough, set photos_ok=false, set problem to the main problem, list the 1-based numbers of photos that are unusable in unusable_photos (photos that are fine but just insufficient are NOT unusable), and write retake_message: one short, friendly sentence telling the customer exactly what to photograph next, e.g. "Please upload a brighter photo showing the full enclosure, including the floor and bedding." or "Please upload a photo from above so we can see inside the litter box."

STEP 2 — Only if photos_ok=true: check this is a valid Tidy Task (a cleaning activity one person can finish in under 30 minutes) and estimate, in whole minutes, how long one person would take to do the scope for what's shown (size, number of boxes, how dirty). Write scope as one short sentence describing exactly the work to be done.

Respond with JSON only:
{ "seen": string, "photos_ok": boolean, "problem": "blurry"|"too_dark"|"cropped"|"wrong_subject"|"missing_area"|null, "unusable_photos": number[], "retake_message": string, "valid": boolean, "reason": string, "scope": string, "estimated_minutes": number }
- If photos_ok=false, the step 2 fields can be empty/0.
- If valid=false, reason is one short, friendly sentence for the customer.`
}

// Checks the customer's photos for a pet enclosure / litter box task and, only
// when they pass, estimates the work from them. Throws if the AI can't be
// reached, so the caller can offer to check the same photos again.
export async function checkPetTaskPhotos(input: PetTaskCheckInput): Promise<PetTaskCheckResult> {
  const details = [
    `Task as the customer typed it: "${input.name}"`,
    input.kind === 'enclosure' && input.petType ? `Pet: ${input.petType}` : null,
    input.kind === 'litterBox' && input.litterOption
      ? `Chosen option: ${LITTER_OPTION_LABEL[input.litterOption]} — ${LITTER_OPTION_SCOPE[input.litterOption]}`
      : null,
    input.notes?.trim() ? `Customer's cleaning instructions: "${input.notes.trim()}"` : 'No cleaning instructions.',
    `${input.photos.length} photo(s) follow, numbered in order.`,
  ]
    .filter(Boolean)
    .join('\n')

  const completion = await getOpenAI().chat.completions.create({
    // gpt-4o-mini bills each image at many times the tokens, so gpt-4o costs
    // about the same per photo here and is much better at judging them.
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: petCheckPrompt(input.kind) },
      {
        role: 'user',
        content: [
          { type: 'text', text: details },
          ...input.photos.flatMap((url, i) => [
            { type: 'text' as const, text: `Photo ${i + 1}:` },
            { type: 'image_url' as const, image_url: { url, detail: 'high' as const } },
          ]),
        ],
      },
    ],
    response_format: { type: 'json_object' },
    // Same photos should get the same answer.
    temperature: 0,
    max_tokens: 500,
  })

  const raw = completion.choices[0].message.content
  if (!raw) throw new Error('Empty response from the photo check')
  const parsed = JSON.parse(raw) as {
    photos_ok?: boolean
    problem?: string | null
    unusable_photos?: unknown
    retake_message?: string
    valid?: boolean
    reason?: string
    scope?: string
    estimated_minutes?: number
  }

  if (parsed.photos_ok !== true) {
    const unusable = Array.isArray(parsed.unusable_photos)
      ? parsed.unusable_photos
          .map((n) => Number(n) - 1)
          .filter((i) => Number.isInteger(i) && i >= 0 && i < input.photos.length)
      : []
    const problem = PET_PROBLEMS.includes(parsed.problem as PetPhotoProblem) ? (parsed.problem as PetPhotoProblem) : null
    return {
      status: 'retake',
      problem,
      message: parsed.retake_message?.trim() || RETAKE_FALLBACK[input.kind],
      unusablePhotos: Array.from(new Set(unusable)),
    }
  }

  const minutes = Number.isFinite(parsed.estimated_minutes) ? Math.round(parsed.estimated_minutes as number) : null
  const tier = minutes != null && minutes > 0 ? tierFromEstimatedMinutes(minutes) : null

  if (parsed.valid === false) {
    return { status: 'invalid', reason: parsed.reason?.trim() || 'This doesn’t look like a Tidy Task we can do.' }
  }
  // Same 30-minute cap as every other Tidy Task, whatever the model said.
  if (minutes == null || tier == null) return { status: 'invalid', reason: TOO_LONG_MESSAGE[input.kind] }

  const fallbackScope =
    input.kind === 'litterBox' && input.litterOption ? LITTER_OPTION_SCOPE[input.litterOption] : ENCLOSURE_DEFAULT_SCOPE

  return { status: 'ok', scope: parsed.scope?.trim() || fallbackScope, estimated_minutes: minutes, tier }
}
