'use server'

import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkNewVisitTime } from '@/lib/recurringPayments'

// Checked before going on to pay, so the customer isn't sent to pay for a time that's
// gone. It's checked again when they pay.
export async function checkVisitTimeAction(bookingId: string, date: string, time: string): Promise<string | null> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return 'Not authorized'

  const admin = createAdminClient()
  const { data: booking } = await admin
    .from('bookings')
    .select('id, tidy_pro_id, estimated_duration_minutes, time_zone, suspended_for_payment_at')
    .eq('id', bookingId)
    .eq('user_id', session.profileId)
    .maybeSingle()
  if (!booking?.suspended_for_payment_at) return 'This booking doesn’t need a new date. Please go back.'
  return checkNewVisitTime(admin, booking, date, time)
}
