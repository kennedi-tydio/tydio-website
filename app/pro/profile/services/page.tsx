import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeServices } from '@/lib/tidyProServices'
import ServicesView from './ServicesView'

export const metadata: Metadata = { title: 'Services Provided — Tydio' }

export default async function ProServicesPage() {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const { data: tidyPro, error } = await createAdminClient()
    .from('tidypro_profiles')
    .select('services_provided')
    .eq('id', session.profileId)
    .single()

  if (error) throw new Error(`Failed to load services: ${error.message}`)

  return <ServicesView initialServices={normalizeServices(tidyPro?.services_provided)} />
}
