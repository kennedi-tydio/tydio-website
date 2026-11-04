import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import InsuranceView from './InsuranceView'

export const metadata: Metadata = { title: 'Insurance — Tydio' }

export default async function ProInsurancePage() {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const admin = createAdminClient()
  const { data: tidyPro } = await admin
    .from('tidypro_profiles')
    .select('insurance_status, insurance_denial_reason')
    .eq('id', session.profileId)
    .maybeSingle()

  return (
    <InsuranceView
      status={tidyPro?.insurance_status ?? null}
      denialReason={tidyPro?.insurance_denial_reason ?? null}
      nextInsuranceUrl={process.env.NEXT_PUBLIC_NEXT_INSURANCE_AFFILIATE_URL ?? 'https://www.nextinsurance.com/'}
    />
  )
}
