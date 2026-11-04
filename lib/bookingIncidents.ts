import type { createAdminClient } from '@/lib/supabase/admin'
import { emailShell, escapeHtml, sendEmail } from '@/lib/email'
import { detailSection, formatInZone, loadBookingIncident, sendAdminEscalation } from '@/lib/bookingIncidentEmail'
import { lateCancelCleanerPay, lateCancelRefund } from '@/lib/pricingRules'
import { canSendSms, sendSmsForPayload } from '@/lib/sms'
import { sendPushForPayload } from '@/lib/push'
import type { NotificationPayload } from '@/lib/notifications'
import { refundBookingInFull, refundLateCancellation } from '@/lib/bookingRequestGroups'
import { completeBookingPayout } from '@/lib/bookings'
import { pauseCleaner } from '@/lib/cleanerStatus'
import { userFacingError } from '@/lib/userFacingError'

type Admin = ReturnType<typeof createAdminClient>

// A booking that couldn't go ahead: the cleaner arrived but couldn't get in, or never
// showed up. Reporting one cancels the booking and tells the admin, without moving any
// money. The admin settles it from /admin/incidents with a full, half, or no refund, and
// the cleaner's pay follows the same split as a late cancellation.

// Each is also the booking's cancelled_reason (NO_ACCESS_REASON, CLEANER_NO_SHOW_REASON).
export type IncidentType = 'no_access' | 'cleaner_no_show'
export type RefundLevel = 'full' | 'half' | 'none'

export const INCIDENT_LABELS: Record<IncidentType, string> = {
  no_access: 'Customer unavailable — no access',
  cleaner_no_show: 'Cleaner no-show',
}

export const REFUND_LEVEL_LABELS: Record<RefundLevel, string> = {
  full: 'Full refund (100%)',
  half: 'Half refund (50%)',
  none: 'No refund',
}

export function isRefundLevel(value: string): value is RefundLevel {
  return value === 'full' || value === 'half' || value === 'none'
}

export function incidentRefundAmount(level: RefundLevel, totalCharge: number): number {
  if (level === 'full') return totalCharge
  if (level === 'half') return lateCancelRefund(totalCharge)
  return 0
}

// Whatever Tydio keeps is shared with the cleaner as usual: nothing kept, nothing paid;
// half kept, half their pay; all kept, all of it.
export function incidentCleanerPay(level: RefundLevel, cleanerPay: number): number {
  if (level === 'full') return 0
  if (level === 'half') return lateCancelCleanerPay(cleanerPay)
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
      `<strong>${escapeHtml(cleaner)}</strong> arrived but couldn't get into <strong>${escapeHtml(customer)}</strong>'s home, and waited the required 15 minutes. The booking has been canceled and no money has moved. Decide the refund and payout in the admin.`,
  },
  cleaner_no_show: {
    subject: 'URGENT: CLEANER NO-SHOW',
    heading: 'Cleaner no-show',
    intro: (cleaner, customer) =>
      `<strong>${escapeHtml(customer)}</strong> reported that their cleaner, <strong>${escapeHtml(cleaner)}</strong>, never arrived. The booking has been canceled, the cleaner has been flagged, and no money has moved. Decide the refund and payout in the admin, and whether to pause the cleaner.`,
  },
}

// The caller has already checked who's reporting and that the timing allows it. The claim
// is a conditional update, so a booking is only ever reported once.
export async function reportBookingIncident(
  admin: Admin,
  booking: { id: string; user_id: string; tidy_pro_id: string | null },
  type: IncidentType,
  reportedBy: string,
  now: Date = new Date()
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

  // For a no-show, this is the flag on the cleaner's account the admin reviews.
  const { error: riskError } = await admin.from('risk_events').insert({
    event_type: type === 'no_access' ? 'customer_no_access' : 'cleaner_no_show',
    booking_id: booking.id,
    user_id: type === 'no_access' ? booking.user_id : booking.tidy_pro_id,
    severity: type === 'no_access' ? 'medium' : 'high',
    description: INCIDENT_LABELS[type],
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
            ['Reported', formatInZone(now.toISOString(), incident.booking.time_zone)],
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
    customer: "Your Tidy Pro arrived for your booking but couldn't get into your home, and waited 15 minutes before reporting it.",
    cleaner: "You reported that you couldn't get into the customer's home for this booking.",
  },
  cleaner_no_show: {
    customer: 'You reported that your Tidy Pro didn’t arrive for your booking.',
    cleaner: 'The customer reported that you didn’t arrive for this booking.',
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
  note: string | null
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
        `${reason.customer} We've reviewed your booking${when}.`,
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
        `${reason.cleaner} We've reviewed the booking${when}.`,
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
  level: RefundLevel,
  note: string | null,
  pause: boolean,
  now: Date = new Date()
): Promise<{ success: true; refund: number; cleanerPay: number; warning?: string } | { error: string }> {
  const { data: booking } = await admin
    .from('bookings')
    .select('id, user_id, tidy_pro_id, incident_type, incident_resolved_at, stripe_payment_intent_id, total_customer_charge, cleaner_pay, scheduled_date, time_zone')
    .eq('id', bookingId)
    .maybeSingle()

  if (!booking?.incident_type) return { error: 'Incident not found.' }
  if (booking.incident_resolved_at) return { error: 'This incident has already been settled.' }

  const cleanerPay = incidentCleanerPay(level, booking.cleaner_pay ?? 0)
  const refund = booking.stripe_payment_intent_id ? incidentRefundAmount(level, booking.total_customer_charge ?? 0) : 0

  const { data: claimed, error: claimError } = await admin
    .from('bookings')
    .update({ incident_resolved_at: now.toISOString(), incident_refund_level: level, incident_note: note, cleaner_pay: cleanerPay })
    .eq('id', bookingId)
    .is('incident_resolved_at', null)
    .select('id')
  if (claimError) return { error: userFacingError(claimError) }
  if (!claimed?.length) return { error: 'This incident has already been settled.' }

  if (level !== 'none' && booking.stripe_payment_intent_id) {
    try {
      const refundId = level === 'full'
        ? await refundBookingInFull(booking.stripe_payment_intent_id)
        : await refundLateCancellation(booking.stripe_payment_intent_id)
      await admin.from('bookings').update({ stripe_refund_id: refundId }).eq('id', bookingId)
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

  await admin
    .from('risk_events')
    .update({ resolved_at: now.toISOString(), resolution_notes: [REFUND_LEVEL_LABELS[level], note].filter(Boolean).join(' — ') })
    .eq('booking_id', bookingId)
    .in('event_type', ['customer_no_access', 'cleaner_no_show'])
    .is('resolved_at', null)

  await sendIncidentResolutionEmails(admin, booking, booking.incident_type, refund, cleanerPay, note)

  return { success: true, refund, cleanerPay, ...(warnings.length ? { warning: warnings.join(' ') } : {}) }
}
