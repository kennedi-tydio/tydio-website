import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { shiftDateISO, todayInZone } from '@/lib/bookingTime'
import DashboardHome, { type UpcomingBooking } from './DashboardHome'
import type { TidyTask } from './types'
import { completeBookingPayout, getUnreadMessageCountForUser } from '@/lib/bookings'

export const metadata: Metadata = { title: 'Home — Tydio' }

function serverDateDaysAgo(days: number): string {
  return shiftDateISO(new Date().toISOString().slice(0, 10), -days)
}

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ priceError?: string }>
}) {
  const session = await getSession()
  if (!session || session.role !== 'USER') redirect('/login')

  const { priceError } = await searchParams

  const admin = createAdminClient()

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, first_name, booking_access_status, custom_rooms')
    .eq('id', session.profileId)
    .single()

  if (profileError) throw new Error(`Failed to load dashboard profile: ${profileError.message}`)
  if (!profile) redirect('/login')

  const { data: draft } = await admin
    .from('booking_drafts')
    .select('id, task_list, scheduled_date, scheduled_time')
    .eq('customer_user_id', session.profileId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Landing back on the dashboard ends any in-progress "Plan your booking"
  // attempt — the chosen date/time shouldn't still be there the next time
  // they start a new booking. Safe to check unconditionally on every render
  // of this page (including the background re-renders Next.js triggers
  // after a Server Action revalidates '/dashboard'): nothing on the
  // dashboard itself ever sets these fields, so once they're cleared this
  // is a no-op until the customer starts scheduling again.
  //
  // NOTE: task *selections* are deliberately NOT reset here — that has to
  // happen client-side in DashboardHome (on actual component mount), not on
  // every server render of this route. Toggling a task calls saveTasks(),
  // which revalidates '/dashboard' and causes Next.js to silently re-run
  // this page in the background while the customer is still on it; resetting
  // completed flags here would wipe out a selection within moments of them
  // making it, before they ever click "Hire Tidy Pro."
  const { data: upcomingBookingRows } = await admin
    .from('bookings')
    .select('id, tidy_pro_name, tidy_pro_photo_url, scheduled_date, scheduled_time, estimated_duration_minutes, progress_status, time_zone')
    .eq('user_id', session.profileId)
    .eq('status', 'scheduled')
    // A day back, then narrowed below by the booking's own zone.
    .gte('scheduled_date', serverDateDaysAgo(1))
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true })

  // Self-heal: a booking sitting at progress_status 'done' with status still
  // 'scheduled' means something set progress_status without going through
  // markBookingDoneAction's payout side effect (no cleaner-side UI exists
  // yet, so this is currently always a manual/admin edit) — catch it here
  // rather than showing it as perpetually "in progress" and leaving the
  // payout stuck. See completeBookingPayout for why this is safe to call
  // from anywhere.
  const doneButUnpaid = (upcomingBookingRows ?? []).filter((b) => b.progress_status === 'done')
  for (const b of doneButUnpaid) {
    await completeBookingPayout(admin, b.id)
  }
  const doneButUnpaidIds = new Set(doneButUnpaid.map((b) => b.id))

  const upcomingBookings: UpcomingBooking[] = (upcomingBookingRows ?? [])
    .filter((b) => !doneButUnpaidIds.has(b.id))
    .filter((b) => b.scheduled_date != null && b.scheduled_date >= todayInZone(b.time_zone))
    .map((b) => ({
      id: b.id,
      cleanerName: b.tidy_pro_name ?? 'your Tidy Pro',
      cleanerPhotoUrl: b.tidy_pro_photo_url,
      scheduledDate: b.scheduled_date,
      scheduledTime: b.scheduled_time,
      durationMinutes: b.estimated_duration_minutes ?? 30,
      kind: b.progress_status ? 'tracking' : 'upcoming',
      progressStatus: (b.progress_status as 'on_the_way' | 'arrived' | 'cleaning' | null) ?? null,
    }))

  // A completed-but-unreviewed booking keeps prompting for a review for 24
  // hours after completion, or until the customer books another cleaning —
  // whichever comes first.
  const twentyFourHoursAgo = isoHoursAgo(24)
  const { data: completedRows } = await admin
    .from('bookings')
    .select('id, tidy_pro_name, tidy_pro_photo_url, cleaner_marked_complete_at')
    .eq('user_id', session.profileId)
    .eq('status', 'completed')
    .not('cleaner_marked_complete_at', 'is', null)
    .gte('cleaner_marked_complete_at', twentyFourHoursAgo)
    .order('cleaner_marked_complete_at', { ascending: false })

  if (completedRows && completedRows.length > 0) {
    // Retry any transfer that failed the first time around (e.g. Stripe test
    // mode holding a fresh charge as pending balance) — bounded to the same
    // 24h window as the review prompt above, so this stays cheap.
    // completeBookingPayout no-ops once a booking already has a transfer.
    await Promise.all(completedRows.map((r) => completeBookingPayout(admin, r.id)))

    const { data: reviewedRows } = await admin
      .from('reviews')
      .select('booking_id')
      .in('booking_id', completedRows.map((r) => r.id))
    const reviewedIds = new Set((reviewedRows ?? []).map((r) => r.booking_id))

    for (const candidate of completedRows) {
      if (reviewedIds.has(candidate.id)) continue
      const { count } = await admin
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', session.profileId)
        .gt('created_at', candidate.cleaner_marked_complete_at!)
      if (count) continue

      upcomingBookings.unshift({
        id: candidate.id,
        cleanerName: candidate.tidy_pro_name ?? 'your Tidy Pro',
        cleanerPhotoUrl: candidate.tidy_pro_photo_url,
        scheduledDate: null,
        scheduledTime: null,
        durationMinutes: 0,
        kind: 'review_prompt',
        progressStatus: null,
      })
      break
    }
  }

  if (draft?.id && (draft.scheduled_date || draft.scheduled_time)) {
    admin
      .from('booking_drafts')
      .update({ scheduled_date: null, scheduled_time: null, any_day_selected: false })
      .eq('id', draft.id)
      .then(({ error }) => {
        if (error) console.error('Failed to clear stale booking schedule', error)
      })
  }

  const unreadMessageCount = await getUnreadMessageCountForUser(admin, session.profileId)

  return (
    <DashboardHome
      firstName={profile.first_name ?? 'Your'}
      initialTasks={(draft?.task_list as TidyTask[] | null) ?? []}
      draftId={draft?.id ?? null}
      bookingAccessStatus={profile.booking_access_status ?? 'waitlisted'}
      savedRooms={(profile.custom_rooms as string[] | null) ?? []}
      priceError={priceError}
      upcomingBookings={upcomingBookings}
      unreadMessageCount={unreadMessageCount}
    />
  )
}
