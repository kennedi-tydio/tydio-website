import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { canLeaveCustomerReview, cleanerReviewHoursLeft } from '@/lib/cleanerReviewWindow'
import LeaveReviewView from '../LeaveReviewView'
import BookingReviewsView from '../BookingReviewsView'

export const metadata: Metadata = { title: 'Review — Tydio' }

export default async function ProBookingReviewPage({
  params,
}: {
  params: Promise<{ bookingId: string }>
}) {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const { bookingId } = await params

  const admin = createAdminClient()

  const { data: booking, error } = await admin
    .from('bookings')
    .select('id, user_id, status, progress_status, cleaner_marked_complete_at')
    .eq('id', bookingId)
    .eq('tidy_pro_id', session.profileId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load booking: ${error.message}`)
  if (!booking) redirect('/pro/dashboard')

  const isFinished = booking.status === 'completed' || (booking.status === 'scheduled' && booking.progress_status === 'done')
  if (!isFinished) redirect(`/pro/bookings/${bookingId}`)

  const [{ data: customerProfile }, { data: ownReview }] = await Promise.all([
    admin.from('profiles').select('first_name, last_name, photo_url').eq('id', booking.user_id).maybeSingle(),
    admin.from('cleaner_reviews_of_customers').select('customer_rating, written_feedback').eq('booking_id', bookingId).maybeSingle(),
  ])

  const customerName = [customerProfile?.first_name, customerProfile?.last_name].filter(Boolean).join(' ') || 'the customer'

  if (canLeaveCustomerReview(booking.cleaner_marked_complete_at, ownReview != null)) {
    return (
      <LeaveReviewView
        bookingId={booking.id}
        customerName={customerName}
        customerPhotoUrl={customerProfile?.photo_url ?? null}
        hoursLeft={cleanerReviewHoursLeft(booking.cleaner_marked_complete_at)}
      />
    )
  }

  // Only read past the check above, so a hidden review never reaches the client.
  const { data: customerReview } = await admin
    .from('reviews')
    .select('rating, review_text')
    .eq('booking_id', bookingId)
    .maybeSingle()

  return (
    <BookingReviewsView
      bookingId={booking.id}
      customerName={customerName}
      customerReview={customerReview ? { rating: customerReview.rating, text: customerReview.review_text } : null}
      ownReview={ownReview ? { rating: ownReview.customer_rating, text: ownReview.written_feedback } : null}
    />
  )
}
