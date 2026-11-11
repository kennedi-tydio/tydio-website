import type { createAdminClient } from '@/lib/supabase/admin'
import { CUSTOMER_PET_PHOTOS_BUCKET, hasAnsweredPets, petsSummary, type CustomerPet } from './customerPets'

type Admin = ReturnType<typeof createAdminClient>

// Long enough to look through a page, short enough that a copied link stops
// working soon after (same as task photos).
const SIGNED_URL_SECONDS = 60 * 60

export type CustomerPetWithPhoto = CustomerPet & { photoUrl: string | null }

export async function loadCustomerPets(admin: Admin, profileId: string): Promise<CustomerPet[]> {
  const { data, error } = await admin
    .from('customer_pets')
    .select('id, name, pet_type, notes, photo_path')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`Failed to load pets: ${error.message}`)
  return (data ?? []).map((r) => ({ id: r.id, name: r.name, petType: r.pet_type, notes: r.notes, photoPath: r.photo_path }))
}

// Pets with signed, expiring photo URLs. A photo that can't be signed is just
// left off rather than failing the page.
export async function loadCustomerPetsWithPhotos(admin: Admin, profileId: string): Promise<CustomerPetWithPhoto[]> {
  const pets = await loadCustomerPets(admin, profileId)
  const paths = pets.map((p) => p.photoPath).filter((p): p is string => !!p)
  const urls: Record<string, string> = {}
  if (paths.length > 0) {
    try {
      const { data, error } = await admin.storage.from(CUSTOMER_PET_PHOTOS_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS)
      if (error) console.error('[Tydio] Signing pet photo URLs failed:', error)
      for (const item of data ?? []) {
        if (item.path && item.signedUrl && !item.error) urls[item.path] = item.signedUrl
      }
    } catch (err) {
      console.error('[Tydio] Signing pet photo URLs failed:', err)
    }
  }
  return pets.map((p) => ({ ...p, photoUrl: p.photoPath ? urls[p.photoPath] ?? null : null }))
}

async function loadHasNoPets(admin: Admin, profileId: string): Promise<boolean> {
  const { data, error } = await admin.from('profiles').select('has_no_pets').eq('id', profileId).maybeSingle()
  if (error) throw new Error(`Failed to load pets answer: ${error.message}`)
  return data?.has_no_pets === true
}

// Whether a customer still has to answer the pets question before booking.
export async function customerNeedsPets(admin: Admin, profileId: string): Promise<boolean> {
  const [hasNoPets, { count, error }] = await Promise.all([
    loadHasNoPets(admin, profileId),
    admin.from('customer_pets').select('id', { count: 'exact', head: true }).eq('profile_id', profileId),
  ])
  if (error) throw new Error(`Failed to count pets: ${error.message}`)
  return !hasAnsweredPets(hasNoPets, count ?? 0)
}

// The text saved on a booking when it's requested (bookings.pets).
export async function customerPetsSummary(admin: Admin, profileId: string): Promise<string | null> {
  const [pets, hasNoPets] = await Promise.all([loadCustomerPets(admin, profileId), loadHasNoPets(admin, profileId)])
  return petsSummary(pets, hasNoPets)
}
