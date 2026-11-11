import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasPushSubscription } from '@/lib/pushRequirement'
import { isAvailableForBooking, type WeeklyAvailability } from '@/lib/cleanerMatching'
import { DEFAULT_BOOKING_TIME_ZONE, todayInZone } from '@/lib/bookingTime'
import { formatTimeOffRange, normalizeTimeOff, parseTimeOff } from '@/lib/timeOff'
import CleanerDetailView from '@/app/book/schedule/[cleanerId]/CleanerDetailView'
import { FavoriteStar } from '../../users/FavoriteStar'
import { serviceLabels } from '@/lib/tidyProServices'

export const metadata: Metadata = { title: 'Tidy Pro profile — Tydio Admin' }

// A Tidy Pro's profile exactly as customers see it, with what the admin also needs to
// know about when they can be booked: whether they're bookable, away, and any time off.
// The admin layout handles sign-in.
export default async function AdminTidyProProfilePage({ params }: { params: Promise<{ proId: string }> }) {
  const { proId } = await params
  const admin = createAdminClient()

  const [{ data: tidyPro, error }, { data: profile }, { data: favoriteRow }] = await Promise.all([
    admin
      .from('tidypro_profiles')
      .select(
        'bio, profile_photo_url, city, state, rating, review_count, is_verified, is_insured, average_response_time_minutes, availability, allergies, uses_organic_products, time_off, time_zone, active_for_booking, cleaner_status, is_away, stripe_onboarding_completed, travel_radius_miles, services_provided, latitude, longitude'
      )
      .eq('id', proId)
      .maybeSingle(),
    admin.from('profiles').select('first_name, last_name, email').eq('id', proId).maybeSingle(),
    admin.from('admin_favorite_tidy_pros').select('pro_id').eq('pro_id', proId).maybeSingle(),
  ])

  if (error) throw new Error(`Failed to load Tidy Pro: ${error.message}`)
  if (!tidyPro) notFound()

  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Tidy Pro'
  const timeZone = tidyPro.time_zone ?? DEFAULT_BOOKING_TIME_ZONE
  const timeOff = normalizeTimeOff(parseTimeOff(tidyPro.time_off), todayInZone(timeZone))
  const bookable = isAvailableForBooking({ ...tidyPro, has_push: await hasPushSubscription(admin, proId) })
  const backHref = `/admin/users?role=TIDYPRO&search=${encodeURIComponent(profile?.email ?? '')}`

  return (
    <div>
      <Link href="/admin/users?role=TIDYPRO" className="text-sm text-slate-500 underline">
        ← Back to Tidy Pros
      </Link>

      <div className="mt-4 flex flex-col lg:flex-row gap-6 items-start">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <p className="px-4 py-2 text-xs text-slate-500 bg-slate-50 border-b border-slate-200">What customers see</p>
          <CleanerDetailView
            embedded
            cleanerId={proId}
            name={name}
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
            usesOrganicProducts={tidyPro.uses_organic_products ?? false}
            allergies={Array.isArray(tidyPro.allergies) ? (tidyPro.allergies as string[]) : []}
            reviewsHref={`/admin/tidy-pros/${proId}/reviews`}
            previewBackHref={backHref}
          />
        </div>

        <section aria-labelledby="booking-status-heading" className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 id="booking-status-heading" className="font-semibold text-slate-900">Booking status</h2>
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <FavoriteStar proId={proId} name={name} initialFavorite={favoriteRow != null} size={18} />
              {favoriteRow != null ? 'Favorite' : 'Add to favorites'}
            </span>
          </div>
          <p className="text-sm text-slate-700 flex items-center gap-2 mb-1">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${bookable ? 'bg-green-500' : 'bg-slate-300'}`} aria-hidden="true" />
            {bookable ? 'Customers can book them' : 'Not bookable right now'}
          </p>
          {tidyPro.is_away && <p className="text-sm text-amber-700 mb-1">Away: hidden from search until they turn it off</p>}
          <p className="text-xs text-slate-400 mb-4">Times are in their time zone ({timeZone}).</p>

          <h3 className="text-sm font-semibold text-slate-900 mb-1.5">Services provided</h3>
          {serviceLabels(tidyPro.services_provided).length > 0 ? (
            <p className="text-sm text-slate-600 mb-4">{serviceLabels(tidyPro.services_provided).join(', ')}</p>
          ) : (
            <p className="text-sm text-slate-400 mb-4">Not chosen yet</p>
          )}

          <h3 className="text-sm font-semibold text-slate-900 mb-1.5">Upcoming time off</h3>
          {timeOff.length > 0 ? (
            <ul className="text-sm text-slate-600 space-y-0.5">
              {timeOff.map((range) => (
                <li key={`${range.start}_${range.end}_${range.startTime ?? ''}_${range.endTime ?? ''}`}>{formatTimeOffRange(range)}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">None scheduled</p>
          )}
        </section>
      </div>
    </div>
  )
}
