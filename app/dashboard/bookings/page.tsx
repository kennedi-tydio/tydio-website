import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { isHiddenGroupRequest } from '@/lib/bookingRequestGroups'
import { todayInZone } from '@/lib/bookingTime'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import { getUnreadMessageCountForUser } from '@/lib/bookings'
import BookingsListView, { type BookingRow } from './BookingsListView'

export const metadata: Metadata = { title: 'Your Bookings — Tydio' }

export default async function BookingsPage() {
  const session = await getSession()
  if (!session || session.role !== 'USER') redirect('/login')

  const admin = createAdminClient()

  const { data: rows } = await admin
    .from('bookings')
    .select('id, tidy_pro_name, scheduled_date, scheduled_time, estimated_duration_minutes, status, decision_status, scheduled_location, request_group_id, time_zone')
    .eq('user_id', session.profileId)
    // A request isn't a booking until the Tidy Pro accepts it — until then it
    // lives in Messages, same as on the Tidy Pro's side.
    .neq('status', 'pending')
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true })

  const bookings: BookingRow[] = (rows ?? []).filter((b) => !isHiddenGroupRequest(b)).map((b) => {
    const location = b.scheduled_location as ScheduledLocation | null
    const address = location?.type === 'address' ? location.label : location?.type === 'current_location' ? 'Current Location' : null

    const today = todayInZone(b.time_zone)
    const isTerminal = b.status === 'completed' || b.status === 'cancelled' || b.status === 'declined'
    const bucket: BookingRow['bucket'] =
      isTerminal || (b.scheduled_date != null && b.scheduled_date < today)
        ? 'past'
        : b.scheduled_date === today
        ? 'today'
        : 'upcoming'

    return {
      id: b.id,
      cleanerName: b.tidy_pro_name ?? 'your Tidy Pro',
      address,
      scheduledDate: b.scheduled_date,
      scheduledTime: b.scheduled_time,
      durationMinutes: b.estimated_duration_minutes ?? 30,
      bucket,
      today,
    }
  })

  const unreadMessageCount = await getUnreadMessageCountForUser(admin, session.profileId)

  return <BookingsListView bookings={bookings} unreadMessageCount={unreadMessageCount} />
}
