'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSquareFootage, type SquareFootage } from '@/lib/squareFootage'
import { userFacingError } from '@/lib/userFacingError'
import { normalizeEntryInstructions } from '@/lib/entryInstructions'

const ADDRESS_COLUMNS = 'id, label, street_address, unit_number, city, state, zip_code, latitude, longitude, is_default, square_footage, entry_instructions'

export interface NewAddressInput {
  label: string
  streetAddress: string
  unitNumber: string | null
  city: string
  state: string
  zipCode: string
  squareFootage: SquareFootage | null
  latitude?: number | null
  longitude?: number | null
}

export interface SavedAddress {
  id: string
  label: string
  street_address: string
  unit_number: string | null
  city: string
  state: string
  zip_code: string
  latitude: number | null
  longitude: number | null
  is_default: boolean
  // Null only for addresses saved before square footage was required.
  square_footage: string | null
  // Gate codes, where a key is kept — prefilled on bookings at this address.
  entry_instructions: string | null
}

export async function createAddressAction(
  input: NewAddressInput
): Promise<SavedAddress | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const label = input.label.trim()
  const streetAddress = input.streetAddress.trim()
  const city = input.city.trim()
  const state = input.state.trim()
  const zipCode = input.zipCode.trim()

  if (!label || !streetAddress || !city || !state || !zipCode) {
    return { error: 'Please fill in all required fields.' }
  }
  if (!isSquareFootage(input.squareFootage)) {
    return { error: 'Please choose the square footage for this address.' }
  }

  const admin = createAdminClient()

  const { count } = await admin
    .from('user_addresses')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', session.profileId)

  const { data, error } = await admin
    .from('user_addresses')
    .insert({
      user_id: session.profileId,
      label,
      street_address: streetAddress,
      unit_number: input.unitNumber?.trim() || null,
      city,
      state,
      zip_code: zipCode,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      is_default: (count ?? 0) === 0,
      square_footage: input.squareFootage,
    })
    .select(ADDRESS_COLUMNS)
    .single()

  if (error || !data) return { error: userFacingError(error, 'Failed to save address.') }

  revalidatePath('/dashboard/profile/addresses')
  revalidatePath('/book/schedule')
  return data
}

// For addresses saved before square footage was required.
export async function updateAddressSquareFootageAction(
  addressId: string,
  squareFootage: SquareFootage
): Promise<SavedAddress | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }
  if (!isSquareFootage(squareFootage)) return { error: 'Please choose a valid square footage.' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('user_addresses')
    .update({ square_footage: squareFootage, updated_at: new Date().toISOString() })
    .eq('id', addressId)
    .eq('user_id', session.profileId)
    .select(ADDRESS_COLUMNS)
    .single()

  if (error || !data) return { error: userFacingError(error, 'Failed to save square footage.') }

  revalidatePath('/dashboard/profile/addresses')
  revalidatePath('/book/schedule')
  return data
}

export async function updateAddressEntryInstructionsAction(
  addressId: string,
  entryInstructions: string
): Promise<SavedAddress | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('user_addresses')
    .update({ entry_instructions: normalizeEntryInstructions(entryInstructions), updated_at: new Date().toISOString() })
    .eq('id', addressId)
    .eq('user_id', session.profileId)
    .select(ADDRESS_COLUMNS)
    .single()

  if (error || !data) return { error: userFacingError(error, 'Failed to save entry instructions.') }

  revalidatePath('/dashboard/profile/addresses')
  revalidatePath('/book/review')
  return data
}

export async function deleteAddressAction(addressId: string): Promise<void> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return

  const admin = createAdminClient()
  await admin.from('user_addresses').delete().eq('id', addressId).eq('user_id', session.profileId)

  revalidatePath('/dashboard/profile/addresses')
}
