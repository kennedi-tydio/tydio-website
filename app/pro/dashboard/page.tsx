import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRatingVisibleToTidyPro, getUnreadMessageCountForTidyPro } from '@/lib/bookings'
import { isBackgroundCheckStepDone, shouldShowVerifiedScreen } from '@/lib/backgroundCheck'
import { fullServicePricingSteps, missingOnboardingSteps } from '@/lib/cleanerOnboarding'
import { loadRatesForDisplay, unpricedFullServices } from '@/lib/fullServiceRates'
import { notificationStatus } from '@/lib/pushRequirement'
import { DEFAULT_BOOKING_TIME_ZONE, START_BOOKING_WINDOW_MINUTES, bookingStartInstant, scheduleForViewer, shiftDateISO, todayInZone } from '@/lib/bookingTime'
import { NO_ACCEPTANCE_STATS, getAcceptanceStats } from '@/lib/acceptanceRate'
import { isJobCompleted, showCompletedJob } from '@/lib/completedJobVisibility'
import { readSnapshot } from '@/lib/fullServiceBooking'
import { FULL_SERVICE_LABEL } from '@/lib/fullService'
import DashboardHome, { type BookingRequest, type TodayJob, type UpcomingJob } from './DashboardHome'
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
    ...missingOnboardingSteps({ ...tidyPro, ...(await notificationStatus(admin, session.profileId)) }),
    // Not a bookability step: until it's done they're only left out of Standard /
    // Deep Cleaning requests, so it's listed even once everything else is finished.
    ...fullServicePricingSteps(unpricedFullServices(tidyPro.services_provided, await loadRatesForDisplay(admin, session.profileId))),
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

  // Pending requests aren't jobs yet — they're listed separately below, and
  // answered in Messages.
  // Fetched a day wider than needed, since a booking's date can shift once converted
  // into this cleaner's own time, then sorted by the date they'd actually see.
  const today = todayInZone(tidyPro.time_zone ?? DEFAULT_BOOKING_TIME_ZONE)
  const { data: jobRows } = await admin
    .from('bookings')
    .select('id, user_id, scheduled_date, scheduled_time, estimated_duration_minutes, status, progress_status, time_zone, cleaner_marked_complete_at')
    .eq('tidy_pro_id', session.profileId)
    .gte('scheduled_date', shiftDateISO(today, -1))
    .not('status', 'in', '("pending","cancelled","declined")')
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true })

  const jobs = (jobRows ?? []).map((b) => {
    const schedule = scheduleForViewer(b.scheduled_date, b.scheduled_time, b.time_zone, tidyPro.time_zone)
    return { ...b, viewerDate: schedule.date, viewerTime: schedule.time }
  })
  // A finished job isn't the active job any more. It stays on the list (so the Tidy Pro
  // can leave their review) until both sides have reviewed, or 24 hours after its end,
  // which can carry it past midnight into the next day.
  const completedIds = jobs.filter((b) => isJobCompleted(b) && b.viewerDate != null && b.viewerDate <= today).map((b) => b.id)
  const [{ data: customerReviews }, { data: tidyProReviews }] = completedIds.length
    ? await Promise.all([
        admin.from('reviews').select('booking_id').in('booking_id', completedIds),
        admin.from('cleaner_reviews_of_customers').select('booking_id').in('booking_id', completedIds),
      ])
    : [{ data: [] }, { data: [] }]
  const customerReviewed = new Set((customerReviews ?? []).map((r) => r.booking_id))
  const tidyProReviewed = new Set((tidyProReviews ?? []).map((r) => r.booking_id))
  const nowMs = currentTimeMs()

  const todaysBookings = jobs.filter((b) => {
    if (b.viewerDate == null || b.viewerDate > today) return false
    if (!isJobCompleted(b)) return b.viewerDate === today
    return showCompletedJob(b, { customerReviewed: customerReviewed.has(b.id), tidyProReviewed: tidyProReviewed.has(b.id) }, nowMs)
  })
  const upcomingBookings = jobs.filter((b) => b.viewerDate != null && b.viewerDate > today).slice(0, 5)

  // Requests still waiting on this Tidy Pro's answer. Accepting or declining
  // happens in the request's message thread; the dashboard just surfaces them.
  // Ones whose date has already passed can't be accepted, so they're left out.
  const { data: requestRows } = await admin
    .from('bookings')
    .select('id, user_id, scheduled_date, scheduled_time, estimated_duration_minutes, time_zone, cleaner_pay, full_service, task_list, created_at')
    .eq('tidy_pro_id', session.profileId)
    .eq('status', 'pending')
    .eq('decision_status', 'pending')
    .gte('scheduled_date', shiftDateISO(today, -1))
    .order('created_at', { ascending: false })

  const pendingRequests = (requestRows ?? [])
    .map((b) => {
      const schedule = scheduleForViewer(b.scheduled_date, b.scheduled_time, b.time_zone, tidyPro.time_zone)
      return { ...b, viewerDate: schedule.date, viewerTime: schedule.time }
    })
    .filter((b) => b.viewerDate == null || b.viewerDate >= today)

  const customerIds = [...new Set([
    ...(todaysBookings ?? []).map((b) => b.user_id),
    ...(upcomingBookings ?? []).map((b) => b.user_id),
    ...pendingRequests.map((b) => b.user_id),
  ])]
  const { data: customers } = customerIds.length
    ? await admin
        .from('profiles')
        .select('id, first_name, last_name, street_address')
        .in('id', customerIds)
    : { data: [] }

  const customerById = new Map((customers ?? []).map((c) => [c.id, c]))

  const todaysJobs: TodayJob[] = (todaysBookings ?? []).map((b) => {
    const customer = customerById.get(b.user_id)
    // Highlighted once it can be started (an hour before), through its scheduled end,
    // or while it's under way. Never once it's finished.
    const completed = isJobCompleted(b)
    let isActive = !completed && b.progress_status != null
    let startsSoon = false
    if (!completed && !isActive && b.scheduled_date && b.scheduled_time) {
      const start = bookingStartInstant(b.scheduled_date, b.scheduled_time, b.time_zone).getTime()
      const now = currentTimeMs()
      isActive = now >= start - START_BOOKING_WINDOW_MINUTES * 60 * 1000 && now < start + (b.estimated_duration_minutes ?? 60) * 60 * 1000
      startsSoon = isActive && now < start
    }
    return {
      id: b.id,
      customerName: customer ? [customer.first_name, customer.last_name].filter(Boolean).join(' ') : 'Customer',
      address: customer?.street_address ?? '',
      startTime: b.viewerTime,
      durationMinutes: b.estimated_duration_minutes,
      progressStatus: b.progress_status,
      isActive,
      startsSoon,
      completed,
      needsTidyProReview: completed && !tidyProReviewed.has(b.id),
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
      startsSoon: false,
      completed: false,
      needsTidyProReview: false,
    }
  })

  const bookingRequests: BookingRequest[] = pendingRequests.map((b) => {
    const customer = customerById.get(b.user_id)
    const fullService = readSnapshot(b.full_service)
    const taskCount = Array.isArray(b.task_list) ? b.task_list.length : 0
    return {
      id: b.id,
      customerName: customer ? [customer.first_name, customer.last_name].filter(Boolean).join(' ') || 'Customer' : 'Customer',
      date: b.viewerDate,
      startTime: b.viewerTime,
      durationMinutes: b.estimated_duration_minutes,
      payout: b.cleaner_pay ?? 0,
      serviceLabel: fullService
        ? FULL_SERVICE_LABEL[fullService.selection.type]
        : `${taskCount} task${taskCount === 1 ? '' : 's'}`,
    }
  })

  const acceptance = (await getAcceptanceStats(admin, [session.profileId])).get(session.profileId) ?? NO_ACCEPTANCE_STATS

  const visibleRating = await getRatingVisibleToTidyPro(admin, session.profileId, tidyPro.rating, tidyPro.review_count)

  return (
    <DashboardHome
      firstName={profile.first_name ?? 'there'}
      jobsToday={todaysBookings.filter((b) => b.viewerDate === today).length}
      jobsCompleted={jobsCompleted ?? 0}
      rating={visibleRating.rating}
      reviewCount={visibleRating.reviewCount}
      acceptance={acceptance}
      todaysJobs={todaysJobs}
      upcomingJobs={upcomingJobs}
      bookingRequests={bookingRequests}
      unreadMessageCount={unreadMessageCount}
      onboardingSteps={onboardingSteps}
    />
  )
}
