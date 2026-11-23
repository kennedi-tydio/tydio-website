import type { createAdminClient } from '@/lib/supabase/admin'
import { emailShell, escapeHtml, sendEmail } from '@/lib/email'
import { detailSection, formatInZone, loadBookingIncident, sendAdminEscalation } from '@/lib/bookingIncidentEmail'
import { halfRefund, halfRefundCleanerPay, netOfStripeFee, trustSupportFeeOf } from '@/lib/pricingRules'
import { canSendSms, sendSmsForPayload } from '@/lib/sms'
import { sendPushForPayload } from '@/lib/push'
import type { NotificationPayload } from '@/lib/notifications'
import { refundBookingTotal } from '@/lib/bookingRequestGroups'
import { completeBookingPayout } from '@/lib/bookings'
import { pauseCleaner } from '@/lib/cleanerStatus'
import { userFacingError } from '@/lib/userFacingError'
import { dropPendingUpcharges } from '@/lib/bookingUpcharges'
import { NO_ACCESS_WAIT_MINUTES } from '@/lib/bookingTime'

type Admin = ReturnType<typeof createAdminClient>

// A booking that couldn't go ahead: the cleaner arrived but couldn't get in, or never
// showed up. Reporting one cancels the booking and tells the admin, without moving any
// money. The admin settles it from /admin/incidents with a full, half, or no refund, and
// the cleaner's pay follows the same split as a late cancellation, after calling both sides
// to check the claim. No refund is automatic. ('minus_fee' is from an earlier automatic
// no-show refund, kept so those settled incidents still read correctly.)

// Each is also the booking's cancelled_reason (NO_ACCESS_REASON, CLEANER_NO_SHOW_REASON).
// cleaner_asked_cancel: the customer canceled an accepted booking saying the Tidy Pro asked
// them to; held for the admin rather than refunded on the spot (migration 081).
export type IncidentType = 'no_access' | 'cleaner_no_show' | 'cleaner_asked_cancel'
export type RefundLevel = 'full' | 'half' | 'none'
// What a settled incident can record: the admin's choices, plus a no-show's automatic refund.
export type SettledRefundLevel = RefundLevel | 'minus_fee'

export const INCIDENT_LABELS: Record<IncidentType, string> = {
  no_access: 'Customer unavailable — no access',
  cleaner_no_show: 'Cleaner no-show',
  cleaner_asked_cancel: 'Customer canceled — says the cleaner asked them to',
}

export const REFUND_LEVEL_LABELS: Record<SettledRefundLevel, string> = {
  full: 'Full refund (100%)',
  half: 'Half refund (50%)',
  minus_fee: 'Refund less processing fee (automatic no-show)',
  none: 'No refund',
}

export function isRefundLevel(value: string): value is RefundLevel {
  return value === 'full' || value === 'half' || value === 'none'
}

// trustSupportFee: what the booking was charged for it (kept with Stripe's fee).
export function incidentRefundAmount(level: SettledRefundLevel, totalCharge: number, trustSupportFee = 0): number {
  if (level === 'full') return totalCharge
  // An estimate at a US card's rate; the real amount is what Stripe refunds.
  if (level === 'minus_fee') return Math.max(0, Math.round((netOfStripeFee(totalCharge) - trustSupportFee) * 100) / 100)
  if (level === 'half') return halfRefund(totalCharge)
  return 0
}

// Whatever Tydio keeps is shared with the cleaner as usual: nothing kept, nothing paid;
// half kept, half their pay; all kept, all of it.
export function incidentCleanerPay(level: SettledRefundLevel, cleanerPay: number): number {
  if (level === 'full' || level === 'minus_fee') return 0
  if (level === 'half') return halfRefundCleanerPay(cleanerPay)
  return cleanerPay
}

function money(value: number): string {
  return `$${value.toFixed(2)}`
}

export async function notifyIncidentCleaner(admin: Admin, tidyProId: string, payload: NotificationPayload): Promise<void> {
  const { data: tidyPro } = await admin.from('tidypro_profiles').select('phone, sms_consent').eq('id', tidyProId).maybeSingle()
  if (canSendSms(tidyPro?.sms_consent ?? null, tidyPro?.phone ?? null)) {
    await sendSmsForPayload(tidyPro!.phone!, payload).catch((err) => console.error('Cleaner SMS failed', err))
  }
  await sendPushForPayload(tidyProId, payload).catch((err) => console.error('Cleaner push failed', err))
}

