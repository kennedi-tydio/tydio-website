import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteExpiredBans } from '@/lib/banAccount'
import { expireBackgroundCheckDenials } from '@/lib/backgroundCheckAppeals'

// Bans cleaners whose background check denial wasn't overturned within 7 days, then
// deletes banned accounts 7 days after the ban, or once their appeal is denied. Safe
// to run as often as you like. Runs hourly from the database (see 041_ban_appeals).
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const backgroundCheckDenials = await expireBackgroundCheckDenials(admin)
  const bans = await deleteExpiredBans(admin)
  return NextResponse.json({ ok: true, backgroundCheckDenials, bans })
}
