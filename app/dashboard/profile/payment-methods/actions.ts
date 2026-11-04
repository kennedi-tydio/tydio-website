'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import { getOrCreateStripeCustomerId } from '@/lib/stripe/customer'
import type Stripe from 'stripe'
import { userFacingError } from '@/lib/userFacingError'

export interface SavedPaymentMethod {
  id: string
  brand: string
  last4: string
  exp_month: number
  exp_year: number
  is_default: boolean
}

function brandLabel(brand: string): string {
  switch (brand) {
    case 'visa':
      return 'Visa'
    case 'mastercard':
      return 'Mastercard'
    case 'amex':
      return 'Amex'
    case 'discover':
      return 'Discover'
    default:
      return brand.charAt(0).toUpperCase() + brand.slice(1)
  }
}

// Creates a SetupIntent so the client can collect and save a card via the
// Stripe Payment Element — the card number never passes through our server.
export async function createSetupIntentAction(): Promise<{ clientSecret: string } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const customerId = await getOrCreateStripeCustomerId(session.profileId)

  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    usage: 'off_session',
    // This UI only ever collects reusable cards (brand/last4/expiry) and has
    // no return_url to come back to, so redirect-based methods are excluded
    // — otherwise Stripe requires a return_url at confirm time for any
    // Dashboard-enabled method that might redirect the customer off-page.
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
  })

  if (!setupIntent.client_secret) return { error: 'Could not start card setup.' }
  return { clientSecret: setupIntent.client_secret }
}

// Called after the client confirms the SetupIntent with Stripe.js. Re-reads
// the SetupIntent from Stripe (never trusts client-supplied card details) and
// persists the resulting PaymentMethod's display metadata.
export async function savePaymentMethodAction(
  setupIntentId: string
): Promise<SavedPaymentMethod | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', session.profileId)
    .single()

  if (!profile?.stripe_customer_id) return { error: 'No Stripe customer on file.' }

  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId)

  if (setupIntent.customer !== profile.stripe_customer_id) return { error: 'Not authorized' }
  if (setupIntent.status !== 'succeeded' || !setupIntent.payment_method) {
    return { error: 'Card setup did not complete.' }
  }

  const paymentMethodId =
    typeof setupIntent.payment_method === 'string' ? setupIntent.payment_method : setupIntent.payment_method.id

  const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId)
  const card = paymentMethod.card as Stripe.PaymentMethod.Card | undefined
  if (!card) return { error: 'Only card payment methods are supported.' }

  const { count } = await admin
    .from('payment_methods')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', session.profileId)

  const { data, error } = await admin
    .from('payment_methods')
    .insert({
      user_id: session.profileId,
      stripe_payment_method_id: paymentMethod.id,
      card_brand: brandLabel(card.brand),
      card_last4: card.last4,
      card_exp_month: card.exp_month,
      card_exp_year: card.exp_year,
      is_default: (count ?? 0) === 0,
    })
    .select('id, brand:card_brand, last4:card_last4, exp_month:card_exp_month, exp_year:card_exp_year, is_default')
    .single()

  if (error || !data) return { error: userFacingError(error, 'Failed to save payment method.') }

  revalidatePath('/dashboard/profile/payment-methods')
  return data
}

export async function removePaymentMethodAction(
  paymentMethodId: string
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const admin = createAdminClient()

  const { data: pm } = await admin
    .from('payment_methods')
    .select('id, stripe_payment_method_id, is_default')
    .eq('id', paymentMethodId)
    .eq('user_id', session.profileId)
    .single()

  if (!pm) return { error: 'Payment method not found.' }

  if (pm.stripe_payment_method_id) {
    // Best-effort — if it's already detached on Stripe's side (stale state,
    // double-click) that shouldn't block removing it from the saved list.
    try {
      await stripe.paymentMethods.detach(pm.stripe_payment_method_id)
    } catch {}
  }

  const { error } = await admin.from('payment_methods').delete().eq('id', pm.id)
  if (error) return { error: userFacingError(error) }

  if (pm.is_default) {
    const { data: next } = await admin
      .from('payment_methods')
      .select('id')
      .eq('user_id', session.profileId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (next) {
      await admin.from('payment_methods').update({ is_default: true }).eq('id', next.id)
    }
  }

  revalidatePath('/dashboard/profile/payment-methods')
  return { success: true }
}

export async function selectPaymentMethodForDraftAction(
  draftId: string,
  paymentMethodId: string
): Promise<{ error: string } | { success: true }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('booking_drafts')
    .update({ selected_payment_method_id: paymentMethodId })
    .eq('id', draftId)
    .eq('customer_user_id', session.profileId)

  if (error) return { error: userFacingError(error) }

  revalidatePath('/book/review')
  return { success: true }
}
