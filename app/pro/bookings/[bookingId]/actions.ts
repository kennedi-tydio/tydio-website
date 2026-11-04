'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { CLEANER_REVIEW_WINDOW_HOURS, cleanerReviewHoursLeft } from '@/lib/cleanerReviewWindow'
import { markArrivedAction, startCleaningAction } from '@/app/pro/messages/[bookingId]/actions'
import { extensionForType } from '@/lib/uploadExtension'
import { userFacingError } from '@/lib/userFacingError'

const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024

export async function arriveAndStartCleaningAction(bookingId: string): Promise<{ success: true } | { error: string }> {
  const arrived = await markArrivedAction(bookingId)
  if ('error' in arrived) return arrived
  return startCleaningAction(bookingId)
}

export async function submitTaskPhotoAction(
  bookingId: string,
  taskId: string,
  formData: FormData
): Promise<{ success: true; photoUrl: string } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const admin = createAdminClient()

  const { data: booking } = await admin
    .from('bookings')
    .select('id, progress_status')
    .eq('id', bookingId)
    .eq('tidy_pro_id', session.profileId)
    .maybeSingle()

  if (!booking) return { error: 'Booking not found.' }
  if (booking.progress_status !== 'arrived' && booking.progress_status !== 'cleaning') {
    return { error: 'This booking is not in progress.' }
  }

  const { data: task } = await admin
    .from('booking_tasks')
    .select('id')
    .eq('id', taskId)
    .eq('booking_id', bookingId)
    .maybeSingle()

  if (!task) return { error: 'Task not found.' }

  const file = formData.get('photo')
  if (!(file instanceof File) || file.size === 0) return { error: 'Please choose a photo to upload.' }
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) return { error: 'Please upload a JPG, PNG, or WEBP photo.' }
  if (file.size > MAX_PHOTO_SIZE_BYTES) return { error: 'Photo is too large — please upload something under 10MB.' }

  const extension = extensionForType(file.type)
  const path = `${bookingId}/${taskId}-${Date.now()}.${extension}`

  const { error: uploadError } = await admin.storage
    .from('task-photos')
    .upload(path, file, { contentType: file.type, upsert: true })

  if (uploadError) return { error: 'Upload failed — please try again.' }

  // Unlike insurance-documents (private, read via createSignedUrl), the
  // task-photos bucket is public — the customer-side booking view renders
  // completion_photo_url directly as a plain <img src>, so we store the
  // resolved public URL rather than just the storage path.
  const { data: publicUrlData } = admin.storage.from('task-photos').getPublicUrl(path)
  const photoUrl = publicUrlData.publicUrl

  const { error: updateError } = await admin
    .from('booking_tasks')
    .update({ is_completed: true, completion_photo_url: photoUrl, completed_at: new Date().toISOString() })
    .eq('id', taskId)

  if (updateError) return { error: userFacingError(updateError) }

  revalidatePath(`/pro/bookings/${bookingId}`)
  return { success: true, photoUrl }
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
