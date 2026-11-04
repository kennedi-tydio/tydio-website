import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type { WeeklyAvailability } from '@/lib/cleanerMatching'
import CleanerDetailView from './CleanerDetailView'

export const metadata: Metadata = { title: 'Tidy Pro — Tydio' }

export default async function CleanerDetailPage({
  params,
}: {
  params: Promise<{ cleanerId: string }>
}) {
  const session = await getSession()
  if (!session || session.role !== 'USER') redirect('/login')

  const { cleanerId } = await params
  const admin = createAdminClient()

  const { data: tidyPro, error } = await admin
    .from('tidypro_profiles')
    .select('bio, profile_photo_url, city, state, rating, review_count, is_verified, is_insured, average_response_time_minutes, availability, allergies')
    .eq('id', cleanerId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load Tidy Pro: ${error.message}`)
  if (!tidyPro) redirect('/book/schedule')

  const { data: profile } = await admin
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', cleanerId)
    .maybeSingle()

  const allergies = Array.isArray(tidyPro.allergies) ? (tidyPro.allergies as string[]) : []

  return (
    <CleanerDetailView
      cleanerId={cleanerId}
      name={[profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Tidy Pro'}
      photoUrl={tidyPro.profile_photo_url}
      bio={tidyPro.bio}
      city={tidyPro.city}
      state={tidyPro.state}
      rating={tidyPro.rating}
      reviewCount={tidyPro.review_count}
      isVerified={tidyPro.is_verified}
      isInsured={tidyPro.is_insured}
      averageResponseTimeMinutes={tidyPro.average_response_time_minutes}
      availability={(tidyPro.availability as WeeklyAvailability | null) ?? {}}
      allergies={allergies}
      reviewsHref={`/book/schedule/${cleanerId}/reviews`}
    />
  )
}
