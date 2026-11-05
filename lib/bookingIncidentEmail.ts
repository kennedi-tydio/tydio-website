import type { createAdminClient } from '@/lib/supabase/admin'
import { bookingStartInstant } from '@/lib/bookingTime'
import { TYDIO_ADMIN_EMAIL, emailShell, escapeHtml, sendEmail } from '@/lib/email'
import { stripe } from '@/lib/stripe'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import type { CleanerReportCategory } from '@/lib/cleanerReportCategories'

type Admin = ReturnType<typeof createAdminClient>

// The admin's urgent emails about a booking (an unresponsive cleaner, a cleaner reported
// by a customer) carry everything needed to act without opening the admin: the cleaner's
// and customer's contact details, the booking itself, and what the customer paid.

function money(value: number | null | undefined): string {
  return value == null ? '—' : `$${Number(value).toFixed(2)}`
}

function formatStart(date: string, time: string, timeZone: string): string {
  return bookingStartInstant(date, time, timeZone).toLocaleString('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

export function formatInZone(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString('en-US', { timeZone, dateStyle: 'medium', timeStyle: 'short' })
}

export function detailSection(title: string, rows: [string, string | null | undefined][]): string {
  const body = rows
    .map(
      ([label, value]) => `<tr>
        <td style="padding:6px 12px 6px 0;font-size:13px;color:#64748b;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td>
        <td style="padding:6px 0;font-size:14px;color:#1a2332;vertical-align:top;">${escapeHtml(value || '—').replace(/\n/g, '<br/>')}</td>
      </tr>`
    )
    .join('')
  return `<h3 style="margin:24px 0 8px;font-size:15px;font-weight:700;color:#1a2332;">${escapeHtml(title)}</h3>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">${body}</table>`
}

type PaymentDetails = { status: string | null; card: string | null }

async function paymentDetails(paymentIntentId: string | null): Promise<PaymentDetails> {
  if (!paymentIntentId) return { status: null, card: null }
  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['payment_method'] })
    const method = typeof intent.payment_method === 'object' ? intent.payment_method : null
    const card = method?.card ? `${method.card.brand} ending ${method.card.last4} (exp ${method.card.exp_month}/${method.card.exp_year})` : null
    return { status: `${intent.status} — ${money(intent.amount_received / 100)} received`, card }
  } catch (err) {
    console.error('Looking up payment for admin escalation failed', paymentIntentId, err)
    return { status: 'Could not load from Stripe', card: null }
  }
}

export function serviceAddressText(location: ScheduledLocation | null): string | null {
  if (location?.type === 'address') return [location.label, location.line].filter(Boolean).join(' — ')
  if (location?.type === 'current_location') return `Customer's current location (${location.latitude}, ${location.longitude})`
  return null
}

export type BookingIncident = {
  booking: { id: string; time_zone: string; stripe_payment_intent_id: string | null }
  cleanerName: string
  customerName: string
  // One HTML block per heading, so each email can put them in its own order.
  sections: { cleaner: string; booking: string; customer: string; payment: string }
}