const ADMIN_EMAIL: Record<IncidentType, { subject: string; heading: string; intro: (cleaner: string, customer: string) => string }> = {
  no_access: {
    subject: 'URGENT: CUSTOMER UNAVAILABLE — NO ACCESS',
    heading: 'Customer unavailable — no access',
    intro: (cleaner, customer) =>
      `<strong>${escapeHtml(cleaner)}</strong> arrived but couldn't get into <strong>${escapeHtml(customer)}</strong>'s home, and waited the required ${NO_ACCESS_WAIT_MINUTES} minutes. The booking has been canceled and no money has moved. Decide the refund and payout in the admin.`,
  },
  cleaner_no_show: {
    subject: 'URGENT: CLEANER NO-SHOW',
    heading: 'Cleaner no-show',
    intro: (cleaner, customer) =>
      `<strong>${escapeHtml(customer)}</strong> reported that their cleaner, <strong>${escapeHtml(cleaner)}</strong>, never arrived. The booking has been canceled, the cleaner has been flagged, and no money has moved. Call both of them to check the claim, then decide the refund, the cleaner's pay, and whether to pause the cleaner in the admin.`,
  },
  cleaner_asked_cancel: {
    subject: 'CANCELLATION TO REVIEW: CUSTOMER SAYS THE CLEANER ASKED THEM TO CANCEL',
    heading: 'Customer says the cleaner asked them to cancel',
    intro: (cleaner, customer) =>
      `<strong>${escapeHtml(customer)}</strong> canceled their booking and said their cleaner, <strong>${escapeHtml(cleaner)}</strong>, asked them to. The booking has been canceled and no money has moved. Check with both of them, then decide the refund, the cleaner's pay, and whether to pause the cleaner in the admin.`,
  },
}

// The report logged on the account it's about (risk_events), one kind per incident.
const RISK_EVENT_TYPE: Record<IncidentType, string> = {
  no_access: 'customer_no_access',
  cleaner_no_show: 'cleaner_no_show',
  cleaner_asked_cancel: 'cleaner_asked_cancel',
}

// The caller has already checked who's reporting and that the timing allows it. The claim
// is a conditional update, so a booking is only ever reported once.
export async function reportBookingIncident(
  admin: Admin,
  booking: { id: string; user_id: string; tidy_pro_id: string | null },
  type: IncidentType,
  reportedBy: string,
  now: Date = new Date(),
  // For a no-show: whether the cleaner had tapped "I've arrived" (so it's disputed), and
  // anything the customer wrote in their report.
  context: { cleanerMarkedArrived?: boolean; details?: string | null } = {}
): Promise<{ success: true } | { error: string }> {
  const { data: claimed, error } = await admin
    .from('bookings')
    .update({
      status: 'cancelled',
      cancelled_reason: type,
      progress_status: null,
      incident_type: type,
      incident_reported_at: now.toISOString(),
      user_unread: true,
      tidy_pro_unread: true,
    })
    .eq('id', booking.id)
    .eq('status', 'scheduled')
    .is('incident_type', null)
    .select('id')
  if (error) return { error: userFacingError(error) }
  if (!claimed?.length) return { error: 'This booking can no longer be reported.' }

  // An unpaid upcharge is dropped. A paid one is part of the total the admin settles.
  await dropPendingUpcharges(admin, booking.id)

  // For a no-show, this is the flag on the cleaner's account the admin reviews.
  const { error: riskError } = await admin.from('risk_events').insert({
    event_type: RISK_EVENT_TYPE[type],
    booking_id: booking.id,
    user_id: type === 'no_access' ? booking.user_id : booking.tidy_pro_id,
    severity: type === 'cleaner_no_show' ? 'high' : 'medium',
    description: [
      INCIDENT_LABELS[type],
      context.cleanerMarkedArrived ? 'reported after the cleaner marked themselves arrived' : null,
      context.details || null,
    ].filter(Boolean).join(' — '),
    created_by: reportedBy,
  })
  if (riskError) console.error('Incident risk event failed', booking.id, riskError.message)

  // The booking is already reported; a failed email shouldn't tell them it wasn't.
  try {
    const incident = await loadBookingIncident(admin, booking.id)
    if (incident) {
      const copy = ADMIN_EMAIL[type]
      await sendAdminEscalation(incident, {
        subject: copy.subject,
        heading: copy.heading,
        intro: copy.intro(incident.cleanerName, incident.customerName),
        sections: [
          detailSection('Report', [
            ['Type', INCIDENT_LABELS[type]],
            ['Reported by', type === 'no_access' ? 'Cleaner' : 'Customer'],
            ...(type === 'cleaner_asked_cancel' ? [['Cancel reason', 'The cleaner asked me to cancel'] as [string, string]] : []),
            ['Reported', formatInZone(now.toISOString(), incident.booking.time_zone)],
            ...(context.cleanerMarkedArrived ? [['Cleaner marked arrived', 'Yes — disputed'] as [string, string]] : []),
            ...(context.details ? [['Customer wrote', context.details] as [string, string]] : []),
          ]),
          incident.sections.customer,
          incident.sections.cleaner,
          incident.sections.booking,
          incident.sections.payment,
        ],
        adminPath: `/admin/incidents/${booking.id}`,
      })
    }
  } catch (err) {
    console.error('Incident admin email failed', booking.id, err)
  }

  return { success: true }
}

