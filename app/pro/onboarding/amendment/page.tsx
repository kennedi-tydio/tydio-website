import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { safeReturnPath } from '@/lib/legal/contractorAgreement'
import { pendingAmendment } from '@/lib/legal/agreementAmendments'
import { signedDate } from '@/lib/legal/signAgreement'
import AmendmentView from './AmendmentView'

export const metadata: Metadata = { title: 'Agreement Amendment — Tydio' }

// Tidy Pros named in an amendment to their contractor agreement are sent here (with
// ?next=) the next time they open the app, and go back once they've signed.
export default async function AmendmentPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const returnTo = safeReturnPath((await searchParams).next) ?? '/pro/dashboard'
  const admin = createAdminClient()
  const amendment = await pendingAmendment(admin, session.profileId)
  if (!amendment) redirect(returnTo)

  const { data: tidyPro } = await admin.from('tidypro_profiles').select('time_zone').eq('id', session.profileId).maybeSingle()

  return (
    <AmendmentView
      title={amendment.title}
      consentText={amendment.consentText}
      defaultName={amendment.signers[session.profileId].legalName}
      next={returnTo}
      signedToday={signedDate(new Date(), tidyPro?.time_zone ?? null)}
    />
  )
}
