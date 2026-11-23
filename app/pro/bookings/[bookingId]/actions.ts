'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { CLEANER_REVIEW_WINDOW_HOURS, cleanerReviewHoursLeft } from '@/lib/cleanerReviewWindow'
import { markArrivedAction, startCleaningAction } from '@/app/pro/messages/[bookingId]/actions'
import { extensionForType } from '@/lib/uploadExtension'
import { userFacingError } from '@/lib/userFacingError'
import { blockUser } from '@/lib/userBlocks'
import { UPCHARGE_HOLD_MESSAGE } from '@/lib/bookingUpcharges'
import { UNPAID_HOLD_MESSAGE } from '@/lib/recurringPayments'
import { COMPLETION_PHOTOS_BUCKET } from '@/lib/taskPhotoRetention'
import { addBookingPairToPortfolio, loadBookingPhotoPairs, prepareTaskPhoto } from '@/lib/tidyProPortfolio'
import type { BookingPhotoPair, BookingPhotoPairChoice } from '@/lib/portfolioItems'
import { CUSTOMER_REPORT_CATEGORIES, NO_ACCESS_REPORT_REASON, parseReportInput, reportDescription, reportSeverity } from '@/lib/reportCategories'
import { sendCustomerReportEscalation } from '@/lib/bookingIncidentEmail'
import { revalidateNoAccessPaths, startNoAccessCountdown } from '@/lib/noAccessCountdown'
import { isEntireHomeRoom, MAX_ENTIRE_HOME_TASK_PHOTOS } from '@/lib/entireHome'
import { originalExifFromForm } from '@/lib/photoLocation'

const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024

export async function arriveAndStartCleaningAction(bookingId: string): Promise<{ success: true } | { error: string }> {
  const arrived = await markArrivedAction(bookingId)
  if ('error' in arrived) return arrived
  return startCleaningAction(bookingId)
}

export type TaskPhotoKind = 'before' | 'after'

// Before photos are optional and taken before the task is done; the after
// photo is required and marks the task complete.
export async function submitTaskPhotoAction(
  bookingId: string,
  taskId: string,
  formData: FormData,
  kind: TaskPhotoKind = 'after'
): Promise<{ success: true; photoUrl: string } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const admin = createAdminClient()

  const { data: booking } = await admin
    .from('bookings')
    .select('id, progress_status, suspended_for_upcharge_at, payment_due_at')
    .eq('id', bookingId)
    .eq('tidy_pro_id', session.profileId)
    .maybeSingle()

  if (!booking) return { error: 'Booking not found.' }
  if (booking.progress_status !== 'arrived' && booking.progress_status !== 'cleaning') {
    return { error: 'This booking is not in progress.' }
  }
  if (booking.suspended_for_upcharge_at) return { error: UPCHARGE_HOLD_MESSAGE }
  if (booking.payment_due_at) return { error: UNPAID_HOLD_MESSAGE }

  const { data: task } = await admin
    .from('booking_tasks')
    .select('id, is_completed')
    .eq('id', taskId)
    .eq('booking_id', bookingId)
    .maybeSingle()

  if (!task) return { error: 'Task not found.' }
  if (kind === 'before' && task.is_completed) {
    return { error: 'This task is already done — before photos are taken before you start it.' }
  }

  const file = formData.get('photo')
  if (!(file instanceof File) || file.size === 0) return { error: 'Please choose a photo to upload.' }
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) return { error: 'Please upload a JPG, PNG, or WEBP photo.' }
  if (file.size > MAX_PHOTO_SIZE_BYTES) return { error: 'Photo is too large — please upload something under 10MB.' }

  const contentType = file.type === 'image/jpg' ? 'image/jpeg' : file.type
  let prepared: Awaited<ReturnType<typeof prepareTaskPhoto>>
  try {
    // The bucket is public and these are photos of customers' homes, so the
    // location and other metadata a phone camera adds come off the file. The
    // location is kept privately on the task for Tydio (see below).
    prepared = await prepareTaskPhoto(Buffer.from(await file.arrayBuffer()), contentType, await originalExifFromForm(formData))
  } catch {
    return { error: "We couldn't read that photo — please try another." }
  }

  const extension = extensionForType(contentType)
  const path = `${bookingId}/${taskId}-${kind === 'before' ? 'before-' : ''}${Date.now()}.${extension}`

  const { error: uploadError } = await admin.storage
    .from(COMPLETION_PHOTOS_BUCKET)
    .upload(path, prepared.body, { contentType, upsert: true })

  if (uploadError) return { error: 'Upload failed — please try again.' }

  // Unlike insurance-documents (private, read via createSignedUrl), the
  // task-photos bucket is public — the customer-side booking view renders
  // completion_photo_url directly as a plain <img src>, so we store the
  // resolved public URL rather than just the storage path.
  const { data: publicUrlData } = admin.storage.from(COMPLETION_PHOTOS_BUCKET).getPublicUrl(path)
  const photoUrl = publicUrlData.publicUrl

  // Where the photo was taken, if the phone recorded it. Only the server reads
  // these columns; a retake replaces them (with null if it has no location).
  const latitude = prepared.location?.latitude ?? null
  const longitude = prepared.location?.longitude ?? null

  const { error: updateError } = await admin
    .from('booking_tasks')
    .update(
      kind === 'before'
        ? { before_photo_url: photoUrl, before_photo_latitude: latitude, before_photo_longitude: longitude }
        : {
            is_completed: true,
            completion_photo_url: photoUrl,
            completion_photo_latitude: latitude,
            completion_photo_longitude: longitude,
            completed_at: new Date().toISOString(),
          }
    )
    .eq('id', taskId)

  if (updateError) return { error: userFacingError(updateError) }

  revalidatePath(`/pro/bookings/${bookingId}`)
  return { success: true, photoUrl }
}

