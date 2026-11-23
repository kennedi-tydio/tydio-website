import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { expireUnacceptedBookings } from '@/lib/bookingRequestGroups'
import { retryDuePayouts } from '@/lib/bookings'
import { expireTaskAdditions } from '@/lib/bookingTaskAdditions'
import { expireQuoteRequests } from '@/lib/quoteRequests'

// Cancels and refunds any booking still not accepted an hour before it starts. Safe to
// run as often as you like. Runs every minute from the database (see 027_scheduled_jobs).
// Also retries Tidy Pro payouts whose transfer failed (completed bookings, late
// cancellations, settled incidents; not ones the admin has on hold), and refunds
// added-task requests the Tidy Pro didn't answer before the booking started. Quote requests
// not approved and paid in time end too, and their tasks go back on the dashboard.
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const result = await expireUnacceptedBookings(admin)
  const payouts = await retryDuePayouts(admin)
  const taskAdditions = await expireTaskAdditions(admin)
  const quoteRequests = await expireQuoteRequests(admin).catch((err) => {
    console.error('[Tydio] Expiring quote requests failed:', err)
    return { expired: 0 }
  })
  return NextResponse.json({ ok: true, ...result, payouts, taskAdditions, quoteRequests })
}
