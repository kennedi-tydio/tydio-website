import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import TravelDistanceView from './TravelDistanceView'

export const metadata: Metadata = { title: 'Travel Distance — Tydio' }

export default async function ProTravelDistancePage() {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const admin = createAdminClient()

  const { data: tidyPro, error } = await admin
    .from('tidypro_profiles')
    .select('travel_radius_miles')
    .eq('id', session.profileId)
    .single()

  if (error) throw new Error(`Failed to load travel distance: ${error.message}`)

  return <TravelDistanceView initialMiles={tidyPro?.travel_radius_miles ?? null} />
}
