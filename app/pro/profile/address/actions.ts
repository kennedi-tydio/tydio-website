'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { userFacingError } from '@/lib/userFacingError'
import { notifyIfOnboardingComplete } from '@/lib/onboardingComplete'

export interface AddressInput {
  streetAddress: string
  unitNumber?: string | null
  city: string
  state: string
  zipCode: string
  latitude?: number | null
  longitude?: number | null
}

export interface SavedAddress {
  street_address: string
  unit_number: string | null
  city: string
  state: string
  zip_code: string
  latitude: number | null
  longitude: number | null
}

export async function saveAddressAction(
  input: AddressInput
): Promise<SavedAddress | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const streetAddress = input.streetAddress.trim()
  const unitNumber = input.unitNumber?.trim() || null
  const city = input.city.trim()
  const state = input.state.trim()
  const zipCode = input.zipCode.trim()

  if (!streetAddress || !city || !state || !zipCode) {
    return { error: 'Please fill in all required fields.' }
  }

  const admin = createAdminClient()

  const { error } = await admin
    .from('tidypro_profiles')
    .update({
      street_address: streetAddress,
      unit_number: unitNumber,
      city,
      state,
      zip_code: zipCode,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
    })
    .eq('id', session.profileId)

  if (error) return { error: userFacingError(error) }

  await notifyIfOnboardingComplete(admin, session.profileId)
  revalidatePath('/pro/profile/address')
  return {
    street_address: streetAddress,
    unit_number: unitNumber,
    city,
    state,
    zip_code: zipCode,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
  }
}

export async function removeAddressAction(): Promise<void> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return

  const admin = createAdminClient()
  await admin
    .from('tidypro_profiles')
    .update({ street_address: null, unit_number: null, city: null, state: null, zip_code: null, latitude: null, longitude: null })
    .eq('id', session.profileId)

  revalidatePath('/pro/profile/address')
}
