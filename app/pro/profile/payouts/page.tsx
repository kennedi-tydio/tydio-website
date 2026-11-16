import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUnreadMessageCountForTidyPro } from '@/lib/bookings'
import { hasOutstandingPayoutRequirements, refreshPayoutOnboardingStatus, listPayoutMethods, type PayoutMethodSummary } from '@/lib/stripe/connect'
import PayoutMethodView from './PayoutMethodView'

export const metadata: Metadata = { title: 'Payout Methods — Tydio' }

export default async function PayoutMethodPage() {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const admin = createAdminClient()

  const { data: tidyPro } = await admin
    .from('tidypro_profiles')
    .select('stripe_account_id, stripe_onboarding_completed')
    .eq('id', session.profileId)
    .maybeSingle()

  const unreadMessageCount = await getUnreadMessageCountForTidyPro(admin, session.profileId)

  // Stripe's hosted onboarding returns the Tidy Pro here whether or not they
  // actually finished — re-check the account directly against Stripe rather
  // than trusting a stale local flag. The webhook (see app/api/webhooks/
  // stripe-connect) keeps this in sync the rest of the time; this is the
  // same-session fallback for the moment they land back here.
  let hasPayoutMethod = tidyPro?.stripe_onboarding_completed ?? false
  if (!hasPayoutMethod && tidyPro?.stripe_account_id) {
    hasPayoutMethod = await refreshPayoutOnboardingStatus(session.profileId, tidyPro.stripe_account_id).catch(() => false)
  }

  // List whatever is on the account even before Stripe finishes verifying it,
  // so a bank account they just added shows up right away.
  let payoutMethods: PayoutMethodSummary[] = []
  let needsMoreInfo = false
  if (tidyPro?.stripe_account_id) {
    ;[payoutMethods, needsMoreInfo] = await Promise.all([
      listPayoutMethods(tidyPro.stripe_account_id).catch(() => []),
      hasPayoutMethod
        ? hasOutstandingPayoutRequirements(tidyPro.stripe_account_id).catch(() => false)
        : Promise.resolve(false),
    ])
  }

  return (
    <PayoutMethodView
      hasPayoutMethod={hasPayoutMethod}
      payoutMethods={payoutMethods}
      needsMoreInfo={needsMoreInfo}
      unreadMessageCount={unreadMessageCount}
    />
  )
}
