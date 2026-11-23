import type { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import { emailShell, escapeHtml, sendEmail } from '@/lib/email'
import { completeBookingPayout } from '@/lib/bookings'
import { refundBookingTotal, validateCustomRefund, type AdminRefund } from '@/lib/bookingRequestGroups'
import { adminCleanerPay, type AdminPayoutChoice } from '@/lib/payoutHold'
import { userFacingError } from '@/lib/userFacingError'

type Admin = ReturnType<typeof createAdminClient>

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

export type CompletedRefundInput = {
  refund: AdminRefund
  customRefund?: number | null
  payout: AdminPayoutChoice
  customPayout?: number | null
  // Emailed to the customer and the Tidy Pro.
  note?: string | null
}

export type CompletedRefundResult =
  | { success: true; refunded: number | null; cleanerPay: number; warning?: string }
  | { error: string }

// The admin refunding a booking the Tidy Pro already completed (a customer escalated),
// and setting what the Tidy Pro is paid for it. Done once per booking: anything after
// that is for Stripe's dashboard.
//
// If the payout is on hold (lib/payoutHold) or otherwise hasn't gone out, the new pay is
// simply what's sent, straight away, and the hold comes off. If it has already gone to the
// Tidy Pro's Stripe account, the part the admin took off is reversed from it: all of it
// for No payout, e.g. a Tidy Pro who marked complete a job they never did. Tips are their
// own charges and transfers, so they're left alone.
//
// The refund comes first and is keyed to the payment, so a retry after a failure never
// refunds twice; then payout_adjusted_at is claimed so only one adjustment ever lands.
export async function refundCompletedBooking(admin: Admin, bookingId: string, input: CompletedRefundInput): Promise<CompletedRefundResult> {
  const { data: booking } = await admin
    .from('bookings')
    .select('id, user_id, tidy_pro_id, status, cleaner_pay, stripe_payment_intent_id, stripe_refund_id, payout_adjusted_at, total_customer_charge, scheduled_date')
    .eq('id', bookingId)
    .maybeSingle()
  if (!booking) return { error: 'Booking not found.' }
  if (booking.status !== 'completed') return { error: 'Only a completed booking can be refunded here.' }
  if (booking.payout_adjusted_at || booking.stripe_refund_id) {
    return { error: 'This booking has already been refunded or had its payout changed. Make any further change in Stripe.' }
  }

  const refund = booking.stripe_payment_intent_id ? input.refund : 'none'
  if (refund === 'custom') {
    const invalid = validateCustomRefund(input.customRefund, booking.total_customer_charge)
    if (invalid) return { error: invalid }
  }

  const currentPay = Number(booking.cleaner_pay ?? 0)
  const payResult = booking.tidy_pro_id ? adminCleanerPay(input.payout, currentPay, input.customPayout ?? null) : { pay: 0 }
  if ('error' in payResult) return { error: payResult.error }
  const newPay = payResult.pay
  if (refund === 'none' && Math.round(newPay * 100) === Math.round(currentPay * 100)) {
    return { error: 'Choose a refund or a different payout: this would change nothing.' }
  }

  let refundId: string | null = null
  let refunded: number | null = 0
  if (refund !== 'none') {
    try {
      const result = await refundBookingTotal(admin, booking, refund === 'custom' ? { custom: input.customRefund! } : refund)
      refundId = result.refundId
      refunded = result.refunded
    } catch (err) {
      return { error: userFacingError(err, 'Failed to refund this booking.') }
    }
  }

  const { data: claimed, error: claimError } = await admin
    .from('bookings')
    .update({
      payout_adjusted_at: new Date().toISOString(),
      cleaner_pay: newPay,
      payout_held_at: null,
      payout_hold_note: null,
      ...(refundId ? { stripe_refund_id: refundId } : {}),
    })
    .eq('id', bookingId)
    .is('payout_adjusted_at', null)
    .select('id')
  if (claimError || !claimed?.length) {
    const refundedText = refund !== 'none' ? ' The customer’s refund did go through.' : ''
    return { error: `The payout couldn’t be saved: ${claimError ? userFacingError(claimError) : 'it was just changed by someone else'}.${refundedText} Please refresh.` }
  }

  const warning = await settlePayout(admin, bookingId, newPay)
  await emailRefundOutcome(admin, booking, refund !== 'none' ? refunded : 0, currentPay, newPay, input.note ?? null)

  return { success: true, refunded, cleanerPay: newPay, ...(warning ? { warning } : {}) }
}

// Gets the Tidy Pro's Stripe account to the new pay. Returns a warning for the admin when
// it can't be done automatically.
async function settlePayout(admin: Admin, bookingId: string, newPay: number): Promise<string | undefined> {
  const newCents = Math.round(newPay * 100)
  const { data: row } = await admin.from('bookings').select('stripe_transfer_id').eq('id', bookingId).maybeSingle()
  let transferId = row?.stripe_transfer_id ?? null
  try {
    if (!transferId) transferId = (await stripe.transfers.list({ transfer_group: bookingId, limit: 1 })).data[0]?.id ?? null
  } catch (err) {
    return `Couldn't check Stripe for an earlier payout (${userFacingError(err)}). Check the Tidy Pro's transfers in Stripe before anything else is sent.`
  }

  if (!transferId) {
    if (newCents <= 0) return undefined
    const payout = await completeBookingPayout(admin, bookingId).catch((err) => ({ error: String(err) }))
    return 'error' in payout ? `The payout transfer failed and will be retried: ${payout.error}.` : undefined
  }

  // Already paid: take back what's over the new pay.
  try {
    const transfer = await stripe.transfers.retrieve(transferId)
    const overpaid = transfer.amount - transfer.amount_reversed - newCents
    if (overpaid <= 0) {
      await admin.from('bookings').update({ stripe_transfer_id: transferId }).eq('id', bookingId)
      return undefined
    }
    const reversal = await stripe.transfers.createReversal(
      transferId,
      { amount: overpaid, metadata: { booking_id: bookingId, kind: 'admin_payout_adjustment' } },
      { idempotencyKey: `payout-adjustment-${bookingId}` }
    )
    await admin.from('bookings').update({ stripe_transfer_id: transferId, stripe_transfer_reversal_id: reversal.id }).eq('id', bookingId)
    return undefined
  } catch (err) {
    return `The payout had already been sent, and taking back the difference failed: ${userFacingError(err)}. Reverse transfer ${transferId} in Stripe by hand.`
  }
}

// Sent whatever their notification settings, since it's about their money.
async function emailRefundOutcome(
  admin: Admin,
  booking: { id: string; user_id: string; tidy_pro_id: string | null; scheduled_date: string | null },
  refunded: number | null,
  oldPay: number,
  newPay: number,
  note: string | null
): Promise<void> {
  const [{ data: customer }, { data: cleaner }] = await Promise.all([
    admin.from('profiles').select('email, first_name').eq('id', booking.user_id).maybeSingle(),
    booking.tidy_pro_id ? admin.from('profiles').select('email, first_name').eq('id', booking.tidy_pro_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const when = booking.scheduled_date ? ` on ${booking.scheduled_date}` : ''
  const p = 'margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;'
  const body = (name: string | null, paragraphs: string[]) =>
    emailShell(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">Hi ${escapeHtml(name ?? 'there')},</h2>
      ${paragraphs.map((t) => `<p style="${p}">${escapeHtml(t)}</p>`).join('')}
      ${note ? `<p style="${p}"><strong>From the Tydio team:</strong> ${escapeHtml(note)}</p>` : ''}
      <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">Questions? Just reply to this email.</p>
    `)

  if (customer?.email && refunded !== 0) {
    const amount = refunded != null ? ` of ${money(refunded)}` : ''
    await sendEmail({
      to: [{ email: customer.email, name: customer.first_name ?? undefined }],
      subject: refunded != null ? `Your refund of ${money(refunded)}` : 'Your Tydio refund',
      htmlContent: body(customer.first_name, [
        `We've reviewed your booking${when} and issued a refund${amount} to your original payment method.`,
        'It may take 5 to 10 business days to appear on your statement.',
      ]),
    }).catch((err) => console.error('Completed booking refund email failed', booking.id, err))
  }

  if (cleaner?.email && Math.round(newPay * 100) !== Math.round(oldPay * 100)) {
    await sendEmail({
      to: [{ email: cleaner.email, name: cleaner.first_name ?? undefined }],
      subject: newPay > 0 ? `Your payout for this booking is now ${money(newPay)}` : 'An update on your payout',
      htmlContent: body(cleaner.first_name, [
        `After the customer raised a concern, we've reviewed the booking${when}.`,
        newPay > 0
          ? `Your payout for it is now ${money(newPay)} (it was ${money(oldPay)}), sent to your payout account.`
          : `You won't be paid for this booking (it was ${money(oldPay)}).`,
      ]),
    }).catch((err) => console.error('Payout adjustment email failed', booking.id, err))
  }
}
