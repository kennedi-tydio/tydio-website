import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { backgroundCheckChargeCents } from '@/lib/backgroundCheckFee'
import { ICA_CONSENT_TEXT, ICA_TITLE, hasSignedCurrentAgreement, safeReturnPath } from '@/lib/legal/contractorAgreement'
import { signedDate } from '@/lib/legal/signAgreement'
import AgreementsView from './AgreementsView'

export const metadata: Metadata = { title: 'Agreements & Disclosures — Tydio' }

// New cleaners come here from the welcome screen. Cleaners who already use the app are
// sent here with ?next= whenever a new agreement version needs signing, and go back
// there once they've signed.
export default async function OnboardingAgreementsPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const { next } = await searchParams
  const returnTo = safeReturnPath(next)

  const admin = createAdminClient()
  if (await hasSignedCurrentAgreement(admin, session.profileId)) redirect(returnTo ?? '/pro/onboarding')

  const [{ data: profile }, { data: tidyPro }] = await Promise.all([
    admin.from('profiles').select('email, first_name, last_name').eq('id', session.profileId).maybeSingle(),
    admin.from('tidypro_profiles').select('time_zone').eq('id', session.profileId).maybeSingle(),
  ])
  if (!profile) redirect('/account-removed')

  return (
    <AgreementsView
      feeCents={backgroundCheckChargeCents()}
      agreementTitle={ICA_TITLE}
      consentText={ICA_CONSENT_TEXT}
      email={profile.email}
      defaultName={[profile.first_name, profile.last_name].filter(Boolean).join(' ')}
      next={returnTo}
      signedToday={signedDate(new Date(), tidyPro?.time_zone ?? null)}
    />
  )
}
