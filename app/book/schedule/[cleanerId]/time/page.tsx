import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { shiftDateISO } from '@/lib/bookingTime'
import { visitDurationMinutes } from '@/app/dashboard/taskPricing'
import type { TidyTask } from '@/app/dashboard/types'
import type { WeeklyAvailability } from '@/lib/cleanerMatching'
import { parseTimeOff } from '@/lib/timeOff'
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
  const admin = createAdminClient()

  const { data: tidyPro, error } = await admin
    .from('tidypro_profiles')
    .select('availability, time_off')
    .eq('id', cleanerId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load Tidy Pro availability: ${error.message}`)
  if (!tidyPro) redirect('/book/schedule')

  const { data: draft, error: draftError } = await admin
    .from('booking_drafts')
    .select('id, task_list, scheduled_date, scheduled_time')
    .eq('customer_user_id', session.profileId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (draftError) throw new Error(`Failed to load booking draft: ${draftError.message}`)
  if (!draft) redirect('/dashboard')

  // A specific date AND time were already locked in on "Plan your booking" —
  // search only returned cleaners free at that exact slot, so there's
  // nothing left to choose here. Lock in this cleaner and go straight to
  // reviewing the request.
  if (draft.scheduled_date && draft.scheduled_time) {
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

  let durationMinutes = 180
  try {
    durationMinutes = visitDurationMinutes(tasks)
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
    />
  )
}
