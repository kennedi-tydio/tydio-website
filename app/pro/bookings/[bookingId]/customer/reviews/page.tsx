import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { listReviewsOfCustomer } from '@/lib/cleanerReviews'
import CleanerReviewsView from '@/app/book/schedule/[cleanerId]/reviews/CleanerReviewsView'

export const metadata: Metadata = { title: 'Customer Reviews — Tydio' }

// Reviews other Tidy Pros left of this customer. Reached through a booking, like the
// customer profile, so a Tidy Pro only sees them for someone who has booked them.
export default async function ProCustomerReviewsPage({
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
    .select('user_id')
    .eq('id', bookingId)
    .eq('tidy_pro_id', session.profileId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load booking: ${error.message}`)
  if (!booking) redirect('/pro/bookings')

  const [{ data: customer }, reviews] = await Promise.all([
    admin.from('profiles').select('first_name, last_name').eq('id', booking.user_id).maybeSingle(),
    listReviewsOfCustomer(admin, booking.user_id),
  ])

  const rating = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0

  return (
    <CleanerReviewsView
      name={[customer?.first_name, customer?.last_name].filter(Boolean).join(' ') || 'Customer'}
      rating={rating}
      reviewCount={reviews.length}
      reviews={reviews}
      backHref={`/pro/bookings/${bookingId}/customer`}
    />
  )
}
