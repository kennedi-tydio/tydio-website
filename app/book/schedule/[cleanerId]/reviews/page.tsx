import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { listCleanerReviews } from '@/lib/cleanerReviews'
import CleanerReviewsView from './CleanerReviewsView'

export const metadata: Metadata = { title: 'Reviews — Tydio' }

export default async function CleanerReviewsPage({
  params,
}: {
  params: Promise<{ cleanerId: string }>
}) {
  const session = await getSession()
  if (!session || session.role !== 'USER') redirect('/login')

  const { cleanerId } = await params
  const admin = createAdminClient()

  const [{ data: tidyPro, error }, { data: profile }] = await Promise.all([
    admin.from('tidypro_profiles').select('rating, review_count').eq('id', cleanerId).maybeSingle(),
    admin.from('profiles').select('first_name, last_name').eq('id', cleanerId).maybeSingle(),
  ])

  if (error) throw new Error(`Failed to load Tidy Pro: ${error.message}`)
  if (!tidyPro) redirect('/book/schedule')

  return (
    <CleanerReviewsView
      name={[profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Tidy Pro'}
      rating={tidyPro.rating}
      reviewCount={tidyPro.review_count}
      reviews={await listCleanerReviews(admin, cleanerId, { forTidyProThemself: false })}
      backHref={`/book/schedule/${cleanerId}`}
    />
  )
}
