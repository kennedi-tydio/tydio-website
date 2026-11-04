'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type Stripe from 'stripe'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import { backgroundCheckStage } from '@/lib/backgroundCheck'
import { backgroundCheckChargeCents, feeAcceptanceError } from '@/lib/backgroundCheckFee'
import { createFeeCheckoutSession, recordFeePaymentIfPaid } from '@/lib/stripe/backgroundCheckFee'
import { clientIp } from '@/lib/rateLimit'
import { normalizeAddress, normalizeOptionalField, normalizeSignedName, safeReturnPath } from '@/lib/legal/contractorAgreement'
import { emailSignedAgreement, signCurrentAgreement } from '@/lib/legal/agreementSigning'

async function requireTidyProSession() {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')
  return session
}

// The cleaner's electronic signature on the Independent Contractor Agreement: the
// Provider fields they typed, the checked box, and pressing Agree and Continue. A
// failed email doesn't undo the signature; the admin can resend it.
export async function acceptAgreementsAction(formData: FormData): Promise<{ error: string } | void> {
  const session = await requireTidyProSession()

  if (formData.get('agreed') !== 'on') return { error: 'Check the box to sign the agreement.' }
  const signedName = normalizeSignedName(formData.get('legal_name'))
  if (!signedName) return { error: 'Enter your full legal name as your signature.' }
  const address = normalizeAddress(formData.get('address'))
  if (!address) return { error: 'Enter your full street address, city, state, and ZIP code.' }
  const businessEntity = normalizeOptionalField(formData.get('business_entity'))
  const authorizedRepresentative = normalizeOptionalField(formData.get('authorized_representative'))
  if (businessEntity === false || authorizedRepresentative === false) {
    return { error: 'Check the business entity and authorized representative fields.' }
  }

  const admin = createAdminClient()
  const h = await headers()
  const result = await signCurrentAgreement(
    admin,
    session.profileId,
    { signedName, businessEntity, authorizedRepresentative, address },
    { ipAddress: await clientIp(), userAgent: h.get('user-agent')?.slice(0, 500) ?? null }
  )
  if ('error' in result) return result

  if (!result.alreadySigned) {
    const emailed = await emailSignedAgreement(admin, result.signatureId)
    if ('error' in emailed) console.error(`Signed agreement ${result.signatureId} not emailed:`, emailed.error)
  }

  await admin
    .from('tidypro_profiles')
    .update({ terms_accepted: true, terms_accepted_at: new Date().toISOString() })
    .eq('id', session.profileId)

  redirect(safeReturnPath(formData.get('next')) ?? '/pro/onboarding/setup')
}

// Sends the cleaner to Stripe Checkout. Paying queues them for the admin, who is
// emailed to send their form. A session they've already opened or paid is picked up
// rather than starting a new one, so tapping again can't charge them twice.
export async function startBackgroundCheckAction(input: {
  acceptedFeeTerms: boolean
  displayedFeeCents: number | null
}): Promise<{ redirectUrl: string } | { queued: true } | { error: string }> {
  const session = await requireTidyProSession()

  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('background_checks')
    .select('status, requested_at, link_sent_at, submitted_at, stripe_checkout_session_id')
    .eq('pro_id', session.profileId)
    .maybeSingle()

  if (backgroundCheckStage(existing) !== 'not_started') return { queued: true }

  try {
    const previousCheckout = existing?.stripe_checkout_session_id
      ? await stripe.checkout.sessions.retrieve(existing.stripe_checkout_session_id)
      : null

    if (previousCheckout) {
      if (await recordFeePaymentIfPaid(admin, previousCheckout)) return { queued: true }
      if (previousCheckout.status === 'complete') {
        return { error: "Your payment is still processing. You'll be able to continue once it clears." }
      }
    }

    const chargeCents = backgroundCheckChargeCents()
    if (chargeCents == null) {
      return { error: 'Background checks are not available right now. Please try again later.' }
    }

    const acceptanceError = feeAcceptanceError(input, chargeCents)
    if (acceptanceError) return { error: acceptanceError }

    // Reused only at the amount this cleaner just agreed to. Otherwise it's
    // expired, so a stale price can't be paid from an old tab.
    let checkout: Stripe.Checkout.Session
    if (previousCheckout?.status === 'open' && previousCheckout.amount_total === chargeCents) {
      checkout = previousCheckout
    } else {
      if (previousCheckout?.status === 'open') await stripe.checkout.sessions.expire(previousCheckout.id)
      checkout = await createFeeCheckoutSession(session.profileId, chargeCents)
    }
    if (!checkout.url) throw new Error('Stripe did not return a Checkout URL')

    // Saved before they leave for Stripe, so a payment can always be matched
    // back to them, and to the terms they accepted, even if they never return.
    const { error } = await admin.from('background_checks').upsert(
      {
        pro_id: session.profileId,
        provider: 'checkr',
        status: 'pending',
        stripe_checkout_session_id: checkout.id,
        fee_terms_accepted_at: new Date().toISOString(),
        fee_terms_amount_cents: chargeCents,
      },
      { onConflict: 'pro_id' }
    )
    if (error) throw new Error(error.message)

    return { redirectUrl: checkout.url }
  } catch (err) {
    console.error('Failed to start background check', err)
    return { error: 'Something went wrong starting your background check. Please try again.' }
  }
}

export async function acknowledgeVerifiedAction(): Promise<void> {
  const session = await requireTidyProSession()
  const admin = createAdminClient()

  await admin
    .from('tidypro_profiles')
    .update({ verified_ack_at: new Date().toISOString() })
    .eq('id', session.profileId)

  redirect('/pro/dashboard')
}
