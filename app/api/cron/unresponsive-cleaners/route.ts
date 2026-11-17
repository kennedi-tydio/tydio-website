import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkArrivalWithCustomers, checkUnresponsiveCleaners } from '@/lib/unresponsiveCleaners'

// Reminds a cleaner who hasn't tapped "I'm on the way" by a booking's start time, asks
// the customer 10 minutes after the start if the cleaner still hasn't marked themselves
// arrived, and emails the admin if they haven't tapped "I'm on the way" 15 minutes in. Safe to run as often as you
// like. Runs every minute from the database (see 036_unresponsive_cleaners).
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const result = await checkUnresponsiveCleaners(admin)
  const arrival = await checkArrivalWithCustomers(admin)
  return NextResponse.json({ ok: true, ...result, arrivalChecks: arrival.asked, arrivalCheckFailures: arrival.failed })
}
