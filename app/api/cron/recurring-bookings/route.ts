import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { bookDueRecurringVisits } from '@/lib/recurringBookings'
import { processRecurringVisitPayments } from '@/lib/recurringPayments'

// Books each recurring booking's next visit a week ahead, then charges, retries,
// suspends or cancels visits of accepted series as their payment comes due (see
// lib/recurringPayments). Safe to run as often as you like. Runs hourly from the
// database (see 069_recurring_bookings).
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const visits = await bookDueRecurringVisits(admin)
  const payments = await processRecurringVisitPayments(admin)
  return NextResponse.json({ ok: true, ...visits, payments })
}
