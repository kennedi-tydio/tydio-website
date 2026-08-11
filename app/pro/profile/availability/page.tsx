import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import AvailabilityView from './AvailabilityView'
import type { WeeklyAvailability } from '@/lib/cleanerMatching'

export const metadata: Metadata = { title: 'Availability — Tydio' }

export default async function AvailabilityPage() {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const admin = createAdminClient()

  const { data: tidyPro, error } = await admin
    .from('tidypro_profiles')
    .select('availability')
    .eq('id', session.profileId)
    .single()

  if (error) throw new Error(`Failed to load availability: ${error.message}`)

  return <AvailabilityView initialAvailability={(tidyPro?.availability as WeeklyAvailability | null) ?? {}} />
}
