'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { userFacingError } from '@/lib/userFacingError'

export async function updatePetsAction(pets: string): Promise<{ error: string } | { success: true }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ pets: pets.trim() || null })
    .eq('id', session.profileId)

  if (error) return { error: userFacingError(error) }

  revalidatePath('/dashboard/profile')
  return { success: true }
}
