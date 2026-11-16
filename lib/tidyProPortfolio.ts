import sharp from 'sharp'
import type { createAdminClient } from '@/lib/supabase/admin'
import { COMPLETION_PHOTOS_BUCKET } from './taskPhotoRetention'
import { extensionForType } from './uploadExtension'
import { readPhotoLocation, type PhotoLocation } from './photoLocation'
import { PORTFOLIO_DISPLAY_LIMIT, taskPhotoPathFromUrl, type PortfolioItem } from './portfolioItems'

export { PORTFOLIO_DISPLAY_LIMIT, taskPhotoPathFromUrl, type PortfolioItem }

type Admin = ReturnType<typeof createAdminClient>

// Public: shown on the customer-facing Tidy Pro page. Files live under
// "<tidy pro id>/<uuid>.<ext>" and go with the account (lib/accountDeletion.ts).
export const PORTFOLIO_PHOTOS_BUCKET = 'portfolio-photos'

// Re-encodes a photo without its metadata. Phone photos can carry GPS
// coordinates, and these photos are of customers' homes, so EXIF must never
// reach a public bucket. rotate() bakes the EXIF orientation into the pixels
// first so the photo still shows the right way up.
export async function stripImageMetadata(input: Buffer, contentType: string): Promise<Buffer> {
  const image = sharp(input, { failOn: 'none' }).rotate()
  if (contentType === 'image/png') return image.png().toBuffer()
  if (contentType === 'image/webp') return image.webp({ quality: 85 }).toBuffer()
  return image.jpeg({ quality: 85 }).toBuffer()
}

// For a new task photo: the public copy without metadata, plus where it was
// taken (from its GPS tags, if the phone added any). The location is only
// stored privately on booking_tasks for Tydio, never in the public file.
export async function prepareTaskPhoto(
  input: Buffer,
  contentType: string
): Promise<{ body: Buffer; location: PhotoLocation | null }> {
  const { exif } = await sharp(input, { failOn: 'none' }).metadata()
  return { body: await stripImageMetadata(input, contentType), location: readPhotoLocation(exif) }
}

export async function loadPortfolio(admin: Admin, tidyProId: string, limit = PORTFOLIO_DISPLAY_LIMIT): Promise<PortfolioItem[]> {
  const { data, error } = await admin
    .from('tidypro_portfolio_items')
    .select('id, task_name, before_photo_path, after_photo_path')
    .eq('tidypro_id', tidyProId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    // The profile still works without its photos.
    console.error('[Tydio] Loading portfolio failed:', error)
    return []
  }
  const bucket = admin.storage.from(PORTFOLIO_PHOTOS_BUCKET)
  return (data ?? []).map((row) => ({
    id: row.id,
    taskName: row.task_name,
    beforeUrl: row.before_photo_path ? bucket.getPublicUrl(row.before_photo_path).data.publicUrl : null,
    afterUrl: bucket.getPublicUrl(row.after_photo_path).data.publicUrl,
  }))
}

// Copies one task photo into the Tidy Pro's portfolio folder. Returns the new path.
async function copyToPortfolio(admin: Admin, tidyProId: string, sourcePath: string): Promise<string> {
  const { data: blob, error } = await admin.storage.from(COMPLETION_PHOTOS_BUCKET).download(sourcePath)
  if (error || !blob) throw new Error(`Downloading ${sourcePath} failed: ${error?.message ?? 'no data'}`)
  const contentType = ['image/png', 'image/webp'].includes(blob.type) ? blob.type : 'image/jpeg'
  const clean = await stripImageMetadata(Buffer.from(await blob.arrayBuffer()), contentType)
  const path = `${tidyProId}/${crypto.randomUUID()}.${extensionForType(contentType)}`
  const { error: uploadError } = await admin.storage.from(PORTFOLIO_PHOTOS_BUCKET).upload(path, clean, { contentType })
  if (uploadError) throw new Error(`Uploading ${path} failed: ${uploadError.message}`)
  return path
}

export type UploadedPortfolioPhoto = { body: Buffer; contentType: 'image/jpeg' | 'image/png' | 'image/webp' }

