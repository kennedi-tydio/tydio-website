import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeServices } from '@/lib/tidyProServices'
import { loadRates } from '@/lib/fullServiceRates'
import ServicesView from './ServicesView'

export const metadata: Metadata = { title: 'Services Provided — Tydio' }

export default async function ProServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ pricesSaved?: string; added?: string }>
}) {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const admin = createAdminClient()
  const [{ data: tidyPro, error }, rates] = await Promise.all([
    admin.from('tidypro_profiles').select('services_provided').eq('id', session.profileId).single(),
    loadRates(admin, session.profileId),
  ])

  if (error) throw new Error(`Failed to load services: ${error.message}`)

  return (
    <ServicesView
      initialServices={normalizeServices(tidyPro?.services_provided)}
      priced={{ standardCleaning: rates.standard != null, deepCleaning: rates.deep != null }}
      pricesSaved={(await searchParams).pricesSaved === '1'}
      added={(await searchParams).added === 'deep' ? 'deep' : (await searchParams).added === 'standard' ? 'standard' : null}
    />
  )
}
