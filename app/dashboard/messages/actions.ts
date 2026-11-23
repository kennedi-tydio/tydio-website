'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { userFacingError } from '@/lib/userFacingError'

// Archive (or unarchive) one of the customer's message threads. Finished bookings are
// archived on their own (see isAutoArchived), so this only matters for open ones.
export async function setThreadArchivedAction(
  bookingId: string,
  archived: boolean
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Please log in again.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('bookings')
    .update({ user_archived_at: archived ? new Date().toISOString() : null })
    .eq('id', bookingId)
    .eq('user_id', session.profileId)
  if (error) return { error: userFacingError(error) }

  revalidatePath('/dashboard/messages')
  return { success: true }
}
