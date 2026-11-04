import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkUnresponsiveCleaners } from '@/lib/unresponsiveCleaners'

// Reminds a cleaner who hasn't tapped "I'm on the way" by a booking's start time, then
// emails the admin if they still haven't 15 minutes later. Safe to run as often as you
// like. Runs every minute from the database (see 036_unresponsive_cleaners).
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await checkUnresponsiveCleaners(createAdminClient())
  return NextResponse.json({ ok: true, ...result })
}