export async function loadBookingIncident(admin: Admin, bookingId: string, customerTitle = 'Customer'): Promise<BookingIncident | null> {
  const { data: booking } = await admin.from('bookings').select('*').eq('id', bookingId).maybeSingle()
  if (!booking) return null

  const [{ data: cleaner }, { data: tidyPro }, { data: customer }, { data: tasks }, payment] = await Promise.all([
    booking.tidy_pro_id
      ? admin.from('profiles').select('first_name, last_name, email, phone').eq('id', booking.tidy_pro_id).maybeSingle()
      : Promise.resolve({ data: null }),
    booking.tidy_pro_id
      ? admin.from('tidypro_profiles').select('phone, street_address, unit_number, city, state, zip_code').eq('id', booking.tidy_pro_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from('profiles').select('first_name, last_name, email, phone, street_address, zip_code, stripe_customer_id').eq('id', booking.user_id).maybeSingle(),
    admin.from('booking_tasks').select('task_name, task_category').eq('booking_id', booking.id),
    paymentDetails(booking.stripe_payment_intent_id),
  ])

  const cleanerName = [cleaner?.first_name, cleaner?.last_name].filter(Boolean).join(' ') || booking.tidy_pro_name || 'Unknown cleaner'
  const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(' ') || 'Unknown customer'
  const cleanerAddress = [tidyPro?.street_address, tidyPro?.unit_number, tidyPro?.city, tidyPro?.state, tidyPro?.zip_code].filter(Boolean).join(', ')
  const serviceAddress = serviceAddressText(booking.scheduled_location as ScheduledLocation | null)

  return {
    booking: { id: booking.id, time_zone: booking.time_zone, stripe_payment_intent_id: booking.stripe_payment_intent_id },
    cleanerName,
    customerName,
    sections: {
      cleaner: detailSection('Cleaner', [
        ['Full name', cleanerName],
        ['Phone', tidyPro?.phone ?? cleaner?.phone],
        ['Email', cleaner?.email],
        ['Address', cleanerAddress],
        ['Tidy Pro ID', booking.tidy_pro_id],
      ]),
      booking: detailSection('Booking', [
        ['Booking ID', booking.id],
        ['Status', [booking.status, booking.progress_status].filter(Boolean).join(' / ')],
        ['Start', booking.scheduled_date && booking.scheduled_time ? formatStart(booking.scheduled_date, booking.scheduled_time, booking.time_zone) : booking.scheduled_date ? `${booking.scheduled_date}, anytime` : null],
        ['Estimated length', booking.estimated_duration_minutes != null ? `${booking.estimated_duration_minutes} minutes` : null],
        ['Service address', serviceAddress],
        ['Tasks', (tasks ?? []).map((t) => `${t.task_name} (${t.task_category})`).join('\n') || booking.task_description],
        ['Entry instructions', booking.entry_instructions],
        ['Notes', booking.notes],
        ['Unusual notes', booking.unusual_notes],
        ['Pets', booking.pets],
        ['Customer provides supplies', booking.will_provide_supplies ? 'Yes' : 'No'],
        ['Booked', formatInZone(booking.created_at, booking.time_zone)],
      ]),
      customer: detailSection(customerTitle, [
        ['Full name', customerName],
        ['Phone', customer?.phone],
        ['Email', customer?.email],
        ['Home address', [customer?.street_address, customer?.zip_code].filter(Boolean).join(', ')],
        ['Customer ID', booking.user_id],
      ]),
      payment: detailSection("Customer's payment", [
        ['Tasks subtotal', money(booking.customer_subtotal ?? booking.task_amount)],
        ['Service fee', money(booking.service_fee)],
        ['Tip', money(booking.tip)],
        ['Total charged', money(booking.total_customer_charge ?? booking.total_amount)],
        ['Cleaner pay', money(booking.cleaner_pay)],
        ['Card', payment.card],
        ['Payment status', payment.status],
        ['Stripe payment', booking.stripe_payment_intent_id],
        ['Stripe customer', customer?.stripe_customer_id],
      ]),
    },
  }
}

export async function sendAdminEscalation(
  incident: BookingIncident,
  { subject, heading, intro, sections, adminPath = '/admin/users' }: { subject: string; heading: string; intro: string; sections: string[]; adminPath?: string }
): Promise<void> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const paymentIntentId = incident.booking.stripe_payment_intent_id

  await sendEmail({
    to: [{ email: TYDIO_ADMIN_EMAIL }],
    subject,
    htmlContent: emailShell(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#dc2626;">${escapeHtml(heading)}</h2>
      <p style="margin:0 0 8px;font-size:15px;color:#475569;line-height:1.6;">${intro}</p>
      ${sections.join('')}
      <p style="margin:24px 0 0;">
        <a href="${siteUrl}${adminPath}" style="display:inline-block;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">Open admin</a>
        ${paymentIntentId ? `<a href="https://dashboard.stripe.com/payments/${escapeHtml(paymentIntentId)}" style="display:inline-block;margin-left:8px;padding:14px 28px;background:#1a2332;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">View in Stripe</a>` : ''}
      </p>
    `),
  })
}

// A customer reported their cleaner from the booking page. The report itself is already
// saved; this tells the admin straight away, with who reported it and what they said.
export async function sendCleanerReportEscalation(
  admin: Admin,
  bookingId: string,
  category: CleanerReportCategory,
  reason: string,
  reportedAt: Date = new Date()
): Promise<void> {
  const incident = await loadBookingIncident(admin, bookingId, 'Reported by (customer)')
  if (!incident) return

  await sendAdminEscalation(incident, {
    subject: 'ESCALATION: CLEANER REPORTED',
    heading: 'Cleaner reported',
    intro: `<strong>${escapeHtml(incident.customerName)}</strong> reported their cleaner, <strong>${escapeHtml(incident.cleanerName)}</strong>, for <strong>${escapeHtml(category.label)}</strong>.`,
    sections: [
      detailSection('Report', [
        ['Category', category.label],
        ['What happened', reason],
        ['Submitted', formatInZone(reportedAt.toISOString(), incident.booking.time_zone)],
      ]),
      incident.sections.customer,
      incident.sections.cleaner,
      incident.sections.booking,
      incident.sections.payment,
    ],
  })
}
