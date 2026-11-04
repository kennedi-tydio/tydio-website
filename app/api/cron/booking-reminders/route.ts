import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canSendSms, sendSmsForPayload } from '@/lib/sms'
import { sendPushForPayload } from '@/lib/push'
import { notifyStartsIn30 } from '@/lib/notifications'
import { notifyCustomer } from '@/lib/customerNotifications'
import { bookingStartInstant } from '@/lib/bookingTime'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date()
  const windowStart = new Date(now.getTime() + 25 * 60 * 1000)
  const windowEnd = new Date(now.getTime() + 35 * 60 * 1000)

  const { data: candidates } = await admin
    .from('bookings')
    .select('id, user_id, tidy_pro_id, scheduled_date, scheduled_time, time_zone')
    .eq('status', 'scheduled')
    .is('reminder_sent_at', null)
    // A day either side, since the booking's date is in the customer's zone, not the server's.
    .gte('scheduled_date', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
    .lte('scheduled_date', new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10))

  const dueBookings = (candidates ?? []).filter((b) => {
    if (!b.scheduled_date || !b.scheduled_time) return false
    const instant = bookingStartInstant(b.scheduled_date, b.scheduled_time, b.time_zone)
    return instant >= windowStart && instant <= windowEnd
  })

  if (dueBookings.length === 0) {
    return NextResponse.json({ ok: true, notified: 0 })
  }

  const tidyProIds = [...new Set(dueBookings.map((b) => b.tidy_pro_id).filter((id): id is string => !!id))]

  const { data: tidyPros } = tidyProIds.length
    ? await admin.from('tidypro_profiles').select('id, phone, sms_consent').in('id', tidyProIds)
    : { data: [] }

  const tidyProById = new Map((tidyPros ?? []).map((p) => [p.id, p]))

  for (const booking of dueBookings) {
    await notifyCustomer(admin, booking.user_id, notifyStartsIn30('USER', booking.id))

    if (booking.tidy_pro_id) {
      const tidyPro = tidyProById.get(booking.tidy_pro_id)
      const tidyProPayload = notifyStartsIn30('TIDYPRO', booking.id)
      if (canSendSms(tidyPro?.sms_consent ?? null, tidyPro?.phone ?? null)) {
        await sendSmsForPayload(tidyPro!.phone!, tidyProPayload).catch(() => {})
      }
      await sendPushForPayload(booking.tidy_pro_id, tidyProPayload).catch(() => {})
    }

    // Marks "evaluated," not "delivered" — otherwise an opted-out party
    // would make the cron retry this booking forever.
    await admin.from('bookings').update({ reminder_sent_at: new Date().toISOString() }).eq('id', booking.id)
  }

  return NextResponse.json({ ok: true, notified: dueBookings.length })
}
