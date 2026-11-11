import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadCustomerPetsWithPhotos } from '@/lib/customerPetsData'
import CustomerProfileView from './CustomerProfileView'

export const metadata: Metadata = { title: 'Customer Profile — Tydio' }

// Reached through a booking rather than a customer id, so a Tidy Pro can only
// open the profile of someone who has actually booked them.
export default async function ProCustomerProfilePage({
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

  const [{ data: customer }, { data: reviews }, pets] = await Promise.all([
    admin.from('profiles').select('first_name, last_name, photo_url, has_no_pets, created_at').eq('id', booking.user_id).maybeSingle(),
    admin.from('cleaner_reviews_of_customers').select('customer_rating').eq('customer_id', booking.user_id),
    loadCustomerPetsWithPhotos(admin, booking.user_id),
  ])

  const ratings = (reviews ?? []).flatMap((r) => (r.customer_rating != null ? [r.customer_rating] : []))
  const rating = ratings.length > 0 ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : 0

  return (
    <CustomerProfileView
      name={[customer?.first_name, customer?.last_name].filter(Boolean).join(' ') || 'Customer'}
      photoUrl={customer?.photo_url ?? null}
      pets={pets}
      hasNoPets={customer?.has_no_pets === true}
      memberSince={customer?.created_at ?? null}
      rating={rating}
      reviewCount={ratings.length}
    />
  )
}
