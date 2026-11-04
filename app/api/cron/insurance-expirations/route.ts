import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { expireDueInsurance } from '@/lib/insuranceExpiration'

// Reminds a cleaner 3 days before their insurance expires, then marks it expired on the
// date and tells the cleaner and admin. Safe to run as often as you like. Runs hourly
// from the database (see 029_insurance_expiration).
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await expireDueInsurance(createAdminClient())
  return NextResponse.json({ ok: true, ...result })
}