// ── Photos of an Entire home task ────────────────────────────────────────────
// Baseboards, windows or floors throughout the home don't fit in one photo, so
// these tasks take up to MAX_ENTIRE_HOME_TASK_PHOTOS before and the same after
// (booking_task_photos). At least one after photo marks the task complete.
// The first photo of each kind is mirrored onto the booking_tasks columns, so
// the customer's view, admin and the portfolio keep reading those.

export type TaskPhoto = { id: string; taskId: string; kind: TaskPhotoKind; photoUrl: string }

async function entireHomeTaskInProgress(
  bookingId: string,
  taskId: string
): Promise<{ error: string } | { admin: ReturnType<typeof createAdminClient>; isCompleted: boolean }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }
  const admin = createAdminClient()
  const { data: booking } = await admin
    .from('bookings')
    .select('id, progress_status, suspended_for_upcharge_at, payment_due_at')
    .eq('id', bookingId)
    .eq('tidy_pro_id', session.profileId)
    .maybeSingle()
  if (!booking) return { error: 'Booking not found.' }
  if (booking.progress_status !== 'arrived' && booking.progress_status !== 'cleaning') {
    return { error: 'This booking is not in progress.' }
  }
  if (booking.suspended_for_upcharge_at) return { error: UPCHARGE_HOLD_MESSAGE }
  if (booking.payment_due_at) return { error: UNPAID_HOLD_MESSAGE }

  const { data: task } = await admin
    .from('booking_tasks')
    .select('id, task_category, is_completed')
    .eq('id', taskId)
    .eq('booking_id', bookingId)
    .maybeSingle()
  if (!task) return { error: 'Task not found.' }
  if (!isEntireHomeRoom(task.task_category)) return { error: 'Only Entire home tasks take more than one photo.' }
  return { admin, isCompleted: task.is_completed }
}

// Points the task's own photo column at its first remaining photo of that
// kind. With no after photos left, the task is no longer complete.
async function syncTaskPrimaryPhoto(admin: ReturnType<typeof createAdminClient>, taskId: string, kind: TaskPhotoKind) {
  const { data: first } = await admin
    .from('booking_task_photos')
    .select('photo_url, latitude, longitude')
    .eq('booking_task_id', taskId)
    .eq('kind', kind)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  const update =
    kind === 'before'
      ? {
          before_photo_url: first?.photo_url ?? null,
          before_photo_latitude: first?.latitude ?? null,
          before_photo_longitude: first?.longitude ?? null,
        }
      : first
        ? {
            is_completed: true,
            completion_photo_url: first.photo_url,
            completion_photo_latitude: first.latitude,
            completion_photo_longitude: first.longitude,
          }
        : {
            is_completed: false,
            completion_photo_url: null,
            completion_photo_latitude: null,
            completion_photo_longitude: null,
            completed_at: null,
          }
  return admin.from('booking_tasks').update(update).eq('id', taskId)
}

