import type { createAdminClient } from '@/lib/supabase/admin'
import { CUSTOMER_TASK_PHOTOS_BUCKET, petTaskPhotoPaths, type PetTaskDetails } from './petTasks'

type Admin = ReturnType<typeof createAdminClient>

// Long enough to look through a booking page, short enough that a copied link
// stops working soon after.
const SIGNED_URL_SECONDS = 60 * 60

// Signed, expiring URLs for the photos saved on a list of pet tasks, keyed by
// storage path. Missing or failed paths are simply left out (the photo isn't
// shown) rather than failing the page.
export async function signedTaskPhotoUrls(
  admin: Admin,
  tasks: { pet?: PetTaskDetails | null }[]
): Promise<Record<string, string>> {
  const paths = petTaskPhotoPaths(tasks)
  if (paths.length === 0) return {}
  try {
    const { data, error } = await admin.storage.from(CUSTOMER_TASK_PHOTOS_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS)
    if (error || !data) {
      console.error('[Tydio] Signing task photo URLs failed:', error)
      return {}
    }
    const urls: Record<string, string> = {}
    for (const item of data) {
      if (item.path && item.signedUrl && !item.error) urls[item.path] = item.signedUrl
    }
    return urls
  } catch (err) {
    console.error('[Tydio] Signing task photo URLs failed:', err)
    return {}
  }
}
