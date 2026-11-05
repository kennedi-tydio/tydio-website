import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendOnboardingReminders } from '@/lib/onboardingReminders'

// Emails a cleaner who hasn't finished onboarding 3 days after signing up, and again at
// 7 days along with the admin. Safe to run as often as you like. Runs daily from the
// database (see 051_onboarding_reminders).
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await sendOnboardingReminders(createAdminClient())
  return NextResponse.json({ ok: true, ...result })
}
