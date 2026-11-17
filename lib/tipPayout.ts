import type { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import { grossUpForStripeFee } from '@/lib/pricingRules'
import { stripePercentageForPaymentMethod } from '@/lib/stripe/cardFees'
import { userFacingError } from '@/lib/userFacingError'
import { notifyTipReceived } from '@/lib/notifications'
import { canSendSms, sendSmsForPayload } from '@/lib/sms'
import { sendPushForPayload } from '@/lib/push'
import { sendEmail } from '@/lib/email'
import { tipEmailHtml, tipEmailSubject } from '@/lib/tipEmail'

type Admin = ReturnType<typeof createAdminClient>

export const TIP_METADATA_KIND = 'tip'

export function tipTransferGroup(bookingId: string): string {
  return `${bookingId}-tip`
}

// Sends a booking's tip to the Tidy Pro's Stripe account: 100% of it, out of the tip
// charge itself. The transfer names that charge (source_transaction), so it goes
// through while the charge is still settling; without that Stripe takes it from the
// platform's available balance, which a card charge made a moment ago isn't in yet,
// and the transfer fails while the customer has already paid.
//
// Safe to call again: it does nothing once the tip's transfer exists, and the
// idempotency key stops a double send. So a tip that couldn't go out (the Tidy Pro had
// no payout account yet, or Stripe failed) can be retried later.
export async function payOutTip(
  admin: Admin,
  bookingId: string,
  // The tip charge, when the caller just made it. Otherwise it's looked up by its metadata.
  tipPaymentIntentId?: string
): Promise<{ status: 'sent' | 'already_sent' | 'no_tip' | 'no_payout_account' }> {
  const { data: booking } = await admin.from('bookings').select('id, tidy_pro_id, tip').eq('id', bookingId).maybeSingle()
  if (!booking?.tidy_pro_id || !booking.tip || booking.tip <= 0) return { status: 'no_tip' }

  const { data: tidyPro } = await admin
    .from('tidypro_profiles')
    .select('stripe_account_id, stripe_onboarding_completed')
    .eq('id', booking.tidy_pro_id)
    .maybeSingle()
  if (!tidyPro?.stripe_account_id || !tidyPro.stripe_onboarding_completed) return { status: 'no_payout_account' }

  const group = tipTransferGroup(bookingId)
  const existing = await stripe.transfers.list({ transfer_group: group, limit: 1 })
  if (existing.data.length > 0) return { status: 'already_sent' }

  const intent = tipPaymentIntentId
    ? await stripe.paymentIntents.retrieve(tipPaymentIntentId)
    : (
        await stripe.paymentIntents.search({
          query: `metadata['booking_id']:'${bookingId}' AND metadata['kind']:'${TIP_METADATA_KIND}' AND status:'succeeded'`,
          limit: 1,
        })
      ).data[0]
  if (!intent || intent.status !== 'succeeded') throw new Error('No paid tip charge found for this booking.')
  const charge = typeof intent.latest_charge === 'string' ? intent.latest_charge : intent.latest_charge?.id
  if (!charge) throw new Error('The tip charge has no charge to send it from.')

  await stripe.transfers.create(
    {
      amount: Math.round(booking.tip * 100),
      currency: 'usd',
      destination: tidyPro.stripe_account_id,
      transfer_group: group,
      source_transaction: charge,
      metadata: { booking_id: bookingId, kind: TIP_METADATA_KIND },
    },
    { idempotencyKey: `tip-transfer-${bookingId}` }
  )
  return { status: 'sent' }
}

// One tip attempt from the customer's screen. A new id per attempt (made in the
// browser) lets a double tap reuse the same Stripe request, while trying again after a
// declined card is a fresh request rather than Stripe's saved decline.
export function isValidTipAttemptId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(id)
}

