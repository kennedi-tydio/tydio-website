import type { createAdminClient } from '@/lib/supabase/admin'
import type { TidyTask } from '@/app/dashboard/types'
import { CUSTOMER_TASK_PHOTOS_BUCKET, isPetTask, petTaskPhotoPaths } from './petTasks'

type Admin = ReturnType<typeof createAdminClient>

// Task photos are deleted this long after a booking ends (completed,
// cancelled, declined, ...): the Tidy Pro's completion photos and the photos
// the customer added to pet enclosure / litter box tasks. Customer photos on
// tasks that never get booked go this long after upload.
export const TASK_PHOTO_RETENTION_DAYS = 7

export const COMPLETION_PHOTOS_BUCKET = 'task-photos'

const OPEN_BOOKING_STATUSES = ['pending', 'scheduled']
// Bookings handled per run; the job runs hourly, so a backlog clears quickly.
const BOOKINGS_PER_RUN = 100
const LIST_PAGE = 1000

export function retentionCutoff(now: Date): Date {
  return new Date(now.getTime() - TASK_PHOTO_RETENTION_DAYS * 24 * 60 * 60 * 1000)
}

type EndedBooking = {
  status: string | null
  ended_at: string | null
  incident_reported_at: string | null
  incident_resolved_at: string | null
}

// Whether a booking's photos are due for deletion: it ended at least 7 days
// ago, and any no-show / no-access report on it was settled at least 7 days
// ago (the photos may matter while an admin is deciding it).
export function bookingPhotosExpired(b: EndedBooking, cutoff: Date): boolean {
  if (!b.status || OPEN_BOOKING_STATUSES.includes(b.status)) return false
  if (!b.ended_at || new Date(b.ended_at) > cutoff) return false
  if (b.incident_reported_at) {
    if (!b.incident_resolved_at || new Date(b.incident_resolved_at) > cutoff) return false
  }
  return true
}

type StoredPhoto = { path: string; createdAt: string | null }

// Customer task photos uploaded at least 7 days ago that no booking still
// needs. A photo on a booking stays until that booking's own photos expire.
export function unbookedPhotosToDelete(files: StoredPhoto[], stillNeeded: Set<string>, cutoff: Date): string[] {
  return files
    .filter((f) => f.createdAt != null && new Date(f.createdAt) <= cutoff && !stillNeeded.has(f.path))
    .map((f) => f.path)
}

// A draft's tasks with deleted photos taken off. A pet task left with no
// photos can't be priced, so the customer re-adds it with fresh photos.
export function stripDeletedPhotos(tasks: TidyTask[], deleted: Set<string>): { tasks: TidyTask[]; changed: boolean } {
  let changed = false
  const next = tasks.map((t) => {
    if (!isPetTask(t) || !t.pet.photos.some((p) => deleted.has(p))) return t
    changed = true
    return { ...t, pet: { ...t.pet, photos: t.pet.photos.filter((p) => !deleted.has(p)) } }
  })
  return { tasks: next, changed }
}

async function listFolder(admin: Admin, bucket: string, prefix: string) {
  const entries: { name: string; id: string | null; created_at: string | null }[] = []
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: LIST_PAGE, offset })
    if (error) throw new Error(`Listing ${bucket}/${prefix} failed: ${error.message}`)
    entries.push(...(data ?? []))
    if (!data || data.length < LIST_PAGE) return entries
  }
}

async function removePaths(admin: Admin, bucket: string, paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += LIST_PAGE) {
    const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + LIST_PAGE))
    if (error) throw new Error(`Removing from ${bucket} failed: ${error.message}`)
  }
}