const RESOLUTION_REASON: Record<IncidentType, { customer: string; cleaner: string }> = {
  no_access: {
    customer: `Your Tidy Pro arrived for your booking but couldn't get into your home, and waited ${NO_ACCESS_WAIT_MINUTES} minutes before reporting it.`,
    cleaner: "You reported that you couldn't get into the customer's home for this booking.",
  },
  cleaner_no_show: {
    customer: 'You reported that your Tidy Pro didn’t arrive for your booking.',
    cleaner: 'The customer reported that you didn’t arrive for this booking.',
  },
  cleaner_asked_cancel: {
    customer: 'You canceled your booking and told us your Tidy Pro asked you to.',
    cleaner: 'The customer canceled this booking and told us you asked them to.',
  },
}

function resolutionEmail(heading: string, paragraphs: string[], note: string | null): string {
  return emailShell(`
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">${escapeHtml(heading)}</h2>
    ${paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">${escapeHtml(p)}</p>`).join('')}
    ${note ? `<p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;"><strong>From the Tydio team:</strong> ${escapeHtml(note)}</p>` : ''}
    <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">Questions? Just reply to this email.</p>
  `)
}

// Tells the customer what they're getting back and the cleaner what they're being paid.
// Sent whatever their notification settings, since it's about their money.
export async function sendIncidentResolutionEmails(
  admin: Admin,
  booking: { id: string; user_id: string; tidy_pro_id: string | null; scheduled_date: string | null; time_zone: string },
  type: IncidentType,
  refund: number,
  cleanerPay: number,
  note: string | null,
  automatic = false
): Promise<void> {
  const [{ data: customer }, { data: cleaner }] = await Promise.all([
    admin.from('profiles').select('email, first_name').eq('id', booking.user_id).maybeSingle(),
    booking.tidy_pro_id ? admin.from('profiles').select('email, first_name').eq('id', booking.tidy_pro_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const reason = RESOLUTION_REASON[type]
  const when = booking.scheduled_date ? ` on ${booking.scheduled_date}` : ''

  if (customer?.email) {
    await sendEmail({
      to: [{ email: customer.email, name: customer.first_name ?? undefined }],
      subject: refund > 0 ? `Your refund of ${money(refund)}` : 'An update on your booking',
      htmlContent: resolutionEmail('An update on your booking', [
        automatic ? `${reason.customer} Your booking${when} has been canceled.` : `${reason.customer} We've reviewed your booking${when}.`,
        refund > 0
          ? `You'll be refunded ${money(refund)} to your original payment method. It may take 5 to 10 business days to appear on your statement.`
          : 'After reviewing it, no refund will be issued for this booking.',
      ], note),
    }).catch((err) => console.error('Incident customer email failed', booking.id, err))
  }

  if (cleaner?.email) {
    await sendEmail({
      to: [{ email: cleaner.email, name: cleaner.first_name ?? undefined }],
      subject: cleanerPay > 0 ? `You'll be paid ${money(cleanerPay)}` : 'An update on your booking',
      htmlContent: resolutionEmail('An update on your booking', [
        automatic ? `${reason.cleaner} The booking${when} has been canceled.` : `${reason.cleaner} We've reviewed the booking${when}.`,
        cleanerPay > 0
          ? `You'll be paid ${money(cleanerPay)} for this booking, sent to your payout account.`
          : "You won't be paid for this booking.",
      ], note),
    }).catch((err) => console.error('Incident cleaner email failed', booking.id, err))
  }
}

