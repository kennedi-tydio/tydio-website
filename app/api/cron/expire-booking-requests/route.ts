import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { expireUnacceptedBookings } from '@/lib/bookingRequestGroups'
import { retryLateCancellationPayouts } from '@/lib/bookings'

// Cancels and refunds any booking still not accepted an hour before it starts. Safe to
// run as often as you like. Runs every minute from the database (see 027_scheduled_jobs).
// Also retries paying cleaners for late cancellations whose transfer failed.
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const result = await expireUnacceptedBookings(admin)
  const lateCancellationPayouts = await retryLateCancellationPayouts(admin)
  return NextResponse.json({ ok: true, ...result, lateCancellationPayouts })
}
