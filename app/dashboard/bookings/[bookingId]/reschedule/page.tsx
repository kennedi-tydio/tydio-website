import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { DEFAULT_BOOKING_TIME_ZONE, isValidTimeZone, shiftDateISO, todayInZone } from '@/lib/bookingTime'
import { MAX_DATE_RANGE_DAYS } from '@/lib/bookingSlots'
import type { WeeklyAvailability } from '@/lib/cleanerMatching'
import { parseTimeOff } from '@/lib/timeOff'
import type { BusyRange } from '@/app/book/schedule/[cleanerId]/time/ChooseTimeView'
import RescheduleVisitView from './RescheduleVisitView'

export const metadata: Metadata = { title: 'Choose a New Date — Tydio' }

// Choosing a new date for a recurring visit on hold because its payment failed (see
// lib/recurringPayments). The time chosen goes back to the booking page, where the
// customer pays for it.
export default async function RescheduleVisitPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'USER') redirect('/login')

  const { bookingId } = await params
  const admin = createAdminClient()
  const { data: booking } = await admin
    .from('bookings')
    .select('id, tidy_pro_id, tidy_pro_name, status, estimated_duration_minutes, time_zone, scheduled_date, scheduled_time, payment_due_at, suspended_for_payment_at')
    .eq('id', bookingId)
    .eq('user_id', session.profileId)
    .maybeSingle()

  if (!booking || booking.status !== 'scheduled' || !booking.payment_due_at || !booking.suspended_for_payment_at || !booking.tidy_pro_id) {
    redirect(`/dashboard/bookings/${bookingId}`)
  }

  const { data: tidyPro } = await admin.from('tidypro_profiles').select('availability, time_off').eq('id', booking.tidy_pro_id).maybeSingle()

  const timeZone = isValidTimeZone(booking.time_zone) ? booking.time_zone : DEFAULT_BOOKING_TIME_ZONE
  const today = todayInZone(timeZone)
  const lastDay = shiftDateISO(today, MAX_DATE_RANGE_DAYS - 1)

  // Their other bookings; this one can move into its own old slot.
  const { data: bookings } = await admin
    .from('bookings')
    .select('scheduled_date, scheduled_time, estimated_duration_minutes')
    .eq('tidy_pro_id', booking.tidy_pro_id)
    .neq('id', booking.id)
    .gte('scheduled_date', shiftDateISO(today, -1))
    .lte('scheduled_date', lastDay)
    .not('status', 'in', '("cancelled","declined")')

  const busyByDate: Record<string, BusyRange[]> = {}
  for (const b of bookings ?? []) {
    if (!b.scheduled_date || !b.scheduled_time) continue
    ;(busyByDate[b.scheduled_date] ??= []).push({ time: b.scheduled_time, durationMinutes: b.estimated_duration_minutes ?? 60 })
  }

  return (
    <RescheduleVisitView
      bookingId={booking.id}
      cleanerFirstName={(booking.tidy_pro_name ?? 'your Tidy Pro').split(' ')[0]}
      availability={(tidyPro?.availability as WeeklyAvailability | null) ?? {}}
      timeOff={parseTimeOff(tidyPro?.time_off)}
      busyByDate={busyByDate}
      durationMinutes={booking.estimated_duration_minutes ?? 60}
      initialTime={booking.scheduled_time?.slice(0, 5) ?? null}
      dateRange={{ start: today, end: lastDay }}
    />
  )
}
