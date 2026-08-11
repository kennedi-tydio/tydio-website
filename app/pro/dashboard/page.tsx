import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import DashboardHome, { type TodayJob } from './DashboardHome'

export const metadata: Metadata = { title: 'Dashboard — Tydio' }

function todayISO(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default async function ProDashboardPage() {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const admin = createAdminClient()

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, first_name')
    .eq('id', session.profileId)
    .single()

  if (profileError) throw new Error(`Failed to load dashboard profile: ${profileError.message}`)
  if (!profile) redirect('/login')

  const { data: tidyPro } = await admin
    .from('tidypro_profiles')
    .select('rating, review_count')
    .eq('id', session.profileId)
    .maybeSingle()

  const { count: jobsCompleted } = await admin
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('tidy_pro_id', session.profileId)
    .not('cleaner_marked_complete_at', 'is', null)

  const { data: todaysBookings } = await admin
    .from('bookings')
    .select('id, user_id, scheduled_time, estimated_duration_minutes, status')
    .eq('tidy_pro_id', session.profileId)
    .eq('scheduled_date', todayISO())
    .not('status', 'in', '("cancelled","declined")')
    .order('scheduled_time', { ascending: true })

  const customerIds = [...new Set((todaysBookings ?? []).map((b) => b.user_id))]
  const { data: customers } = customerIds.length
    ? await admin
        .from('profiles')
        .select('id, first_name, last_name, street_address')
        .in('id', customerIds)
    : { data: [] }

  const customerById = new Map((customers ?? []).map((c) => [c.id, c]))

  const todaysJobs: TodayJob[] = (todaysBookings ?? []).map((b) => {
    const customer = customerById.get(b.user_id)
    return {
      id: b.id,
      customerName: customer ? [customer.first_name, customer.last_name].filter(Boolean).join(' ') : 'Customer',
      address: customer?.street_address ?? '',
      startTime: b.scheduled_time,
      durationMinutes: b.estimated_duration_minutes,
    }
  })

  return (
    <DashboardHome
      firstName={profile.first_name ?? 'there'}
      jobsToday={todaysJobs.length}
      jobsCompleted={jobsCompleted ?? 0}
      rating={tidyPro?.rating ?? 0}
      reviewCount={tidyPro?.review_count ?? 0}
      todaysJobs={todaysJobs}
    />
  )
}
