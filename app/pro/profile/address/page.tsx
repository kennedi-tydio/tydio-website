import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import AddressView from './AddressView'

export const metadata: Metadata = { title: 'Manage Address — Tydio' }

export default async function ProAddressPage() {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const admin = createAdminClient()

  const { data: tidyPro, error } = await admin
    .from('tidypro_profiles')
    .select('street_address, city, state, zip_code, latitude, longitude')
    .eq('id', session.profileId)
    .single()

  if (error) throw new Error(`Failed to load address: ${error.message}`)

  const address =
    tidyPro?.street_address && tidyPro.city && tidyPro.state && tidyPro.zip_code
      ? {
          street_address: tidyPro.street_address,
          city: tidyPro.city,
          state: tidyPro.state,
          zip_code: tidyPro.zip_code,
          latitude: tidyPro.latitude,
          longitude: tidyPro.longitude,
        }
      : null

  return <AddressView initialAddress={address} />
}
