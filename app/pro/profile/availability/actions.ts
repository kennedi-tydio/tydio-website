'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { WEEKDAY_KEYS, type WeeklyAvailability } from '@/lib/cleanerMatching'
import { userFacingError } from '@/lib/userFacingError'

// Saved on its own, the moment it's toggled, so it never depends on the cleaner also
// saving their hours. Those stay as they are, ready for when they come back.
export async function setAwayAction(away: boolean): Promise<{ error: string } | { success: true }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const admin = createAdminClient()
  const { error } = await admin.from('tidypro_profiles').update({ is_away: away }).eq('id', session.profileId)

  if (error) return { error: userFacingError(error) }

  revalidatePath('/pro/profile/availability')
  return { success: true }
}

export async function saveAvailabilityAction(
  availability: WeeklyAvailability
): Promise<{ error: string } | { success: true }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const cleaned: WeeklyAvailability = {}
  for (const day of WEEKDAY_KEYS) {
    const ranges = availability[day]
    if (!ranges || ranges.length === 0) continue
    for (const range of ranges) {
      if (!range.start || !range.end) return { error: 'Please fill in every time range, or remove it.' }
    }
    cleaned[day] = ranges
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('tidypro_profiles')
    .update({ availability: cleaned as never })
    .eq('id', session.profileId)

  if (error) return { error: userFacingError(error) }

  revalidatePath('/pro/profile/availability')
  return { success: true }
}
