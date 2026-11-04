'use server'

import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrCreateConnectedAccountId, createPayoutOnboardingLink, createExpressDashboardLoginLink } from '@/lib/stripe/connect'
import { userFacingError } from '@/lib/userFacingError'

export async function startPayoutSetupAction(): Promise<{ url: string } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const returnUrl = `${siteUrl}/pro/profile/payouts`
  const refreshUrl = `${siteUrl}/pro/profile/payouts`

  try {
    const accountId = await getOrCreateConnectedAccountId(session.profileId)
    const url = await createPayoutOnboardingLink(accountId, returnUrl, refreshUrl)
    return { url }
  } catch (err) {
    return { error: userFacingError(err, 'Could not start payout setup.') }
  }
}

// "Add another payout method" — once onboarding is complete, adding/managing
// bank accounts and cards happens on Stripe's own Express Dashboard, not in
// this app (see lib/stripe/connect.ts for why).
export async function getPayoutDashboardLinkAction(): Promise<{ url: string } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const admin = createAdminClient()
  const { data: tidyPro } = await admin
    .from('tidypro_profiles')
    .select('stripe_account_id')
    .eq('id', session.profileId)
    .maybeSingle()

  if (!tidyPro?.stripe_account_id) return { error: 'Set up your payout method first.' }

  try {
    const url = await createExpressDashboardLoginLink(tidyPro.stripe_account_id)
    return { url }
  } catch (err) {
    return { error: userFacingError(err, 'Could not open your Stripe dashboard.') }
  }
}
