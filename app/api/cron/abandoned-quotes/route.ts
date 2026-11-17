import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAbandonedQuotes } from '@/lib/pricingQuotes'

// Marks quotes abandoned once a customer has gone quiet after seeing their price, and
// emails the admin the tasks and prices. Safe to run as often as you like. Runs every
// 15 minutes from the database (see 081_pricing_quotes).
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await checkAbandonedQuotes(createAdminClient())
  return NextResponse.json({ ok: true, ...result })
}
