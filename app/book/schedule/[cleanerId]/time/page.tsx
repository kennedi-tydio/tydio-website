import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildValidatedTaskPool } from '@/app/dashboard/taskPricing'
import type { TidyTask } from '@/app/dashboard/types'
import type { WeeklyAvailability } from '@/lib/cleanerMatching'
import ChooseTimeView, { type BusyRange } from './ChooseTimeView'

export const metadata: Metadata = { title: 'Choose a Time — Tydio' }

function todayISO(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function nowMinutesSinceMidnight(): number {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

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
    .select('availability')
    .eq('id', cleanerId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load Tidy Pro availability: ${error.message}`)
  if (!tidyPro) redirect('/book/schedule')

  const { data: draft, error: draftError } = await admin
    .from('booking_drafts')
    .select('id, task_list')
    .eq('customer_user_id', session.profileId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (draftError) throw new Error(`Failed to load booking draft: ${draftError.message}`)
  if (!draft) redirect('/dashboard')

  const allTasks = (draft.task_list as TidyTask[] | null) ?? []
  const tasks = allTasks.filter((t) => t.completed)

  let durationMinutes = 180
  try {
    const pool = buildValidatedTaskPool(tasks)
    durationMinutes = pool.reduce((sum, t) => sum + t.estimated_minutes, 0)
  } catch {
    // fall back to the default typical duration if a task is unpriceable
  }

  const { data: bookings } = await admin
    .from('bookings')
    .select('scheduled_date, scheduled_time, estimated_duration_minutes')
    .eq('tidy_pro_id', cleanerId)
    .gte('scheduled_date', todayISO())
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
      busyByDate={Object.fromEntries(busyByDate)}
      durationMinutes={durationMinutes}
      todayISO={todayISO()}
      nowMinutes={nowMinutesSinceMidnight()}
    />
  )
}
