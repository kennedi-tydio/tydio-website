'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { CLEANER_REVIEW_WINDOW_HOURS, cleanerReviewHoursLeft } from '@/lib/cleanerReviewWindow'
import { markArrivedAction, startCleaningAction } from '@/app/pro/messages/[bookingId]/actions'
import { extensionForType } from '@/lib/uploadExtension'
import { userFacingError } from '@/lib/userFacingError'
import { UPCHARGE_HOLD_MESSAGE } from '@/lib/bookingUpcharges'
import { UNPAID_HOLD_MESSAGE } from '@/lib/recurringPayments'
import { COMPLETION_PHOTOS_BUCKET } from '@/lib/taskPhotoRetention'
import { addTaskToPortfolio, prepareTaskPhoto } from '@/lib/tidyProPortfolio'
import { CUSTOMER_REPORT_CATEGORIES, parseReportInput, reportDescription, reportSeverity } from '@/lib/reportCategories'
import { sendCustomerReportEscalation } from '@/lib/bookingIncidentEmail'

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
    prepared = await prepareTaskPhoto(Buffer.from(await file.arrayBuffer()), contentType)
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

// Adds the chosen tasks' before/after pairs to the Tidy Pro's profile. Offered
// when they finish the job, while the booking is still in progress.
export async function addPhotosToProfileAction(
  bookingId: string,
  taskIds: string[]
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }
  if (taskIds.length === 0) return { success: true }

  const admin = createAdminClient()

  const { data: booking } = await admin
    .from('bookings')
    .select('id, progress_status')
    .eq('id', bookingId)
    .eq('tidy_pro_id', session.profileId)
    .maybeSingle()
  if (!booking) return { error: 'Booking not found.' }
  if (booking.progress_status !== 'cleaning') return { error: 'This booking is not in progress.' }

  const [{ data: tasks }, { data: existing }] = await Promise.all([
    admin
      .from('booking_tasks')
      .select('id, task_name, before_photo_url, completion_photo_url')
      .eq('booking_id', bookingId)
      .in('id', taskIds),
    admin.from('tidypro_portfolio_items').select('booking_task_id').in('booking_task_id', taskIds),
  ])
  const alreadyAdded = new Set((existing ?? []).map((e) => e.booking_task_id))

  let failed = 0
  for (const t of tasks ?? []) {
    if (alreadyAdded.has(t.id) || !t.before_photo_url || !t.completion_photo_url) continue
    try {
      await addTaskToPortfolio(admin, session.profileId, {
        id: t.id,
        bookingId,
        taskName: t.task_name,
        beforePhotoUrl: t.before_photo_url,
        afterPhotoUrl: t.completion_photo_url,
      })
    } catch (err) {
      console.error(`[Tydio] Adding task ${t.id} to portfolio failed:`, err)
      failed += 1
    }
  }

  revalidatePath('/pro/profile/portfolio')
  revalidatePath('/pro/profile/preview')
  if (failed > 0) {
    return { error: `${failed} photo pair${failed === 1 ? '' : 's'} couldn't be added. Try again, or finish without them.` }
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
): Promise<{ success: true } | { error: string }> {
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

  return { success: true }
}
