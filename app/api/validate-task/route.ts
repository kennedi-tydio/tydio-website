import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

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
        content: `You validate whether a task is a valid "Tidy Task" for a home cleaning service.

A valid Tidy Task MUST be:
1. A specific cleaning or tidying activity (wiping, scrubbing, vacuuming, mopping, dusting, organizing, sanitizing, etc.)
2. Completable in under 30 minutes

INVALID examples: "Paint the walls", "Fix the leaky sink", "Cook dinner", "Build a shelf", "Do laundry", "Grocery shopping"
VALID examples: "Vacuum the rug", "Wipe down counters", "Scrub the toilet", "Clean the microwave inside", "Dust the shelves", "Mop the floor"

Respond with JSON only: { "valid": boolean, "reason": string }
- If valid, reason can be an empty string.
- If invalid, reason should be a short, friendly 1-sentence explanation for the user.`,
      },
      {
        role: 'user',
        content: taskDescription,
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 80,
  })

  const raw = completion.choices[0].message.content ?? '{"valid":true,"reason":""}'
  const result = JSON.parse(raw) as { valid: boolean; reason: string }
  return NextResponse.json(result)
}
