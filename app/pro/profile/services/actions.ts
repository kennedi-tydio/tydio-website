'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { userFacingError } from '@/lib/userFacingError'
import { notifyIfOnboardingComplete } from '@/lib/onboardingComplete'
import { normalizeServices } from '@/lib/tidyProServices'

export async function saveServicesAction(services: string[]): Promise<{ error?: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const chosen = normalizeServices(services)
  if (chosen.length === 0) return { error: 'Choose at least one service you provide.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('tidypro_profiles')
    .update({ services_provided: chosen })
    .eq('id', session.profileId)

  if (error) return { error: userFacingError(error) }

  // This can be the last onboarding step.
  await notifyIfOnboardingComplete(admin, session.profileId)
  revalidatePath('/pro/profile/services')
  revalidatePath('/pro/dashboard')
  return {}
}
