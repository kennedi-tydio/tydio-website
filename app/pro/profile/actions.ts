'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'

export async function updateBioAction(
  bio: string
): Promise<{ error: string } | { bio: string | null }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const trimmed = bio.trim() || null

  const admin = createAdminClient()
  const { error } = await admin
    .from('tidypro_profiles')
    .update({ bio: trimmed })
    .eq('id', session.profileId)

  if (error) return { error: error.message }

  revalidatePath('/pro/profile')
  return { bio: trimmed }
}
