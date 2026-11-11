import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { listCleanerReviews } from '@/lib/cleanerReviews'
import CleanerReviewsView from '@/app/book/schedule/[cleanerId]/reviews/CleanerReviewsView'

export const metadata: Metadata = { title: 'Tidy Pro reviews — Tydio Admin' }

// The reviews customers see on this Tidy Pro's profile. The admin layout handles sign-in.
export default async function AdminTidyProReviewsPage({ params }: { params: Promise<{ proId: string }> }) {
  const { proId } = await params
  const admin = createAdminClient()

  const [{ data: tidyPro, error }, { data: profile }] = await Promise.all([
    admin.from('tidypro_profiles').select('rating, review_count').eq('id', proId).maybeSingle(),
    admin.from('profiles').select('first_name, last_name').eq('id', proId).maybeSingle(),
  ])

  if (error) throw new Error(`Failed to load Tidy Pro: ${error.message}`)
  if (!tidyPro) notFound()

  return (
    <div className="w-full max-w-sm rounded-2xl border border-slate-200 overflow-hidden shadow-sm bg-white">
      <CleanerReviewsView
        embedded
        name={[profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Tidy Pro'}
        rating={tidyPro.rating}
        reviewCount={tidyPro.review_count}
        reviews={await listCleanerReviews(admin, proId, { forTidyProThemself: false })}
        backHref={`/admin/tidy-pros/${proId}`}
      />
    </div>
  )
}
