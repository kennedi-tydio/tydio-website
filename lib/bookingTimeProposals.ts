import type { createAdminClient } from '@/lib/supabase/admin'
import { scheduleForViewer } from '@/lib/bookingTime'

type AdminClient = ReturnType<typeof createAdminClient>

// A Tidy Pro can suggest a new start time while a request is waiting on them, or once
// it's accepted up until they head out. The customer approves or declines it in the
// thread; approving a pending request accepts it at the new time.
export function canChangeStartTime(booking: { status: string | null; progress_status: string | null }): boolean {
  return booking.status === 'pending' || (booking.status === 'scheduled' && booking.progress_status == null)
}

// The cleaner picks a time as they see it. Bookings are stored in the customer's time
// zone, so move it back there, starting from the date the cleaner sees.
export function proposedTimeInBookingZone(
  booking: { scheduled_date: string; scheduled_time: string; time_zone: string | null },
  cleanerTimeZone: string | null,
  cleanerTime: string
): { date: string; time: string } {
  const cleanerView = scheduleForViewer(booking.scheduled_date, booking.scheduled_time, booking.time_zone, cleanerTimeZone)
  const back = scheduleForViewer(cleanerView.date, cleanerTime, cleanerTimeZone ?? booking.time_zone, booking.time_zone)
  return { date: back.date, time: back.time.slice(0, 5) }
}

function naiveMinutes(date: string, time: string): number {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, m] = time.split(':').map(Number)
  return Date.UTC(y, mo - 1, d, h, m) / 60000
}

// Same rule as the accept_booking_request database function (migration 040), for a
// booking that's already accepted and so can't go back through it.
export function overlapsAnotherBooking(
  slot: { date: string; time: string; durationMinutes: number },
  others: { scheduled_date: string | null; scheduled_time: string | null; estimated_duration_minutes: number | null }[]
): boolean {
  const start = naiveMinutes(slot.date, slot.time)
  const end = start + slot.durationMinutes
  return others.some((o) => {
    if (!o.scheduled_date || !o.scheduled_time) return false
    const oStart = naiveMinutes(o.scheduled_date, o.scheduled_time)
    return oStart < end && start < oStart + (o.estimated_duration_minutes ?? 60)
  })
}

export async function hasScheduleConflict(
  admin: AdminClient,
  tidyProId: string,
  bookingId: string,
  slot: { date: string; time: string; durationMinutes: number }
): Promise<boolean> {
  const { data: others } = await admin
    .from('bookings')
    .select('scheduled_date, scheduled_time, estimated_duration_minutes')
    .eq('tidy_pro_id', tidyProId)
    .neq('id', bookingId)
    .not('status', 'in', '(pending,cancelled,declined)')
  return overlapsAnotherBooking(slot, others ?? [])
}

// A newer suggestion, or the cleaner accepting or declining outright, replaces any
// suggestion still waiting on the customer.
export async function withdrawPendingProposals(admin: AdminClient, bookingId: string): Promise<void> {
  await admin
    .from('booking_messages')
    .update({ proposal_status: 'withdrawn' })
    .eq('booking_id', bookingId)
    .eq('kind', 'time_proposal')
    .eq('proposal_status', 'pending')
}