// The admin's decision on a reported incident. The booking is claimed first so it's only
// ever settled once, and unclaimed if the refund fails so it can be tried again. The
// cleaner's payout goes through completeBookingPayout, whose scheduled retry picks it up
// if this attempt fails, so a failed transfer only comes back as a warning.
export async function resolveBookingIncident(
  admin: Admin,
  bookingId: string,
  level: SettledRefundLevel,
  note: string | null,
  pause: boolean,
  now: Date = new Date(),
  // A no-show's automatic refund: the cleaner's flag stays open for the admin to review.
  options: { automatic?: boolean } = {}
): Promise<{ success: true; refund: number; cleanerPay: number; warning?: string } | { error: string }> {
  const { data: booking } = await admin
    .from('bookings')
    .select('id, user_id, tidy_pro_id, incident_type, incident_resolved_at, stripe_payment_intent_id, total_customer_charge, cleaner_pay, scheduled_date, time_zone, pricing_breakdown')
    .eq('id', bookingId)
    .maybeSingle()

  if (!booking?.incident_type) return { error: 'Incident not found.' }
  if (booking.incident_resolved_at) return { error: 'This incident has already been settled.' }

  const cleanerPay = incidentCleanerPay(level, booking.cleaner_pay ?? 0)
  let refund = booking.stripe_payment_intent_id ? incidentRefundAmount(level, booking.total_customer_charge ?? 0, trustSupportFeeOf(booking.pricing_breakdown)) : 0

  const { data: claimed, error: claimError } = await admin
    .from('bookings')
    // Settling it is the admin's decision on the payout, so any hold on it comes off.
    .update({ incident_resolved_at: now.toISOString(), incident_refund_level: level, incident_note: note, cleaner_pay: cleanerPay, payout_held_at: null, payout_hold_note: null })
    .eq('id', bookingId)
    .is('incident_resolved_at', null)
    .select('id')
  if (claimError) return { error: userFacingError(claimError) }
  if (!claimed?.length) return { error: 'This incident has already been settled.' }

  if (level !== 'none' && booking.stripe_payment_intent_id) {
    try {
      // On the booking's whole total, including any upcharges the customer paid.
      const { refundId, refunded } = await refundBookingTotal(admin, booking, level)
      await admin.from('bookings').update({ stripe_refund_id: refundId }).eq('id', bookingId)
      // Less the fee Stripe actually took, which the estimate can't know.
      if (level === 'minus_fee' && refunded != null) refund = refunded
    } catch (err) {
      await admin
        .from('bookings')
        .update({ incident_resolved_at: null, incident_refund_level: null, incident_note: null, cleaner_pay: booking.cleaner_pay })
        .eq('id', bookingId)
      return { error: err instanceof Error ? `Refund failed: ${err.message}` : 'Refund failed.' }
    }
  }

  const warnings: string[] = []

  if (pause && booking.tidy_pro_id) {
    await pauseCleaner(admin, booking.tidy_pro_id, `${INCIDENT_LABELS[booking.incident_type]} on booking ${bookingId}`, now)
      .catch((err) => warnings.push(`Couldn't pause the cleaner: ${err instanceof Error ? err.message : err}.`))
  }

  if (cleanerPay > 0) {
    const payout = await completeBookingPayout(admin, bookingId).catch((err) => ({ error: String(err) }))
    if ('error' in payout) warnings.push(`The payout transfer failed and will be retried: ${payout.error}.`)
  }

  if (!options.automatic) await admin
    .from('risk_events')
    .update({ resolved_at: now.toISOString(), resolution_notes: [REFUND_LEVEL_LABELS[level], note].filter(Boolean).join(' — ') })
    .eq('booking_id', bookingId)
    .in('event_type', Object.values(RISK_EVENT_TYPE))
    .is('resolved_at', null)

  await sendIncidentResolutionEmails(admin, booking, booking.incident_type, refund, cleanerPay, note, options.automatic)

  return { success: true, refund, cleanerPay, ...(warnings.length ? { warning: warnings.join(' ') } : {}) }
}
