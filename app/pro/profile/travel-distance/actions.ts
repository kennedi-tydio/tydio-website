'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { MAX_TRAVEL_RADIUS_MILES } from '@/lib/cleanerMatching'
import { userFacingError } from '@/lib/userFacingError'

export async function saveTravelRadiusAction(miles: number): Promise<{ error?: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  if (!Number.isInteger(miles) || miles < 1 || miles > MAX_TRAVEL_RADIUS_MILES) {
    return { error: `Please choose between 1 and ${MAX_TRAVEL_RADIUS_MILES} miles.` }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('tidypro_profiles')
    .update({ travel_radius_miles: miles })
    .eq('id', session.profileId)

  if (error) return { error: userFacingError(error) }

  revalidatePath('/pro/profile/travel-distance')
  revalidatePath('/pro/dashboard')
  return {}
}
