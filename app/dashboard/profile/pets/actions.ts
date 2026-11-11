'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { extensionForType } from '@/lib/uploadExtension'
import { userFacingError } from '@/lib/userFacingError'
import {
  CUSTOMER_PET_PHOTOS_BUCKET,
  MAX_PETS,
  PETS_PATH,
  isOwnPetPhotoPath,
  validatePetInput,
  type PetInput,
} from '@/lib/customerPets'
import { loadCustomerPetsWithPhotos, type CustomerPetWithPhoto } from '@/lib/customerPetsData'

const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024

async function customerId(): Promise<string | null> {
  const session = await getSession()
  return session && session.role === 'USER' ? session.profileId : null
}

function revalidate() {
  revalidatePath(PETS_PATH)
  revalidatePath('/dashboard/profile')
}

async function removePhoto(path: string): Promise<void> {
  const { error } = await createAdminClient().storage.from(CUSTOMER_PET_PHOTOS_BUCKET).remove([path])
  if (error) console.error('[Tydio] Removing pet photo failed:', error)
}

// Stored privately under the customer's own folder; only ever shown through
// signed URLs (their Pets page and their booked Tidy Pro's views).
export async function uploadPetPhotoAction(formData: FormData): Promise<{ path: string; previewUrl: string | null } | { error: string }> {
  const profileId = await customerId()
  if (!profileId) return { error: 'Please sign in again.' }

  const file = formData.get('photo')
  if (!(file instanceof File) || file.size === 0) return { error: 'Please choose a photo to upload.' }
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) return { error: 'Please upload a JPG, PNG, or WEBP photo.' }
  if (file.size > MAX_PHOTO_SIZE_BYTES) return { error: 'Photo is too large. Please upload something under 10MB.' }

  const path = `${profileId}/${crypto.randomUUID()}.${extensionForType(file.type)}`
  const bucket = createAdminClient().storage.from(CUSTOMER_PET_PHOTOS_BUCKET)
  const { error } = await bucket.upload(path, file, { contentType: file.type, upsert: false })
  if (error) {
    console.error('[Tydio] Pet photo upload failed:', error)
    return { error: 'That photo didn’t upload. Please try again.' }
  }
  const { data: signed } = await bucket.createSignedUrl(path, 60 * 60)
  return { path, previewUrl: signed?.signedUrl ?? null }
}

// A photo picked in the form but never saved onto a pet. Best-effort: anything
// missed here is still removed with the account.
export async function discardPetPhotoAction(path: string): Promise<void> {
  const profileId = await customerId()
  if (!profileId || !isOwnPetPhotoPath(path, profileId)) return
  const { count } = await createAdminClient()
    .from('customer_pets')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .eq('photo_path', path)
  if (count) return
  await removePhoto(path)
}

// Adds a pet (no id) or edits one. Saving a pet also clears "I don't have any pets".
export async function savePetAction(
  input: PetInput & { id?: string; photoPath: string | null }
): Promise<{ pets: CustomerPetWithPhoto[] } | { error: string }> {
  const profileId = await customerId()
  if (!profileId) return { error: 'Please sign in again.' }

  const checked = validatePetInput(input)
  if ('error' in checked) return checked
  if (input.photoPath && !isOwnPetPhotoPath(input.photoPath, profileId)) return { error: 'That photo couldn’t be used.' }

  const admin = createAdminClient()
  const row = {
    name: checked.pet.name,
    pet_type: checked.pet.petType,
    notes: checked.pet.notes,
    photo_path: input.photoPath,
    updated_at: new Date().toISOString(),
  }

  if (input.id) {
    const { data: existing } = await admin
      .from('customer_pets')
      .select('photo_path')
      .eq('id', input.id)
      .eq('profile_id', profileId)
      .maybeSingle()
    if (!existing) return { error: 'That pet was not found.' }

    const { error } = await admin.from('customer_pets').update(row).eq('id', input.id).eq('profile_id', profileId)
    if (error) return { error: userFacingError(error) }
    if (existing.photo_path && existing.photo_path !== input.photoPath) await removePhoto(existing.photo_path)
  } else {
    const { count } = await admin.from('customer_pets').select('id', { count: 'exact', head: true }).eq('profile_id', profileId)
    if ((count ?? 0) >= MAX_PETS) return { error: `You can add up to ${MAX_PETS} pets.` }

    const { error } = await admin.from('customer_pets').insert({ ...row, profile_id: profileId })
    if (error) return { error: userFacingError(error) }
  }

  const { error: answerError } = await admin.from('profiles').update({ has_no_pets: false }).eq('id', profileId)
  if (answerError) return { error: userFacingError(answerError) }

  revalidate()
  return { pets: await loadCustomerPetsWithPhotos(admin, profileId) }
}

export async function deletePetAction(id: string): Promise<{ pets: CustomerPetWithPhoto[] } | { error: string }> {
  const profileId = await customerId()
  if (!profileId) return { error: 'Please sign in again.' }

  const admin = createAdminClient()
  const { data: removed, error } = await admin
    .from('customer_pets')
    .delete()
    .eq('id', id)
    .eq('profile_id', profileId)
    .select('photo_path')
  if (error) return { error: userFacingError(error) }
  const photo = removed?.[0]?.photo_path
  if (photo) await removePhoto(photo)

  revalidate()
  return { pets: await loadCustomerPetsWithPhotos(admin, profileId) }
}

// "I don't have any pets". Only offered once every pet has been removed, so it
// can't quietly contradict a pet that's still listed.
export async function setNoPetsAction(hasNoPets: boolean): Promise<{ success: true } | { error: string }> {
  const profileId = await customerId()
  if (!profileId) return { error: 'Please sign in again.' }

  const admin = createAdminClient()
  if (hasNoPets) {
    const { count } = await admin.from('customer_pets').select('id', { count: 'exact', head: true }).eq('profile_id', profileId)
    if (count) return { error: 'Remove the pets listed above first.' }
  }
  const { error } = await admin.from('profiles').update({ has_no_pets: hasNoPets }).eq('id', profileId)
  if (error) return { error: userFacingError(error) }

  revalidate()
  return { success: true }
}
