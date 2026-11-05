import { stripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { retryPayoutsForTidyPro } from '@/lib/bookings'

// Server-side only — never import in client components.
//
// Tidy Pros only ever RECEIVE money (a transfer of their 80% share on job
// completion, plus tips) — they never accept card payments directly — so
// this uses the `recipient` Account configuration (the `stripe_transfers`
// capability), not `merchant`.
//
// `dashboard: 'full'` with Stripe as fees/losses collector (the Standard-
// equivalent setup) is NOT a legal combination for a recipient-only
// account — Stripe rejects it outright (confirmed against the live API):
// recipient-only accounts are restricted to `dashboard: 'none'` or
// `'express'`, and must have the platform (not Stripe) as fees/losses
// collector, since they never process a charge for Stripe to hold them
// liable on. `express` is the right choice here — it gives each Tidy Pro
// their own simplified Stripe dashboard to view payouts and manage their
// bank details, which is exactly the gig-marketplace use case Express is
// designed for, without the platform having to build that UI itself.
export async function getOrCreateConnectedAccountId(profileId: string): Promise<string> {
  const admin = createAdminClient()

  const { data: tidyPro, error } = await admin
    .from('tidypro_profiles')
    .select('stripe_account_id')
    .eq('id', profileId)
    .single()

  if (error || !tidyPro) throw new Error(error?.message ?? 'Tidy Pro profile not found')
  if (tidyPro.stripe_account_id) return tidyPro.stripe_account_id

  const { data: profile } = await admin
    .from('profiles')
    .select('email, first_name, last_name')
    .eq('id', profileId)
    .single()

  if (!profile) throw new Error('Profile not found')

  const displayName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || undefined

  const account = await stripe.v2.core.accounts.create({
    contact_email: profile.email,
    display_name: displayName,
    dashboard: 'express',
    identity: { country: 'us' },
    configuration: {
      recipient: {
        capabilities: {
          stripe_balance: { stripe_transfers: { requested: true } },
        },
      },
    },
    defaults: {
      currency: 'usd',
      responsibilities: { fees_collector: 'application', losses_collector: 'application' },
      profile: {
        product_description:
          'Provides on-demand residential cleaning and small household cleaning tasks booked through the Tydio marketplace.',
      },
    },
  })

  const { error: updateError } = await admin
    .from('tidypro_profiles')
    .update({ stripe_account_id: account.id })
    .eq('id', profileId)

  if (updateError) throw new Error(updateError.message)

  return account.id
}

// Stripe-hosted onboarding, per the platform's security guidance — this
// keeps sensitive identity/bank collection entirely on Stripe's side rather
// than building a custom form for it.
//
// By default Stripe only asks for what's due right now and leaves the rest
// (date of birth, for one) until payout volume crosses a threshold, when
// payouts pause until it's provided. Collecting eventually-due and future
// requirements up front means a cleaner gives everything once, at setup.
export async function createPayoutOnboardingLink(accountId: string, returnUrl: string, refreshUrl: string): Promise<string> {
  const link = await stripe.v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: 'account_onboarding',
      account_onboarding: {
        configurations: ['recipient'],
        return_url: returnUrl,
        refresh_url: refreshUrl,
        collection_options: { fields: 'eventually_due', future_requirements: 'include' },
      },
    },
  })
  return link.url
}

// Whether Stripe is still waiting on the cleaner for anything, now or later,
// such as a date of birth that a cleaner who onboarded before it was
// collected up front never gave. The payouts page offers onboarding again so
// they can finish before their payouts are paused.
export async function hasOutstandingPayoutRequirements(accountId: string): Promise<boolean> {
  const account = await stripe.v2.core.accounts.retrieve(accountId, {
    include: ['requirements', 'future_requirements'],
  })
  const entries = [...(account.requirements?.entries ?? []), ...(account.future_requirements?.entries ?? [])]
  return entries.some((entry) => entry.awaiting_action_from === 'user')
}

export type PayoutMethodSummary = {
  id: string
  kind: 'bank_account' | 'card'
  label: string
  last4: string
  isDefault: boolean
}

