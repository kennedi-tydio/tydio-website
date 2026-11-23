import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeServices } from '@/lib/tidyProServices'
import { loadRatesRow, resolveAddOns, resolveRoomPercents } from '@/lib/fullServiceRates'
import PricingView from './PricingView'

export const metadata: Metadata = { title: 'Standard & Deep Cleaning Prices — Tydio' }

export default async function FullServicePricingPage({
  searchParams,
}: {
  // service: which tab to open on (the card's Edit / Set prices button).
  // add=1: that service was just ticked on Services Provided; saving its
  // prices adds it to their services.
  searchParams: Promise<{ service?: string; add?: string }>
}) {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const admin = createAdminClient()
  const [{ data: tidyPro, error }, row] = await Promise.all([
    admin.from('tidypro_profiles').select('services_provided').eq('id', session.profileId).single(),
    loadRatesRow(admin, session.profileId),
  ])
  if (error) throw new Error(`Failed to load services: ${error.message}`)

  const services = normalizeServices(tidyPro?.services_provided)
  const params = await searchParams
  const tab = params.service === 'deep' ? 'deep' : 'standard'
  const offersTab = services.includes(tab === 'deep' ? 'deepCleaning' : 'standardCleaning')
  const adding = params.add === '1' && !offersTab ? tab : null
  const num = (v: number | string | null | undefined) => (v == null || v === '' ? null : Number(v))

  return (
    <PricingView
      initialTab={tab}
      adding={adding}
      offers={{
        standard: services.includes('standardCleaning') || adding === 'standard',
        deep: services.includes('deepCleaning') || adding === 'deep',
      }}
      initial={{
        standardBase: num(row?.standard_base_take_home),
        deepBase: num(row?.deep_base_take_home),
        standardRooms: resolveRoomPercents('standard', row?.standard_room_percents),
        deepRooms: resolveRoomPercents('deep', row?.deep_room_percents),
        addOns: resolveAddOns(row?.add_ons),
      }}
    />
  )
}
