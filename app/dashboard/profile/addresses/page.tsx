import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import AddressesView from './AddressesView'

export const metadata: Metadata = { title: 'Manage Addresses — Tydio' }

export default async function AddressesPage() {
  const session = await getSession()
  if (!session || session.role !== 'USER') redirect('/login')

  const admin = createAdminClient()

  const { data: addresses, error } = await admin
    .from('user_addresses')
    .select('id, label, street_address, unit_number, city, state, zip_code, latitude, longitude, is_default, square_footage')
    .eq('user_id', session.profileId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Failed to load addresses: ${error.message}`)

  return <AddressesView initialAddresses={addresses ?? []} />
}
