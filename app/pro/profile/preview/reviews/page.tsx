import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRatingVisibleToTidyPro } from '@/lib/bookings'
import { listCleanerReviews } from '@/lib/cleanerReviews'
import CleanerReviewsView from '@/app/book/schedule/[cleanerId]/reviews/CleanerReviewsView'

export const metadata: Metadata = { title: 'Reviews — Tydio' }

export default async function ProPreviewReviewsPage() {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const admin = createAdminClient()

  const [{ data: tidyPro, error }, { data: profile }] = await Promise.all([
    admin.from('tidypro_profiles').select('rating, review_count').eq('id', session.profileId).maybeSingle(),
    admin.from('profiles').select('first_name, last_name').eq('id', session.profileId).maybeSingle(),
  ])

  if (error) throw new Error(`Failed to load profile: ${error.message}`)
  if (!tidyPro) redirect('/pro/profile')

  const { rating, reviewCount } = await getRatingVisibleToTidyPro(admin, session.profileId, tidyPro.rating, tidyPro.review_count)

  return (
    <CleanerReviewsView
      name={[profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Tidy Pro'}
      rating={rating}
      reviewCount={reviewCount}
      reviews={await listCleanerReviews(admin, session.profileId, { forTidyProThemself: true })}
      backHref="/pro/profile/preview"
    />
  )
}
