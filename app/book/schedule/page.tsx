import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type { TidyTask } from '@/app/dashboard/types'
import SchedulePicker from './SchedulePicker'
import type { ScheduledLocation } from './actions'

export const metadata: Metadata = { title: 'Plan Your Booking — Tydio' }

export default async function SchedulePage() {
  const session = await getSession()
  if (!session || session.role !== 'USER') redirect('/login')

  const admin = createAdminClient()

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('booking_access_status')
    .eq('id', session.profileId)
    .single()

  if (profileError) throw new Error(`Failed to load booking profile: ${profileError.message}`)
  if (!profile) redirect('/login')
  if (profile.booking_access_status !== 'booking_allowed') redirect('/dashboard')

  const { data: draft, error: draftError } = await admin
    .from('booking_drafts')
    .select('id, task_list, scheduled_location, scheduled_date, scheduled_time')
    .eq('customer_user_id', session.profileId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (draftError) throw new Error(`Failed to load booking draft: ${draftError.message}`)

  const allTasks = (draft?.task_list as TidyTask[] | null) ?? []
  const hasSelectedTasks = allTasks.some((t) => t.completed)
  if (!draft || !hasSelectedTasks) redirect('/dashboard')

  const { data: addresses } = await admin
    .from('user_addresses')
    .select('id, label, street_address, city, state, zip_code, unit_number, latitude, longitude, is_default')
    .eq('user_id', session.profileId)
    .order('is_default', { ascending: false })

  return (
    <SchedulePicker
      draftId={draft.id}
      addresses={addresses ?? []}
      initialSchedule={{
        location: (draft.scheduled_location as ScheduledLocation | null) ?? null,
        date: draft.scheduled_date,
        time: draft.scheduled_time,
      }}
    />
  )
}