// Adds photos the Tidy Pro uploaded from their device: one photo of the
// finished work, or a before/after pair. These can be photos of anyone's
// home, so their metadata (including any GPS location) comes off first.
export async function addUploadedPortfolioItem(
  admin: Admin,
  tidyProId: string,
  caption: string,
  photos: { before: UploadedPortfolioPhoto | null; after: UploadedPortfolioPhoto }
): Promise<PortfolioItem> {
  const uploaded: string[] = []
  async function store(photo: UploadedPortfolioPhoto): Promise<string> {
    const clean = await stripImageMetadata(photo.body, photo.contentType)
    const path = `${tidyProId}/${crypto.randomUUID()}.${extensionForType(photo.contentType)}`
    const { error } = await admin.storage.from(PORTFOLIO_PHOTOS_BUCKET).upload(path, clean, { contentType: photo.contentType })
    if (error) throw new Error(`Uploading ${path} failed: ${error.message}`)
    uploaded.push(path)
    return path
  }

  try {
    const beforePath = photos.before ? await store(photos.before) : null
    const afterPath = await store(photos.after)
    const { data, error } = await admin
      .from('tidypro_portfolio_items')
      .insert({ tidypro_id: tidyProId, task_name: caption, before_photo_path: beforePath, after_photo_path: afterPath })
      .select('id')
      .single()
    if (error || !data) throw new Error(error?.message ?? 'Insert returned no row')
    const bucket = admin.storage.from(PORTFOLIO_PHOTOS_BUCKET)
    return {
      id: data.id,
      taskName: caption,
      beforeUrl: beforePath ? bucket.getPublicUrl(beforePath).data.publicUrl : null,
      afterUrl: bucket.getPublicUrl(afterPath).data.publicUrl,
    }
  } catch (err) {
    if (uploaded.length) await admin.storage.from(PORTFOLIO_PHOTOS_BUCKET).remove(uploaded)
    throw err
  }
}

export type PortfolioSourceTask = {
  id: string
  bookingId: string
  taskName: string
  beforePhotoUrl: string | null
  afterPhotoUrl: string | null
}

// Adds a task's before/after pair to the Tidy Pro's profile. Both photos are
// needed: a lone after photo doesn't show the work.
export async function addTaskToPortfolio(admin: Admin, tidyProId: string, task: PortfolioSourceTask): Promise<void> {
  const beforeSource = taskPhotoPathFromUrl(task.beforePhotoUrl)
  const afterSource = taskPhotoPathFromUrl(task.afterPhotoUrl)
  if (!beforeSource || !afterSource) throw new Error(`Task ${task.id} needs both a before and an after photo`)

  const copied: string[] = []
  try {
    copied.push(await copyToPortfolio(admin, tidyProId, beforeSource))
    copied.push(await copyToPortfolio(admin, tidyProId, afterSource))
    const { error } = await admin.from('tidypro_portfolio_items').insert({
      tidypro_id: tidyProId,
      booking_id: task.bookingId,
      booking_task_id: task.id,
      task_name: task.taskName,
      before_photo_path: copied[0],
      after_photo_path: copied[1],
    })
    if (error) throw new Error(error.message)
  } catch (err) {
    if (copied.length) await admin.storage.from(PORTFOLIO_PHOTOS_BUCKET).remove(copied)
    throw err
  }
}

// Removes portfolio items (rows and files). Used when a Tidy Pro takes one
// off their profile, and when a customer deletes their account.
export async function removePortfolioItems(
  admin: Admin,
  items: { id: string; before_photo_path: string | null; after_photo_path: string }[]
): Promise<void> {
  if (items.length === 0) return
  const { error } = await admin.from('tidypro_portfolio_items').delete().in('id', items.map((i) => i.id))
  if (error) throw new Error(error.message)
  const { error: storageError } = await admin.storage
    .from(PORTFOLIO_PHOTOS_BUCKET)
    .remove(items.flatMap((i) => (i.before_photo_path ? [i.before_photo_path, i.after_photo_path] : [i.after_photo_path])))
  if (storageError) console.error('[Tydio] Removing portfolio photos failed:', storageError)
}
