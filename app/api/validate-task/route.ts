import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { tierFromEstimatedMinutes } from '@/lib/pricingRules'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: NextRequest) {
  const { name, notes, room } = await req.json()

  const taskDescription = [
    name ? `Task: "${name}"` : null,
    room ? `Room: "${room}"` : null,
    notes ? `Notes: "${notes}"` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const completion = await openai.chat.completions.create({
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

Respond with JSON only: { "valid": boolean, "reason": string, "estimated_minutes": number }
- estimated_minutes: your best-effort estimate, in whole minutes, of how long one person would take to complete this specific task.
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

  return NextResponse.json({ valid, reason, estimated_minutes: estimatedMinutes, tier })
}