// External accounts (bank accounts/debit cards) still live on the v1
// Accounts API even for a v2-created Account — there's no v2 equivalent yet,
// and v1 endpoints accept v2 account ids directly (per Stripe's own docs).
export async function listPayoutMethods(accountId: string): Promise<PayoutMethodSummary[]> {
  const externalAccounts = await stripe.accounts.listExternalAccounts(accountId, { limit: 10 })

  return externalAccounts.data.map((ea) => {
    if (ea.object === 'bank_account') {
      return {
        id: ea.id,
        kind: 'bank_account' as const,
        label: ea.bank_name ?? 'Bank account',
        last4: ea.last4,
        isDefault: !!ea.default_for_currency,
      }
    }
    return {
      id: ea.id,
      kind: 'card' as const,
      label: ea.brand,
      last4: ea.last4,
      isDefault: !!ea.default_for_currency,
    }
  })
}

// Express accounts manage their own bank accounts/cards through Stripe's
// hosted Express Dashboard rather than through our UI — the same
// hosted-flow principle as onboarding itself, so we never have to touch raw
// bank account or card numbers. This link is what "Add another payout
// method" sends the Tidy Pro to.
export async function createExpressDashboardLoginLink(accountId: string): Promise<string> {
  const link = await stripe.accounts.createLoginLink(accountId)
  return link.url
}

// Re-checks a connected account's status directly against Stripe and flips
// `stripe_onboarding_completed` once the transfers capability is active.
// Called both when the Tidy Pro lands back on the payouts page, and by the
// webhook handler when Stripe notifies us the capability changed.
export async function refreshPayoutOnboardingStatus(profileId: string, accountId: string): Promise<boolean> {
  const account = await stripe.v2.core.accounts.retrieve(accountId, {
    include: ['configuration.recipient'],
  })

  const completed = account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status === 'active'

  const admin = createAdminClient()
  await admin.from('tidypro_profiles').update({ stripe_onboarding_completed: completed }).eq('id', profileId)

  // Any booking pay held back while onboarding was unfinished goes out now.
  if (completed) await retryPayoutsForTidyPro(admin, profileId).catch(() => {})

  return completed
}

// Same as above, but looked up by Stripe account id rather than internal
// profile id — the webhook only knows the account id.
export async function refreshPayoutOnboardingStatusByAccountId(accountId: string): Promise<void> {
  const admin = createAdminClient()
  const { data: tidyPro } = await admin
    .from('tidypro_profiles')
    .select('id')
    .eq('stripe_account_id', accountId)
    .maybeSingle()

  if (!tidyPro) return
  await refreshPayoutOnboardingStatus(tidyPro.id, accountId)
}

// The event type fired specifically when a recipient account's payout-
// relevant capability (stripe_transfers) changes status — exactly the signal
// needed to know onboarding just completed (or was later restricted).
export const PAYOUT_CAPABILITY_EVENT_TYPE = 'v2.core.account[configuration.recipient].capability_status_updated' as const

// One-time setup: registers a webhook Event Destination for the above event
// type, if one pointing at this URL doesn't already exist. v2 Accounts emit
// "thin events" through Event Destinations rather than classic v1 webhooks,
// so this is a separate registration step from the account/link creation
// above. Returns the signing secret (only available at creation time) so it
// can be saved as STRIPE_CONNECT_WEBHOOK_SECRET.
export async function ensureAccountEventDestination(
  webhookUrl: string
): Promise<{ created: boolean; signingSecret?: string }> {
  const existing = await stripe.v2.core.eventDestinations.list({ include: ['webhook_endpoint.url'] })
  const alreadyExists = existing.data.some((d) => d.type === 'webhook_endpoint' && d.webhook_endpoint?.url === webhookUrl)
  if (alreadyExists) return { created: false }

  const destination = await stripe.v2.core.eventDestinations.create({
    name: 'Tydio payouts webhook',
    type: 'webhook_endpoint',
    event_payload: 'thin',
    events_from: ['@self'],
    enabled_events: [PAYOUT_CAPABILITY_EVENT_TYPE],
    webhook_endpoint: { url: webhookUrl },
    include: ['webhook_endpoint.signing_secret'],
  })

  return { created: true, signingSecret: destination.webhook_endpoint?.signing_secret }
}