export async function addEntireHomeTaskPhotoAction(
  bookingId: string,
  taskId: string,
  kind: TaskPhotoKind,
  formData: FormData
): Promise<{ photo: TaskPhoto } | { error: string }> {
  if (kind !== 'before' && kind !== 'after') return { error: 'Something went wrong. Please try again.' }
  const checked = await entireHomeTaskInProgress(bookingId, taskId)
  if ('error' in checked) return { error: checked.error }
  const { admin, isCompleted } = checked
  if (kind === 'before' && isCompleted) {
    return { error: 'This task is already done — before photos are taken before you start it.' }
  }

  const { count } = await admin
    .from('booking_task_photos')
    .select('id', { count: 'exact', head: true })
    .eq('booking_task_id', taskId)
    .eq('kind', kind)
  if ((count ?? 0) >= MAX_ENTIRE_HOME_TASK_PHOTOS) {
    return { error: `You can add up to ${MAX_ENTIRE_HOME_TASK_PHOTOS} ${kind} photos. Remove one to add another.` }
  }

  const file = formData.get('photo')
  if (!(file instanceof File) || file.size === 0) return { error: 'Please choose a photo to upload.' }
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) return { error: 'Please upload a JPG, PNG, or WEBP photo.' }
  if (file.size > MAX_PHOTO_SIZE_BYTES) return { error: 'Photo is too large — please upload something under 10MB.' }

  const contentType = file.type === 'image/jpg' ? 'image/jpeg' : file.type
  let prepared: Awaited<ReturnType<typeof prepareTaskPhoto>>
  try {
    // Public bucket, photos of a customer's home: metadata comes off the file,
    // and the location is kept privately on the row.
    prepared = await prepareTaskPhoto(Buffer.from(await file.arrayBuffer()), contentType, await originalExifFromForm(formData))
  } catch {
    return { error: "We couldn't read that photo — please try another." }
  }

  // In the booking's folder, so the 7-day task photo cleanup removes it.
  const path = `${bookingId}/${taskId}-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionForType(contentType)}`
  const { error: uploadError } = await admin.storage.from(COMPLETION_PHOTOS_BUCKET).upload(path, prepared.body, { contentType })
  if (uploadError) return { error: 'Upload failed — please try again.' }
  const photoUrl = admin.storage.from(COMPLETION_PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl

  const { data: row, error } = await admin
    .from('booking_task_photos')
    .insert({
      booking_task_id: taskId,
      booking_id: bookingId,
      kind,
      photo_path: path,
      photo_url: photoUrl,
      latitude: prepared.location?.latitude ?? null,
      longitude: prepared.location?.longitude ?? null,
    })
    .select('id')
    .single()
  if (error || !row) {
    await admin.storage.from(COMPLETION_PHOTOS_BUCKET).remove([path])
    return { error: userFacingError(error) }
  }

  const { error: syncError } = await syncTaskPrimaryPhoto(admin, taskId, kind)
  if (syncError) return { error: userFacingError(syncError) }
  // The first after photo is when the task was done.
  if (kind === 'after' && !isCompleted) {
    await admin.from('booking_tasks').update({ completed_at: new Date().toISOString() }).eq('id', taskId)
  }

  revalidatePath(`/pro/bookings/${bookingId}`)
  return { photo: { id: row.id, taskId, kind, photoUrl } }
}

export async function removeEntireHomeTaskPhotoAction(
  bookingId: string,
  taskId: string,
  photoId: string
): Promise<{ success: true } | { error: string }> {
  const checked = await entireHomeTaskInProgress(bookingId, taskId)
  if ('error' in checked) return { error: checked.error }
  const { admin, isCompleted } = checked

  const { data: photo } = await admin
    .from('booking_task_photos')
    .select('id, kind, photo_path')
    .eq('id', photoId)
    .eq('booking_task_id', taskId)
    .maybeSingle()
  if (!photo) return { success: true }
  // Same rule as a single before photo: it can't change once the task is done.
  if (photo.kind === 'before' && isCompleted) {
    return { error: 'Before photos can’t be changed once the task is done.' }
  }

  const { error } = await admin.from('booking_task_photos').delete().eq('id', photo.id)
  if (error) return { error: userFacingError(error) }
  await admin.storage.from(COMPLETION_PHOTOS_BUCKET).remove([photo.photo_path])

  const { error: syncError } = await syncTaskPrimaryPhoto(admin, taskId, photo.kind as TaskPhotoKind)
  if (syncError) return { error: userFacingError(syncError) }

  revalidatePath(`/pro/bookings/${bookingId}`)
  return { success: true }
}

