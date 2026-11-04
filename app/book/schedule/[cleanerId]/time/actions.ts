'use server'

import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { userFacingError } from '@/lib/userFacingError'

export async function confirmSelectionAction(
  draftId: string,
  cleanerId: string,
  date: string,
  time: string
): Promise<{ error: string } | { success: true }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('booking_drafts')
    .update({
      selected_tidy_pro_id: cleanerId,
      scheduled_date: date,
      scheduled_time: time,
    })
    .eq('id', draftId)
    .eq('customer_user_id', session.profileId)

  if (error) return { error: userFacingError(error) }

  return { success: true }
}
