import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasBookingStarted, shiftDateISO, todayInZone } from '@/lib/bookingTime'
import DashboardHome, { type UpcomingBooking } from './DashboardHome'
import type { TidyTask } from './types'
import { normalizeFullServiceSelection } from '@/lib/fullService'
import { completeBookingPayout, getUnreadMessageCountForUser } from '@/lib/bookings'
import { CLEANER_CANCELLED_REASON, bookingsBeingReplaced, isAwaitingReplacements } from '@/lib/bookingRequestGroups'

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
    .select('id, task_list, full_service, scheduled_date, scheduled_time')
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
    .select('id, tidy_pro_name, tidy_pro_photo_url, scheduled_date, scheduled_time, estimated_duration_minutes, progress_status, time_zone, suspended_for_upcharge_at, payment_failed_at, suspended_for_payment_at, payment_due_at')
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
    .map((b): UpcomingBooking => ({
      id: b.id,
      cleanerName: b.tidy_pro_name ?? 'your Tidy Pro',
      cleanerPhotoUrl: b.tidy_pro_photo_url,
      scheduledDate: b.scheduled_date,
      scheduledTime: b.scheduled_time,
      durationMinutes: b.estimated_duration_minutes ?? 30,
      kind:
        b.suspended_for_upcharge_at || (b.payment_due_at && (b.payment_failed_at || b.suspended_for_payment_at))
          ? 'needs_attention'
          : b.progress_status
            ? 'tracking'
            : hasBookingStarted(b.scheduled_date, b.scheduled_time, new Date(), b.time_zone)
              ? 'active'
              : 'upcoming',
      progressStatus: (b.progress_status as 'on_the_way' | 'arrived' | 'cleaning' | null) ?? null,
      // Why it needs attention: an upcharge to pay, or a recurring visit whose charge failed.
      attentionReason: b.suspended_for_upcharge_at ? 'upcharge' : 'payment',
    }))

  // Requests still waiting on a Tidy Pro show alongside upcoming bookings; once
  // accepted, status turns 'scheduled' and the row above picks it up instead.
  // A request sent to several Tidy Pros (or a set of replacement requests) is
  // one card, opening the customer's own booking for that group.
  const { data: pendingRows } = await admin
    .from('bookings')
    .select('id, tidy_pro_name, tidy_pro_photo_url, scheduled_date, scheduled_time, estimated_duration_minutes, time_zone, request_group_id')
    .eq('user_id', session.profileId)
    .eq('status', 'pending')
    .gte('scheduled_date', serverDateDaysAgo(1))
    .order('created_at', { ascending: true })

  const pendingGroupIds = [...new Set((pendingRows ?? []).map((b) => b.request_group_id).filter((id): id is string => id != null))]
  const { data: pendingGroups } = pendingGroupIds.length
    ? await admin.from('booking_request_groups').select('id, original_booking_id, primary_booking_id').in('id', pendingGroupIds)
    : { data: [] }
  const customerBookingOfGroup = new Map((pendingGroups ?? []).map((g) => [g.id, g.original_booking_id ?? g.primary_booking_id]))

  const pendingByCard = new Map<string, NonNullable<typeof pendingRows>>()
  for (const b of pendingRows ?? []) {
    if (b.scheduled_date == null || b.scheduled_date < todayInZone(b.time_zone)) continue
    const key = b.request_group_id ? `group:${b.request_group_id}` : b.id
    pendingByCard.set(key, [...(pendingByCard.get(key) ?? []), b])
  }
  for (const [key, rows] of pendingByCard) {
    const first = rows[0]
    const groupId = key.startsWith('group:') ? first.request_group_id : null
    upcomingBookings.push({
      id: (groupId && customerBookingOfGroup.get(groupId)) || first.id,
      cleanerName: first.tidy_pro_name ?? 'your Tidy Pro',
      cleanerPhotoUrl: first.tidy_pro_photo_url,
      scheduledDate: first.scheduled_date,
      scheduledTime: first.scheduled_time,
      durationMinutes: first.estimated_duration_minutes ?? 30,
      kind: 'pending',
      progressStatus: null,
      sentToSeveral: rows.length > 1,
    })
  }

  // Canceled (or declined) by the Tidy Pro, with the payment still held: it stays among
  // upcoming bookings, flagged, until the customer chooses other Tidy Pros or cancels.
  const { data: droppedRows } = await admin
    .from('bookings')
    .select('id, tidy_pro_name, tidy_pro_photo_url, scheduled_date, scheduled_time, estimated_duration_minutes, time_zone, status, request_group_id, cancelled_reason, stripe_refund_id')
    .eq('user_id', session.profileId)
    .eq('status', 'declined')
    .is('stripe_refund_id', null)
    .gte('scheduled_date', serverDateDaysAgo(1))
  const awaiting = (droppedRows ?? []).filter(
    (b) => isAwaitingReplacements(b) && b.scheduled_date != null && b.scheduled_date >= todayInZone(b.time_zone)
  )
  const alreadyReplacing = await bookingsBeingReplaced(admin, awaiting.map((b) => b.id))
  for (const b of awaiting.filter((row) => !alreadyReplacing.has(row.id))) {
    upcomingBookings.push({
      id: b.id,
      cleanerName: b.tidy_pro_name ?? 'your Tidy Pro',
      cleanerPhotoUrl: b.tidy_pro_photo_url,
      scheduledDate: b.scheduled_date,
      scheduledTime: b.scheduled_time,
      durationMinutes: b.estimated_duration_minutes ?? 30,
      kind: 'tidy_pro_dropped',
      progressStatus: null,
      cleanerCancelled: b.cancelled_reason === CLEANER_CANCELLED_REASON,
    })
  }

  upcomingBookings.sort(
    (a, b) =>
      // An upcharge to pay comes before anything else, then by date and time.
      Number(b.kind === 'needs_attention') - Number(a.kind === 'needs_attention') ||
      `${a.scheduledDate ?? ''} ${a.scheduledTime ?? ''}`.localeCompare(`${b.scheduledDate ?? ''} ${b.scheduledTime ?? ''}`)
  )

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
      .update({ scheduled_date: null, scheduled_end_date: null, scheduled_time: null, scheduled_end_time: null, any_day_selected: false })
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
      fullService={normalizeFullServiceSelection(draft?.full_service)}
      bookingAccessStatus={profile.booking_access_status ?? 'waitlisted'}
      savedRooms={(profile.custom_rooms as string[] | null) ?? []}
      priceError={priceError}
      upcomingBookings={upcomingBookings}
      unreadMessageCount={unreadMessageCount}
    />
  )
}
