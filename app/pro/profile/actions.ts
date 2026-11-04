'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { isBanned, normalizePhone } from '@/lib/bannedUsers'

const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024
const MAX_ALLERGIES = 20
const MAX_ALLERGY_LENGTH = 60

function revalidateProfilePages(tidyProId: string) {
  revalidatePath('/pro/profile')
  revalidatePath('/pro/profile/edit')
  revalidatePath('/pro/profile/preview')
  revalidatePath(`/book/schedule/${tidyProId}`)
}

export async function updateProfileAction(input: {
  firstName: string
  lastName: string
  bio: string
  phone: string
  allergies: string[]
}): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()
  const phone = input.phone.trim()
  const allergies = input.allergies.map((a) => a.trim()).filter(Boolean)

  if (!firstName || !lastName) return { error: 'Please enter your first and last name.' }
  const normalizedPhone = normalizePhone(phone)
  if (normalizedPhone.length !== 10) return { error: 'Please enter a valid 10-digit phone number.' }
  if (allergies.length > MAX_ALLERGIES) return { error: `Please list ${MAX_ALLERGIES} allergies or fewer.` }
  if (allergies.some((a) => a.length > MAX_ALLERGY_LENGTH)) {
    return { error: `Please keep each allergy under ${MAX_ALLERGY_LENGTH} characters.` }
  }

  const admin = createAdminClient()

  if (await isBanned(admin, { phone })) return { error: 'That phone number cannot be used on Tydio.' }

  // Same rule as signup: one phone number can't be on two Tidy Pro accounts.
  const { data: otherPhones } = await admin
    .from('profiles')
    .select('phone')
    .eq('role', 'TIDYPRO')
    .neq('id', session.profileId)
    .not('phone', 'is', null)
  if ((otherPhones ?? []).some((p) => p.phone && normalizePhone(p.phone) === normalizedPhone)) {
    return { error: 'A Tidy Pro account already exists with this phone number.' }
  }

  const { error: profileError } = await admin
    .from('profiles')
    .update({ first_name: firstName, last_name: lastName, phone })
    .eq('id', session.profileId)
  if (profileError) return { error: profileError.message }

  const { error: tidyProError } = await admin
    .from('tidypro_profiles')
    .update({ bio: input.bio.trim() || null, phone, allergies })
    .eq('id', session.profileId)
  if (tidyProError) return { error: tidyProError.message }

  revalidateProfilePages(session.profileId)
  return { success: true }
}

export async function updateProfilePhotoAction(
  formData: FormData
): Promise<{ photoUrl: string } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const file = formData.get('photo')
  if (!(file instanceof File) || file.size === 0) return { error: 'Please choose a photo to upload.' }
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) return { error: 'Please upload a JPG, PNG, or WEBP photo.' }
  if (file.size > MAX_PHOTO_SIZE_BYTES) return { error: 'Photo is too large — please upload something under 10MB.' }

  const admin = createAdminClient()

  const extension = file.name.split('.').pop() ?? 'jpg'
  const path = `${session.profileId}/${Date.now()}.${extension}`

  const { error: uploadError } = await admin.storage
    .from('profile-photos')
    .upload(path, file, { contentType: file.type, upsert: true })
  if (uploadError) return { error: 'Upload failed — please try again.' }

  // Public bucket, same as task-photos — customers render this as a plain <img src>.
  const photoUrl = admin.storage.from('profile-photos').getPublicUrl(path).data.publicUrl

  const { error } = await admin
    .from('tidypro_profiles')
    .update({ profile_photo_url: photoUrl })
    .eq('id', session.profileId)
  if (error) return { error: error.message }

  revalidateProfilePages(session.profileId)
  return { photoUrl }
}