// ── Photos of a Standard / Deep Cleaning ─────────────────────────────────────
// Optional, for the whole cleaning: up to MAX_CLEANING_PHOTOS before and the
// same after, of whole rooms or particular areas. Add-ons and Tidy Tasks keep
// their own required after photo (submitTaskPhotoAction).

export type CleaningPhoto = { id: string; kind: TaskPhotoKind; photoUrl: string }

const MAX_CLEANING_PHOTOS = 10

async function cleaningBookingInProgress(
  bookingId: string
): Promise<{ error: string } | { admin: ReturnType<typeof createAdminClient> }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }
  const admin = createAdminClient()
  const { data: booking } = await admin
    .from('bookings')
    .select('id, progress_status, suspended_for_upcharge_at, payment_due_at, full_service')
    .eq('id', bookingId)
    .eq('tidy_pro_id', session.profileId)
    .maybeSingle()
  if (!booking) return { error: 'Booking not found.' }
  if (!booking.full_service) return { error: 'This booking has no Standard or Deep Cleaning.' }
  if (booking.progress_status !== 'arrived' && booking.progress_status !== 'cleaning') {
    return { error: 'This booking is not in progress.' }
  }
  if (booking.suspended_for_upcharge_at) return { error: UPCHARGE_HOLD_MESSAGE }
  if (booking.payment_due_at) return { error: UNPAID_HOLD_MESSAGE }
  return { admin }
}

export async function addCleaningPhotoAction(
  bookingId: string,
  kind: TaskPhotoKind,
  formData: FormData
): Promise<{ photo: CleaningPhoto } | { error: string }> {
  if (kind !== 'before' && kind !== 'after') return { error: 'Something went wrong. Please try again.' }
  const checked = await cleaningBookingInProgress(bookingId)
  if ('error' in checked) return { error: checked.error }
  const { admin } = checked

  const { count } = await admin
    .from('booking_cleaning_photos')
    .select('id', { count: 'exact', head: true })
    .eq('booking_id', bookingId)
    .eq('kind', kind)
  if ((count ?? 0) >= MAX_CLEANING_PHOTOS) {
    return { error: `You can add up to ${MAX_CLEANING_PHOTOS} ${kind} photos. Remove one to add another.` }
  }

  const file = formData.get('photo')
  if (!(file instanceof File) || file.size === 0) return { error: 'Please choose a photo to upload.' }
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) return { error: 'Please upload a JPG, PNG, or WEBP photo.' }
  if (file.size > MAX_PHOTO_SIZE_BYTES) return { error: 'Photo is too large — please upload something under 10MB.' }

  const contentType = file.type === 'image/jpg' ? 'image/jpeg' : file.type
  let prepared: Awaited<ReturnType<typeof prepareTaskPhoto>>
  try {
    // Public bucket, photos of a customer's home: metadata comes off the file,
    // and the location is kept privately on the row.
    prepared = await prepareTaskPhoto(Buffer.from(await file.arrayBuffer()), contentType, await originalExifFromForm(formData))
  } catch {
    return { error: "We couldn't read that photo — please try another." }
  }

  // In the booking's folder, so the 7-day task photo cleanup removes it.
  const path = `${bookingId}/cleaning-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionForType(contentType)}`
  const { error: uploadError } = await admin.storage.from(COMPLETION_PHOTOS_BUCKET).upload(path, prepared.body, { contentType })
  if (uploadError) return { error: 'Upload failed — please try again.' }
  const photoUrl = admin.storage.from(COMPLETION_PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl

  const { data: row, error } = await admin
    .from('booking_cleaning_photos')
    .insert({
      booking_id: bookingId,
      kind,
      photo_path: path,
      photo_url: photoUrl,
      latitude: prepared.location?.latitude ?? null,
      longitude: prepared.location?.longitude ?? null,
    })
    .select('id')
    .single()
  if (error || !row) {
    await admin.storage.from(COMPLETION_PHOTOS_BUCKET).remove([path])
    return { error: userFacingError(error) }
  }

  revalidatePath(`/pro/bookings/${bookingId}`)
  return { photo: { id: row.id, kind, photoUrl } }
}