// Step 1: bookings that ended 7+ days ago lose their completion photos and
// the customer's pet task photos. Each booking is handled once.
async function removeEndedBookingPhotos(admin: Admin, cutoff: Date) {
  const { data: bookings, error } = await admin
    .from('bookings')
    .select('id, status, ended_at, incident_reported_at, incident_resolved_at, task_list')
    .is('task_photos_removed_at', null)
    .not('ended_at', 'is', null)
    .lte('ended_at', cutoff.toISOString())
    .order('ended_at', { ascending: true })
    .limit(BOOKINGS_PER_RUN)
  if (error) throw new Error(`Loading ended bookings failed: ${error.message}`)

  let bookingsCleared = 0
  let completionPhotos = 0
  let customerPhotos = 0
  for (const b of bookings ?? []) {
    if (!bookingPhotosExpired(b, cutoff)) continue
    try {
      const files = await listFolder(admin, COMPLETION_PHOTOS_BUCKET, b.id)
      const completionPaths = files.filter((f) => f.id != null).map((f) => `${b.id}/${f.name}`)
      await removePaths(admin, COMPLETION_PHOTOS_BUCKET, completionPaths)

      const petPaths = petTaskPhotoPaths((b.task_list as TidyTask[] | null) ?? [])
      await removePaths(admin, CUSTOMER_TASK_PHOTOS_BUCKET, petPaths)

      const { error: tasksError } = await admin
        .from('booking_tasks')
        .update({ completion_photo_url: null })
        .eq('booking_id', b.id)
        .not('completion_photo_url', 'is', null)
      if (tasksError) throw new Error(tasksError.message)

      const { error: markError } = await admin
        .from('bookings')
        .update({ task_photos_removed_at: new Date().toISOString() })
        .eq('id', b.id)
      if (markError) throw new Error(markError.message)

      bookingsCleared += 1
      completionPhotos += completionPaths.length
      customerPhotos += petPaths.length
    } catch (err) {
      // Left unmarked, so the next run tries this booking again.
      console.error(`[Tydio] Removing task photos for booking ${b.id} failed:`, err)
    }
  }
  return { bookingsCleared, completionPhotos, customerPhotos }
}

// Step 2: customer photos 7+ days old that no booking still needs (tasks never
// booked, or removed from Add Task without cleanup). Drafts that pointed at
// them lose those photos.
async function removeUnbookedCustomerPhotos(admin: Admin, cutoff: Date) {
  // Pet photos on any booking whose photos haven't expired yet.
  const { data: liveBookings, error } = await admin
    .from('bookings')
    .select('task_list')
    .is('task_photos_removed_at', null)
  if (error) throw new Error(`Loading bookings failed: ${error.message}`)
  const stillNeeded = new Set(
    (liveBookings ?? []).flatMap((b) => petTaskPhotoPaths((b.task_list as TidyTask[] | null) ?? []))
  )

  const folders = (await listFolder(admin, CUSTOMER_TASK_PHOTOS_BUCKET, '')).filter((e) => e.id == null)
  const deleted: string[] = []
  const owners: string[] = []
  for (const folder of folders) {
    const files = (await listFolder(admin, CUSTOMER_TASK_PHOTOS_BUCKET, folder.name))
      .filter((f) => f.id != null)
      .map((f) => ({ path: `${folder.name}/${f.name}`, createdAt: f.created_at }))
    const expired = unbookedPhotosToDelete(files, stillNeeded, cutoff)
    if (expired.length === 0) continue
    await removePaths(admin, CUSTOMER_TASK_PHOTOS_BUCKET, expired)
    deleted.push(...expired)
    owners.push(folder.name)
  }

  let draftsUpdated = 0
  if (owners.length > 0) {
    const deletedSet = new Set(deleted)
    const { data: drafts } = await admin
      .from('booking_drafts')
      .select('id, task_list')
      .in('customer_user_id', owners)
    for (const d of drafts ?? []) {
      const { tasks, changed } = stripDeletedPhotos((d.task_list as TidyTask[] | null) ?? [], deletedSet)
      if (!changed) continue
      const { error: draftError } = await admin.from('booking_drafts').update({ task_list: tasks as never }).eq('id', d.id)
      if (draftError) console.error(`[Tydio] Updating draft ${d.id} after photo removal failed:`, draftError)
      else draftsUpdated += 1
    }
  }
  return { unbookedPhotos: deleted.length, draftsUpdated }
}

export async function removeExpiredTaskPhotos(admin: Admin, now: Date = new Date()) {
  const cutoff = retentionCutoff(now)
  const ended = await removeEndedBookingPhotos(admin, cutoff)
  const unbooked = await removeUnbookedCustomerPhotos(admin, cutoff)
  return { ...ended, ...unbooked }
}
