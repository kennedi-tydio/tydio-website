import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRatingVisibleToTidyPro, getUnreadMessageCountForTidyPro } from '@/lib/bookings'
import { isBackgroundCheckStepDone, shouldShowVerifiedScreen } from '@/lib/backgroundCheck'
import { missingOnboardingSteps } from '@/lib/cleanerOnboarding'
import { hasPushSubscription } from '@/lib/pushRequirement'
import { DEFAULT_BOOKING_TIME_ZONE, bookingStartInstant, scheduleForViewer, shiftDateISO, todayInZone } from '@/lib/bookingTime'
import { NO_ACCEPTANCE_STATS, getAcceptanceStats } from '@/lib/acceptanceRate'
import DashboardHome, { type TodayJob, type UpcomingJob } from './DashboardHome'
import PendingDashboardHome from './PendingDashboardHome'

export const metadata: Metadata = { title: 'Dashboard — Tydio' }

function currentTimeMs(): number {
  return Date.now()
}

export default async function ProDashboardPage() {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const admin = createAdminClient()

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, first_name')
    .eq('id', session.profileId)
    .single()

  if (profileError) throw new Error(`Failed to load dashboard profile: ${profileError.message}`)
  if (!profile) redirect('/login')

  const { data: tidyPro } = await admin
    .from('tidypro_profiles')
    .select('time_zone, rating, review_count, availability, profile_photo_url, bio, stripe_onboarding_completed, travel_radius_miles, services_provided, latitude, longitude, terms_accepted, cleaner_status, verified_ack_at')
    .eq('id', session.profileId)
    .maybeSingle()

  const { data: backgroundCheck } = await admin
    .from('background_checks')
    .select('status, requested_at, link_sent_at, submitted_at')
    .eq('pro_id', session.profileId)
    .maybeSingle()

  if (!tidyPro?.terms_accepted || !isBackgroundCheckStepDone(tidyPro.cleaner_status, backgroundCheck)) redirect('/pro/onboarding')
  if (shouldShowVerifiedScreen(tidyPro, backgroundCheck)) redirect('/pro/onboarding')

  const unreadMessageCount = await getUnreadMessageCountForTidyPro(admin, session.profileId)

  // The background check counts as done once they're approved (an admin can approve
  // without one). A failed check isn't something they can finish, so it isn't listed.
  const onboardingSteps = [
    ...(tidyPro.cleaner_status === 'approved' || backgroundCheck?.status === 'failed'
      ? []
      : [{ label: 'Complete background check', href: '/pro/onboarding/almost-there' }]),
    ...missingOnboardingSteps({ ...tidyPro, has_push: await hasPushSubscription(admin, session.profileId) }),
  ]

  // A cleaner still waiting on their check gets the regular dashboard, with the
  // check listed as a requested action. Only a failed check gets its own screen.
  if (tidyPro.cleaner_status !== 'approved' && backgroundCheck?.status === 'failed') {
    return (
      <PendingDashboardHome
        firstName={profile.first_name ?? 'there'}
        unreadMessageCount={unreadMessageCount}
        backgroundCheckFailed={backgroundCheck?.status === 'failed'}
        onboardingSteps={onboardingSteps}
      />
    )
  }

  const { count: jobsCompleted } = await admin
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('tidy_pro_id', session.profileId)
    .not('cleaner_marked_complete_at', 'is', null)

  // Pending requests aren't jobs yet — they live in Messages until the Tidy
  // Pro accepts or declines them.
  // Fetched a day wider than needed, since a booking's date can shift once converted
  // into this cleaner's own time, then sorted by the date they'd actually see.
  const today = todayInZone(tidyPro.time_zone ?? DEFAULT_BOOKING_TIME_ZONE)
  const { data: jobRows } = await admin
    .from('bookings')
    .select('id, user_id, scheduled_date, scheduled_time, estimated_duration_minutes, status, progress_status, time_zone')
    .eq('tidy_pro_id', session.profileId)
    .gte('scheduled_date', shiftDateISO(today, -1))
    .not('status', 'in', '("pending","cancelled","declined")')
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true })

  const jobs = (jobRows ?? []).map((b) => {
    const schedule = scheduleForViewer(b.scheduled_date, b.scheduled_time, b.time_zone, tidyPro.time_zone)
    return { ...b, viewerDate: schedule.date, viewerTime: schedule.time }
  })
  const todaysBookings = jobs.filter((b) => b.viewerDate === today)
  const upcomingBookings = jobs.filter((b) => b.viewerDate != null && b.viewerDate > today).slice(0, 5)

  const customerIds = [...new Set([...(todaysBookings ?? []).map((b) => b.user_id), ...(upcomingBookings ?? []).map((b) => b.user_id)])]
  const { data: customers } = customerIds.length
    ? await admin
        .from('profiles')
        .select('id, first_name, last_name, street_address')
        .in('id', customerIds)
    : { data: [] }

  const customerById = new Map((customers ?? []).map((c) => [c.id, c]))

  const todaysJobs: TodayJob[] = (todaysBookings ?? []).map((b) => {
    const customer = customerById.get(b.user_id)
    let isActive = b.progress_status != null
    if (!isActive && b.scheduled_date && b.scheduled_time) {
      const start = bookingStartInstant(b.scheduled_date, b.scheduled_time, b.time_zone).getTime()
      const now = currentTimeMs()
      isActive = now >= start && now < start + (b.estimated_duration_minutes ?? 60) * 60 * 1000
    }
    return {
      id: b.id,
      customerName: customer ? [customer.first_name, customer.last_name].filter(Boolean).join(' ') : 'Customer',
      address: customer?.street_address ?? '',
      startTime: b.viewerTime,
      durationMinutes: b.estimated_duration_minutes,
      progressStatus: b.progress_status,
      isActive,
    }
  })

  const upcomingJobs: UpcomingJob[] = (upcomingBookings ?? []).map((b) => {
    const customer = customerById.get(b.user_id)
    return {
      id: b.id,
      customerName: customer ? [customer.first_name, customer.last_name].filter(Boolean).join(' ') : 'Customer',
      address: customer?.street_address ?? '',
      date: b.viewerDate,
      startTime: b.viewerTime,
      durationMinutes: b.estimated_duration_minutes,
      progressStatus: null,
      isActive: false,
    }
  })

  const acceptance = (await getAcceptanceStats(admin, [session.profileId])).get(session.profileId) ?? NO_ACCEPTANCE_STATS

  const visibleRating = await getRatingVisibleToTidyPro(admin, session.profileId, tidyPro.rating, tidyPro.review_count)

  return (
    <DashboardHome
      firstName={profile.first_name ?? 'there'}
      jobsToday={todaysJobs.length}
      jobsCompleted={jobsCompleted ?? 0}
      rating={visibleRating.rating}
      reviewCount={visibleRating.reviewCount}
      acceptance={acceptance}
      todaysJobs={todaysJobs}
      upcomingJobs={upcomingJobs}
      unreadMessageCount={unreadMessageCount}
      onboardingSteps={onboardingSteps}
    />
  )
}