// Charges the customer's booking card for a tip on top of Stripe's fee (so the Tidy Pro
// gets 100% of it), records it on the booking, then sends it to the Tidy Pro. Getting it
// to the Tidy Pro is on Tydio once the customer has paid, so a failed transfer is
// logged for a retry (payOutTip is safe to run again) rather than shown to them.
export async function chargeAndSendTip(
  admin: Admin,
  input: { bookingId: string; customerId: string; tipAmount: number; paymentIntentId: string | null; attemptId: string }
): Promise<{ success: true } | { error: string }> {
  const { bookingId, customerId, tipAmount } = input
  let tipIntentId: string
  try {
    let paymentMethodId: string | undefined
    if (input.paymentIntentId) {
      const originalIntent = await stripe.paymentIntents.retrieve(input.paymentIntentId)
      paymentMethodId = typeof originalIntent.payment_method === 'string' ? originalIntent.payment_method : originalIntent.payment_method?.id
    }
    if (!paymentMethodId) throw new Error('No payment method on file for the original booking.')

    const { data: profile } = await admin.from('profiles').select('stripe_customer_id').eq('id', customerId).single()
    if (!profile?.stripe_customer_id) throw new Error('No Stripe customer on file.')

    const tipChargeAmount = grossUpForStripeFee(tipAmount, await stripePercentageForPaymentMethod(paymentMethodId))
    const intent = await stripe.paymentIntents.create(
      {
        amount: Math.round(tipChargeAmount * 100),
        currency: 'usd',
        customer: profile.stripe_customer_id,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        transfer_group: tipTransferGroup(bookingId),
        metadata: { booking_id: bookingId, kind: TIP_METADATA_KIND },
      },
      { idempotencyKey: `tip-charge-${bookingId}-${input.attemptId}` }
    )
    if (intent.status !== 'succeeded') throw new Error('Your card couldn’t be charged for the tip.')
    tipIntentId = intent.id
  } catch (err) {
    return { error: userFacingError(err, 'Could not charge the tip.') }
  }

  // Recorded as soon as it's paid, so it counts in their earnings even if the transfer
  // has to be retried.
  // tip_seen_by_pro_at is cleared so the Tidy Pro gets the tip pop-up next time they open the app.
  await admin.from('bookings').update({ tip: tipAmount, tip_seen_by_pro_at: null }).eq('id', bookingId)
  await admin.from('reviews').update({ tip_amount: tipAmount }).eq('booking_id', bookingId)
  await payOutTip(admin, bookingId, tipIntentId).catch((err) => console.error('[Tydio] Tip transfer failed:', bookingId, err))
  await notifyTidyProOfTip(admin, bookingId, tipAmount).catch((err) => console.error('[Tydio] Tip notification failed:', bookingId, err))
  return { success: true }
}

// Text (when they've opted in), push, and email (unless they turned emails off) to the
// Tidy Pro that they were tipped.
export async function notifyTidyProOfTip(admin: Admin, bookingId: string, tipAmount: number): Promise<void> {
  const { data: booking } = await admin.from('bookings').select('tidy_pro_id').eq('id', bookingId).maybeSingle()
  if (!booking?.tidy_pro_id) return
  const tidyProId = booking.tidy_pro_id
  const payload = notifyTipReceived(tipAmount, bookingId)
  const [{ data: tidyPro }, { data: account }] = await Promise.all([
    admin.from('tidypro_profiles').select('phone, sms_consent, email_notifications_enabled').eq('id', tidyProId).maybeSingle(),
    admin.from('profiles').select('email, first_name').eq('id', tidyProId).maybeSingle(),
  ])
  if (canSendSms(tidyPro?.sms_consent ?? null, tidyPro?.phone ?? null)) {
    await sendSmsForPayload(tidyPro!.phone!, payload).catch((err) => console.error('Cleaner SMS failed', err))
  }
  await sendPushForPayload(tidyProId, payload).catch((err) => console.error('Cleaner push failed', err))
  if (account?.email && tidyPro?.email_notifications_enabled !== false) {
    await sendEmail({
      to: [{ email: account.email, name: account.first_name ?? undefined }],
      subject: tipEmailSubject(tipAmount),
      htmlContent: tipEmailHtml({ firstName: account.first_name ?? '', amount: tipAmount, bookingId }),
    }).catch((err) => console.error('Cleaner tip email failed', err))
  }
}
