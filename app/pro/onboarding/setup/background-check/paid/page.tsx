import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import { hasPaidFee } from '@/lib/backgroundCheckFee'
import { recordFeePaymentIfPaid } from '@/lib/stripe/backgroundCheckFee'

// Where Stripe Checkout returns a cleaner to after paying. Has no UI of its own: it
// confirms the payment with Stripe, which queues them to be sent their form, then
// shows them the next step. Trusts only the session id stored against this cleaner,
// never anything in the URL, so visiting this page can't stand in for paying.
export default async function BackgroundCheckPaidPage() {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const admin = createAdminClient()
  const { data: check } = await admin
    .from('background_checks')
    .select('fee_paid_at, fee_refunded_at, stripe_checkout_session_id')
    .eq('pro_id', session.profileId)
    .maybeSingle()

  if (!hasPaidFee(check) && check?.stripe_checkout_session_id) {
    const checkout = await stripe.checkout.sessions.retrieve(check.stripe_checkout_session_id)
    await recordFeePaymentIfPaid(admin, checkout)
  }

  redirect('/pro/onboarding/setup/background-check')
}
