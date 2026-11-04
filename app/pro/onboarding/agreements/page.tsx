import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { backgroundCheckChargeCents } from '@/lib/backgroundCheckFee'
import AgreementsView from './AgreementsView'

export const metadata: Metadata = { title: 'Agreements & Disclosures — Tydio' }

export default async function OnboardingAgreementsPage() {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const admin = createAdminClient()
  const { data: tidyPro } = await admin
    .from('tidypro_profiles')
    .select('terms_accepted')
    .eq('id', session.profileId)
    .maybeSingle()

  if (tidyPro?.terms_accepted) redirect('/pro/onboarding')

  return <AgreementsView feeCents={backgroundCheckChargeCents()} />
}
