import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { bookingBlockedByAccess } from '@/lib/accountSuspension'
import { shiftDateISO } from '@/lib/bookingTime'
import { visitDurationMinutes, resolveLocationSquareFootage } from '@/app/dashboard/taskPricing'
import { bookableSelection, fullServiceMinutes } from '@/lib/fullServiceBooking'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import type { TidyTask } from '@/app/dashboard/types'
import type { WeeklyAvailability } from '@/lib/cleanerMatching'
import { parseTimeOff } from '@/lib/timeOff'
import { normalizeScheduleRange } from '@/lib/bookingSlots'
import { isHiddenFromCustomer } from '@/lib/privateTidyPros'
import ChooseTimeView, { type BusyRange } from './ChooseTimeView'

export const metadata: Metadata = { title: 'Choose a Time — Tydio' }

export default async function ChooseTimePage({
  params,
}: {
  params: Promise<{ cleanerId: string }>
}) {
  const session = await getSession()
  if (!session || session.role !== 'USER') redirect('/login')

  const { cleanerId } = await params
  if (isHiddenFromCustomer(cleanerId, session.profileId)) redirect('/book/schedule')
  const admin = createAdminClient()
  // Waitlisted customers can't book, so they can't pick a time either.
  if (await bookingBlockedByAccess(admin, session.profileId)) redirect('/dashboard')

  const { data: tidyPro, error } = await admin
    .from('tidypro_profiles')
    .select('availability, time_off')
    .eq('id', cleanerId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load Tidy Pro availability: ${error.message}`)
  if (!tidyPro) redirect('/book/schedule')

  const { data: draft, error: draftError } = await admin
    .from('booking_drafts')
    .select('id, task_list, full_service, scheduled_location, scheduled_date, scheduled_end_date, scheduled_time, scheduled_end_time')
    .eq('customer_user_id', session.profileId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (draftError) throw new Error(`Failed to load booking draft: ${draftError.message}`)
  if (!draft) redirect('/dashboard')

  // A specific date AND time were already locked in on "Plan your booking" —
  // search only returned cleaners free at that exact slot, so there's
  // nothing left to choose here. Lock in this cleaner and go straight to
  // reviewing the request. A date range or time window still needs a pick.
  const { date: rangeStart, endDate: rangeEnd, time: windowStart, endTime: windowEnd } = normalizeScheduleRange({
    date: draft.scheduled_date,
    endDate: draft.scheduled_end_date,
    time: draft.scheduled_time,
    endTime: draft.scheduled_end_time,
  })
  if (draft.scheduled_date && draft.scheduled_time && !rangeEnd && !windowEnd) {
    const { error: confirmError } = await admin
      .from('booking_drafts')
      .update({ selected_tidy_pro_id: cleanerId })
      .eq('id', draft.id)
      .eq('customer_user_id', session.profileId)

    if (confirmError) throw new Error(`Failed to confirm Tidy Pro: ${confirmError.message}`)
    redirect('/book/review')
  }

  const allTasks = (draft.task_list as TidyTask[] | null) ?? []
  const tasks = allTasks.filter((t) => t.completed)

  // Entire home tasks take longer in a bigger home.
  const squareFootage = await resolveLocationSquareFootage(
    admin,
    session.profileId,
    draft.scheduled_location as ScheduledLocation | null
  )

  // A Standard / Deep Cleaning's estimated time (from search, so cached) counts too.
  const fullService = bookableSelection(draft.full_service)
  const cleaningMinutes = fullService ? (await fullServiceMinutes(fullService, squareFootage)).minutes : 0

  let durationMinutes = 180
  try {
    durationMinutes = visitDurationMinutes(tasks, squareFootage, cleaningMinutes)
  } catch {
    // fall back to the default typical duration if a task is unpriceable
  }

  const { data: bookings } = await admin
    .from('bookings')
    .select('scheduled_date, scheduled_time, estimated_duration_minutes')
    .eq('tidy_pro_id', cleanerId)
    // A day back, since "today" here is the server's, and the customer's may be behind it.
    .gte('scheduled_date', shiftDateISO(new Date().toISOString().slice(0, 10), -1))
    .not('status', 'in', '("cancelled","declined")')

  const busyByDate = new Map<string, BusyRange[]>()
  for (const b of bookings ?? []) {
    if (!b.scheduled_date || !b.scheduled_time) continue
    const list = busyByDate.get(b.scheduled_date) ?? []
    list.push({ time: b.scheduled_time, durationMinutes: b.estimated_duration_minutes ?? 60 })
    busyByDate.set(b.scheduled_date, list)
  }

  return (
    <ChooseTimeView
      draftId={draft.id}
      cleanerId={cleanerId}
      availability={(tidyPro.availability as WeeklyAvailability | null) ?? {}}
      timeOff={parseTimeOff(tidyPro.time_off)}
      busyByDate={Object.fromEntries(busyByDate)}
      durationMinutes={durationMinutes}
      initialDate={draft.scheduled_date}
      initialTime={draft.scheduled_time}
      dateRange={rangeStart && rangeEnd ? { start: rangeStart, end: rangeEnd } : null}
      timeWindow={windowStart && windowEnd ? { start: windowStart, end: windowEnd } : null}
    />
  )
}
