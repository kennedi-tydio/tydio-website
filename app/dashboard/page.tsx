import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import DashboardHome from './DashboardHome'
import type { TidyTask } from './types'

export const metadata: Metadata = { title: 'Home — Tydio' }

export default async function DashboardPage() {
  const session = await getSession()
  if (!session || session.role !== 'USER') redirect('/login')

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('id, first_name, booking_access_status, custom_rooms')
    .eq('id', session.profileId)
    .single()

  if (!profile) redirect('/login')

  const { data: draft } = await admin
    .from('booking_drafts')
    .select('id, task_list')
    .eq('customer_user_id', session.profileId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (
    <DashboardHome
      firstName={profile.first_name ?? 'Your'}
      userId={session.profileId}
      initialTasks={(draft?.task_list as TidyTask[] | null) ?? []}
      draftId={draft?.id ?? null}
      bookingAccessStatus={profile.booking_access_status ?? 'waitlisted'}
      savedRooms={(profile.custom_rooms as string[] | null) ?? []}
    />
  )
}
