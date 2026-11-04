import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import type { createAdminClient } from '@/lib/supabase/admin'
import { TYDIO_ADMIN_EMAIL, emailShell, escapeHtml, sendEmail } from '@/lib/email'
import { detailSection, formatInZone, loadBookingIncident, sendAdminEscalation } from '@/lib/bookingIncidentEmail'
import { BACKGROUND_CHECK_FEE_KIND } from '@/lib/backgroundCheckFee'

type Admin = ReturnType<typeof createAdminClient>

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

// What the disputed charge was for. A booking's own charge is found by its
// payment id; tips and the background check fee are separate charges that only
// say what they belong to in their metadata.
async function disputedPayment(admin: Admin, paymentIntentId: string | null) {
  if (!paymentIntentId) return { kind: 'unknown' as const, bookingId: null, userId: null }

  const { data: booking } = await admin
    .from('bookings')
    .select('id, user_id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (booking) return { kind: 'booking' as const, bookingId: booking.id, userId: booking.user_id }

  const { metadata } = await stripe.paymentIntents.retrieve(paymentIntentId)
  if (metadata.kind === 'tip' && metadata.booking_id) {
    const { data: tipped } = await admin.from('bookings').select('id, user_id').eq('id', metadata.booking_id).maybeSingle()
    return { kind: 'tip' as const, bookingId: tipped?.id ?? null, userId: tipped?.user_id ?? null }
  }
  if (metadata.kind === BACKGROUND_CHECK_FEE_KIND) {
    return { kind: 'background_check_fee' as const, bookingId: null, userId: metadata.pro_id ?? null }
  }
  return { kind: 'unknown' as const, bookingId: null, userId: metadata.profile_id ?? null }
}

const KIND_LABELS = {
  booking: 'Booking charge',
  tip: 'Tip',
  background_check_fee: 'Background check fee',
  unknown: 'Unknown charge',
}

// A customer disputed a charge with their bank. Saved as a chargeback risk event and
// emailed to the admin with the respond-by date, since an unanswered dispute is lost
// by default. Safe to call again for the same dispute: Stripe retries webhooks.
export async function recordChargeback(admin: Admin, dispute: Stripe.Dispute, eventId: string): Promise<void> {
  const { data: existing } = await admin
    .from('risk_events')
    .select('id')
    .eq('event_type', 'chargeback')
    .eq('metadata->>dispute_id', dispute.id)
    .maybeSingle()
  if (existing) return

  const paymentIntentId = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id ?? null
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id
  const payment = await disputedPayment(admin, paymentIntentId)
  const dueBy = dispute.evidence_details?.due_by ? new Date(dispute.evidence_details.due_by * 1000).toISOString() : null

  // The booking's cleaner may already have been paid their share, which the
  // admin needs to know before deciding whether to fight it.
  const { data: booking } = payment.bookingId
    ? await admin.from('bookings').select('stripe_transfer_id').eq('id', payment.bookingId).maybeSingle()
    : { data: null }

  const { error } = await admin.from('risk_events').insert({
    event_type: 'chargeback',
    booking_id: payment.bookingId,
    user_id: payment.userId,
    severity: 'high',
    description: `${KIND_LABELS[payment.kind]} of ${money(dispute.amount)} disputed (${dispute.reason}).`,
    metadata: {
      dispute_id: dispute.id,
      stripe_event_id: eventId,
      payment_intent_id: paymentIntentId,
      charge_id: chargeId,
      kind: payment.kind,
      amount_cents: dispute.amount,
      reason: dispute.reason,
      evidence_due_by: dueBy,
    },
  })
  // Thrown so the webhook fails and Stripe retries, rather than losing the dispute.
  if (error) throw new Error(error.message)

  const incident = payment.bookingId
    ? await loadBookingIncident(admin, payment.bookingId, 'Customer (disputing)').catch((err) => {
        console.error('Loading booking for chargeback email failed', payment.bookingId, err)
        return null
      })
    : null

  const timeZone = incident?.booking.time_zone ?? 'America/New_York'
  const disputeSection = detailSection('Dispute', [
    ['Disputed charge', KIND_LABELS[payment.kind]],
    ['Amount', money(dispute.amount)],
    ['Reason', dispute.reason.replace(/_/g, ' ')],
    ['Respond by', dueBy ? formatInZone(dueBy, timeZone) : null],
    ['Cleaner payout', payment.bookingId ? (booking?.stripe_transfer_id ? `Already paid (${booking.stripe_transfer_id})` : 'Not paid yet') : null],
    ['Stripe dispute', dispute.id],
  ])
  const intro = `A ${escapeHtml(KIND_LABELS[payment.kind].toLowerCase())} of <strong>${money(dispute.amount)}</strong> was disputed. Respond in Stripe before the deadline or the dispute is lost.`

  try {
    if (incident) {
      await sendAdminEscalation(incident, {
        subject: 'ESCALATION: CHARGEBACK',
        heading: 'Charge disputed',
        intro,
        sections: [disputeSection, incident.sections.customer, incident.sections.cleaner, incident.sections.booking, incident.sections.payment],
      })
    } else {
      await sendEmail({
        to: [{ email: TYDIO_ADMIN_EMAIL }],
        subject: 'ESCALATION: CHARGEBACK',
        htmlContent: emailShell(`
          <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#dc2626;">Charge disputed</h2>
          <p style="margin:0 0 8px;font-size:15px;color:#475569;line-height:1.6;">${intro}</p>
          ${disputeSection}
          ${detailSection('Payment', [['Stripe payment', paymentIntentId], ['Stripe charge', chargeId], ['User ID', payment.userId]])}
        `),
      })
    }
  } catch (err) {
    // The risk event is saved; a failed email shouldn't make Stripe resend the event.
    console.error('Chargeback escalation email failed', dispute.id, err)
  }
}
