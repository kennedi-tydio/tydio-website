import { NextRequest, NextResponse } from 'next/server'
import { estimateTaskDuration } from '@/lib/aiTaskEstimate'

export async function POST(req: NextRequest) {
  const { name, notes, room, dirtLevel, unusual } = await req.json() as {
    name?: string
    notes?: string
    room?: string
    dirtLevel?: string | null
    unusual?: string[]
  }

  try {
    const result = await estimateTaskDuration({ name: name ?? '', room, notes, dirtLevel, unusual })
    return NextResponse.json(result)
  } catch (err) {
    // Usually the AI provider (e.g. OpenAI out of credits, bad key). Log the
    // real cause here; the Add Task modal shows the customer a generic error.
    console.error('[Tydio] Task estimate failed:', err)
    return NextResponse.json({ error: 'estimate_unavailable' }, { status: 503 })
  }
}
