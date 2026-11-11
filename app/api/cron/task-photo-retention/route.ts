import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { removeExpiredTaskPhotos } from '@/lib/taskPhotoRetention'

// Deletes task photos 7 days after their booking ends (Tidy Pro completion
// photos and customer pet task photos), and customer photos on tasks that were
// never booked 7 days after upload. Safe to run as often as you like. Runs
// hourly from the database (see 060_task_photo_retention).
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await removeExpiredTaskPhotos(createAdminClient())
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[Tydio] Task photo retention failed:', err)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
