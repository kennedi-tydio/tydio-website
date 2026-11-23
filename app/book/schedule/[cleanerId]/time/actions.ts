'use server'

import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { userFacingError } from '@/lib/userFacingError'
import { bookingBlockedByAccess } from '@/lib/accountSuspension'

export async function confirmSelectionAction(
  draftId: string,
  cleanerId: string,
  date: string,
  time: string
): Promise<{ error: string } | { success: true }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const admin = createAdminClient()
  const noAccess = await bookingBlockedByAccess(admin, session.profileId)
  if (noAccess) return { error: noAccess }

  const { error } = await admin
    .from('booking_drafts')
    .update({
      selected_tidy_pro_id: cleanerId,
      // The exact time chosen replaces any range searched with.
      scheduled_date: date,
      scheduled_end_date: null,
      scheduled_time: time,
      scheduled_end_time: null,
    })
    .eq('id', draftId)
    .eq('customer_user_id', session.profileId)

  if (error) return { error: userFacingError(error) }

  return { success: true }
}
