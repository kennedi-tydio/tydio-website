import { stripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'

// Server-side only — never import in client components.
// Returns the Stripe Customer id for a profile, creating one on first use.
export async function getOrCreateStripeCustomerId(profileId: string): Promise<string> {
  const admin = createAdminClient()

  const { data: profile, error } = await admin
    .from('profiles')
    .select('stripe_customer_id, email, first_name, last_name')
    .eq('id', profileId)
    .single()

  if (error || !profile) throw new Error(error?.message ?? 'Profile not found')
  if (profile.stripe_customer_id) return profile.stripe_customer_id

  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || undefined

  const customer = await stripe.customers.create({
    email: profile.email,
    name,
    metadata: { profile_id: profileId },
  })

  const { error: updateError } = await admin
    .from('profiles')
    .update({ stripe_customer_id: customer.id })
    .eq('id', profileId)

  if (updateError) throw new Error(updateError.message)

  return customer.id
}
