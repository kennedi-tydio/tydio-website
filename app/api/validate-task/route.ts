import { NextRequest, NextResponse } from 'next/server'
import { estimateTaskDuration } from '@/lib/aiTaskEstimate'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { RATE_LIMITS, isRateLimited, recordRateLimitEvent } from '@/lib/rateLimit'

export async function POST(req: NextRequest) {
  // Every estimate is a paid OpenAI call, so only signed-in customers get them.
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const key = `task-estimate:user:${session.profileId}`
  if (await isRateLimited(admin, key, RATE_LIMITS.taskEstimatePerUser)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  await recordRateLimitEvent(admin, key)

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
