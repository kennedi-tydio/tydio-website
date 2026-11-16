import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadCustomerSeries, newTidyProOptions } from '@/lib/recurringBookings'
import ChooseRecurringTidyProView from './ChooseRecurringTidyProView'

export const metadata: Metadata = { title: 'Choose a new Tidy Pro — Tydio' }

export default async function ChooseRecurringTidyProPage({ params }: { params: Promise<{ seriesId: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'USER') redirect('/login')

  const { seriesId } = await params
  const admin = createAdminClient()
  const series = await loadCustomerSeries(admin, session.profileId, seriesId)
  if (!series) redirect('/dashboard/bookings')

  const options = await newTidyProOptions(admin, series)

  return (
    <ChooseRecurringTidyProView
      seriesId={series.id}
      nextDate={series.next_date}
      time={series.scheduled_time.slice(0, 5)}
      options={options}
    />
  )
}
