import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRatingVisibleToTidyPro } from '@/lib/bookings'
import type { WeeklyAvailability } from '@/lib/cleanerMatching'
import CleanerDetailView from '@/app/book/schedule/[cleanerId]/CleanerDetailView'

export const metadata: Metadata = { title: 'View as customer — Tydio' }

export default async function ProProfilePreviewPage() {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const admin = createAdminClient()

  const [{ data: tidyPro, error }, { data: profile }] = await Promise.all([
    admin
      .from('tidypro_profiles')
      .select('bio, profile_photo_url, city, state, rating, review_count, is_verified, is_insured, average_response_time_minutes, availability, allergies, uses_organic_products')
      .eq('id', session.profileId)
      .maybeSingle(),
    admin.from('profiles').select('first_name, last_name').eq('id', session.profileId).maybeSingle(),
  ])

  if (error) throw new Error(`Failed to load profile: ${error.message}`)
  if (!tidyPro) redirect('/pro/profile')

  // This page is the Tidy Pro's own screen, so a review still hidden from them
  // stays out of the rating here too, even though customers already count it.
  const { rating, reviewCount } = await getRatingVisibleToTidyPro(admin, session.profileId, tidyPro.rating, tidyPro.review_count)

  return (
    <CleanerDetailView
      cleanerId={session.profileId}
      name={[profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Tidy Pro'}
      photoUrl={tidyPro.profile_photo_url}
      bio={tidyPro.bio}
      city={tidyPro.city}
      state={tidyPro.state}
      rating={rating}
      reviewCount={reviewCount}
      isVerified={tidyPro.is_verified}
      isInsured={tidyPro.is_insured}
      averageResponseTimeMinutes={tidyPro.average_response_time_minutes}
      availability={(tidyPro.availability as WeeklyAvailability | null) ?? {}}
      usesOrganicProducts={tidyPro.uses_organic_products ?? false}
      allergies={Array.isArray(tidyPro.allergies) ? (tidyPro.allergies as string[]) : []}
      reviewsHref="/pro/profile/preview/reviews"
      previewBackHref="/pro/profile/edit"
    />
  )
}
