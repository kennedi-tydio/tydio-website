'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { userFacingError } from '@/lib/userFacingError'
import { notifyIfOnboardingComplete } from '@/lib/onboardingComplete'
import { normalizeServices } from '@/lib/tidyProServices'
import { isFullServiceType, type FullServiceType } from '@/lib/fullService'
import { ratesRowFromInput, resolveRates, unpricedFullServices, type RatesInput } from '@/lib/fullServiceRates'

// Saves the Tidy Pro's Standard / Deep Cleaning prices. `adding` is the
// service they ticked on Services Provided and came here to price: it's added
// to their services once its prices are saved (a service can't be offered
// without them).
export async function saveFullServiceRatesAction(input: RatesInput, adding?: string | null): Promise<{ error?: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const { row, error: invalid } = ratesRowFromInput(input)
  if (!row) return { error: invalid ?? 'Please check your prices.' }

  const admin = createAdminClient()
  const { data: tidyPro, error: loadError } = await admin
    .from('tidypro_profiles')
    .select('services_provided')
    .eq('id', session.profileId)
    .single()
  if (loadError) return { error: userFacingError(loadError) }

  const add: FullServiceType | null = isFullServiceType(adding) ? adding : null
  const current = normalizeServices(tidyPro?.services_provided)
  const services = add ? normalizeServices([...current, add === 'deep' ? 'deepCleaning' : 'standardCleaning']) : current

  // Every Standard / Deep Cleaning they offer (or are adding) needs a price.
  const missing = unpricedFullServices(services, resolveRates({ tidy_pro_id: session.profileId, ...row }))
  if (missing.length > 0) {
    const label = missing.length === 2 ? 'Standard and Deep Cleaning' : missing[0] === 'deep' ? 'Deep Cleaning' : 'Standard Cleaning'
    return {
      error: `Enter your whole-home price for ${label}, or remove it from Services Provided.`,
    }
  }

  const { error } = await admin
    .from('tidypro_full_service_rates')
    .upsert(
      {
        tidy_pro_id: session.profileId,
        standard_base_take_home: row.standard_base_take_home as number | null,
        deep_base_take_home: row.deep_base_take_home as number | null,
        standard_room_percents: row.standard_room_percents as never,
        deep_room_percents: row.deep_room_percents as never,
        add_ons: row.add_ons as never,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tidy_pro_id' }
    )
  if (error) return { error: userFacingError(error) }

  if (add && services.length !== current.length) {
    const { error: addError } = await admin.from('tidypro_profiles').update({ services_provided: services }).eq('id', session.profileId)
    if (addError) return { error: userFacingError(addError) }
    await notifyIfOnboardingComplete(admin, session.profileId)
  }

  revalidatePath('/pro/profile/services/pricing')
  revalidatePath('/pro/profile/services')
  revalidatePath('/pro/dashboard')
  return {}
}