export async function removeCleaningPhotoAction(bookingId: string, photoId: string): Promise<{ success: true } | { error: string }> {
  const checked = await cleaningBookingInProgress(bookingId)
  if ('error' in checked) return { error: checked.error }
  const { admin } = checked

  const { data: photo } = await admin
    .from('booking_cleaning_photos')
    .select('id, photo_path')
    .eq('id', photoId)
    .eq('booking_id', bookingId)
    .maybeSingle()
  if (!photo) return { success: true }

  await admin.storage.from(COMPLETION_PHOTOS_BUCKET).remove([photo.photo_path])
  const { error } = await admin.from('booking_cleaning_photos').delete().eq('id', photo.id)
  if (error) return { error: userFacingError(error) }

  revalidatePath(`/pro/bookings/${bookingId}`)
  return { success: true }
}

// ── Adding a booking's before/after pairs to the Tidy Pro's profile ──────────
// Offered when they finish the job, and from the past booking page until the
// booking's photos are removed (7 days after it ends).

async function bookingForProfilePhotos(
  bookingId: string
): Promise<{ error: string } | { admin: ReturnType<typeof createAdminClient>; tidyProId: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }
  const admin = createAdminClient()
  const { data: booking } = await admin
    .from('bookings')
    .select('id, status, progress_status, task_photos_removed_at')
    .eq('id', bookingId)
    .eq('tidy_pro_id', session.profileId)
    .maybeSingle()
  if (!booking) return { error: 'Booking not found.' }
  const finished = booking.status === 'completed' || booking.progress_status === 'done'
  if (!finished && booking.progress_status !== 'cleaning') return { error: 'This booking is not in progress.' }
  if (booking.task_photos_removed_at) return { error: "This booking's photos have been removed." }
  return { admin, tidyProId: session.profileId }
}

export async function loadProfilePhotoPairsAction(
  bookingId: string
): Promise<{ pairs: BookingPhotoPair[] } | { error: string }> {
  const checked = await bookingForProfilePhotos(bookingId)
  if ('error' in checked) return checked
  try {
    return { pairs: await loadBookingPhotoPairs(checked.admin, bookingId) }
  } catch (err) {
    console.error(err)
    return { error: 'Something went wrong. Please try again.' }
  }
}

export async function addPhotosToProfileAction(
  bookingId: string,
  choices: BookingPhotoPairChoice[]
): Promise<{ success: true } | { error: string }> {
  if (!Array.isArray(choices) || choices.length === 0) return { success: true }
  const checked = await bookingForProfilePhotos(bookingId)
  if ('error' in checked) return checked
  const { admin, tidyProId } = checked

  // Built from the booking's own photos, so only its pairs can be added.
  let pairs: BookingPhotoPair[]
  try {
    pairs = await loadBookingPhotoPairs(admin, bookingId)
  } catch (err) {
    console.error(err)
    return { error: 'Something went wrong. Please try again.' }
  }
  const byKey = new Map(pairs.map((p) => [p.key, p]))

  let failed = 0
  for (const choice of choices) {
    const pair = byKey.get(choice?.key)
    const before = pair?.befores.find((b) => b.id === choice.beforeId)
    if (!pair || !before) {
      failed += 1
      continue
    }
    if (pair.onProfile) continue
    try {
      await addBookingPairToPortfolio(admin, tidyProId, bookingId, pair, before)
    } catch (err) {
      console.error(`[Tydio] Adding pair ${pair.key} to portfolio failed:`, err)
      failed += 1
    }
  }

  revalidatePath(`/pro/bookings/${bookingId}`)
  revalidatePath('/pro/profile/edit')
  revalidatePath('/pro/profile/preview')
  revalidatePath(`/book/schedule/${tidyProId}`)
  if (failed > 0) {
    return { error: `${failed} photo pair${failed === 1 ? '' : 's'} couldn't be added. Please try again.` }
  }
  return { success: true }
}

