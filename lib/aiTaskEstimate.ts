import OpenAI from 'openai'
import { tierFromEstimatedMinutes, type Tier } from './pricingRules'

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

INVALID examples: "Paint the walls", "Fix the leaky sink", "Cook dinner", "Build a shelf", "Grocery shopping"
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