export async function submitCustomerReviewAction(
  bookingId: string,
  rating: number,
  reviewText: string
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: 'Please choose a star rating.' }

  const admin = createAdminClient()

  const { data: booking } = await admin
    .from('bookings')
    .select('id, user_id, status, progress_status, cleaner_marked_complete_at')
    .eq('id', bookingId)
    .eq('tidy_pro_id', session.profileId)
    .maybeSingle()

  if (!booking) return { error: 'Booking not found.' }
  if (booking.status !== 'completed' && booking.progress_status !== 'done') {
    return { error: 'This booking is not complete yet.' }
  }
  if (cleanerReviewHoursLeft(booking.cleaner_marked_complete_at) === 0) {
    return { error: `The ${CLEANER_REVIEW_WINDOW_HOURS}-hour window to review this customer has closed.` }
  }

  const { data: existingReview } = await admin
    .from('cleaner_reviews_of_customers')
    .select('id')
    .eq('booking_id', bookingId)
    .maybeSingle()
  if (existingReview) return { error: 'This booking has already been reviewed.' }

  const { error } = await admin.from('cleaner_reviews_of_customers').insert({
    booking_id: bookingId,
    tidypro_id: session.profileId,
    customer_id: booking.user_id,
    // review_token isn't used as an actual token/link in this in-app flow —
    // the column is NOT NULL UNIQUE in the schema, so we just satisfy it.
    review_token: crypto.randomUUID(),
    customer_rating: rating,
    written_feedback: reviewText.trim() || null,
    submitted_at: new Date().toISOString(),
  })

  if (error) return { error: userFacingError(error) }

  revalidatePath(`/pro/bookings/${bookingId}`)
  revalidatePath(`/pro/bookings/${bookingId}/review`)
  revalidatePath('/pro/bookings')
  revalidatePath('/pro/dashboard')
  return { success: true }
}

// The Tidy Pro reports the customer from the booking page: saved as a risk event against
// the customer, then emailed to the admin.
export async function reportCustomerAction(
  bookingId: string,
  categoryId: string,
  reasonId: string | null,
  details: string
): Promise<{ success: true; noAccessStarted?: boolean } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const input = parseReportInput(CUSTOMER_REPORT_CATEGORIES, categoryId, reasonId, details)
  if ('error' in input) return input
  const { choice } = input

  const admin = createAdminClient()

  const { data: booking } = await admin
    .from('bookings')
    .select('id, user_id')
    .eq('id', bookingId)
    .eq('tidy_pro_id', session.profileId)
    .maybeSingle()

  if (!booking) return { error: 'Booking not found.' }

  const { error } = await admin.from('risk_events').insert({
    event_type: 'cleaner_complaint',
    booking_id: bookingId,
    user_id: booking.user_id,
    severity: reportSeverity(choice),
    description: reportDescription(choice, input.details),
    metadata: { category: choice.category.id, reason: choice.reason?.id ?? null, note: input.details || null },
    created_by: session.profileId,
  })

  if (error) return { error: userFacingError(error) }

  // The report is saved either way; a failed email shouldn't tell the Tidy Pro it wasn't.
  await sendCustomerReportEscalation(admin, bookingId, choice, input.details).catch((err) => console.error('Customer report escalation email failed', bookingId, err))

  // "I can't enter the property" during the job starts the same countdown as the
  // "Unable to access location" button. Outside the job it's just a report.
  if (choice.reason?.id === NO_ACCESS_REPORT_REASON) {
    const countdown = await startNoAccessCountdown(admin, bookingId, session.profileId)
    if ('success' in countdown) {
      revalidateNoAccessPaths(bookingId)
      return { success: true, noAccessStarted: true }
    }
  }

  return { success: true }
}

// "Block customer" at the bottom of the report sheet (lib/userBlocks): from then on,
// neither of them can message the other, and this customer can't send them requests.
export async function blockCustomerAction(bookingId: string): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const admin = createAdminClient()
  const { data: booking } = await admin
    .from('bookings')
    .select('id, user_id')
    .eq('id', bookingId)
    .eq('tidy_pro_id', session.profileId)
    .maybeSingle()
  if (!booking) return { error: 'Booking not found.' }

  const result = await blockUser(admin, session.profileId, booking.user_id, bookingId)
  if ('error' in result) return result

  revalidatePath(`/pro/bookings/${bookingId}`)
  revalidatePath(`/pro/messages/${bookingId}`)
  revalidatePath(`/dashboard/messages/${bookingId}`)
  return { success: true }
}
