import type { createAdminClient } from '@/lib/supabase/admin'
import type { NotificationPayload } from '@/lib/notifications'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import { TYDIO_ADMIN_EMAIL, emailShell, escapeHtml, sendEmail } from '@/lib/email'
import { bookingStartInstant } from '@/lib/bookingTime'
import { detailSection, serviceAddressText } from '@/lib/bookingIncidentEmail'
import { normalizePhone } from '@/lib/bannedUsers'

type Admin = ReturnType<typeof createAdminClient>

// While Twilio hasn't approved our number, every text the app would send is emailed to
// the admin instead, to send by hand: the exact text, who it's for, and the booking with
// both the customer's and the Tidy Pro's numbers. Only people who opted in to texts get
// one, same as with Twilio (callers check canSendSms first).

// Texts about a booking link to it: /pro/messages/<id>, /dashboard/bookings/<id>, ...
export function bookingIdFromUrl(url: string): string | null {
  return url.match(/\/(?:messages|bookings)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i)?.[1] ?? null
}

// Texts that are about a booking but don't link to one (a cancellation confirmation goes
// to /dashboard). For these the recipient's most recently updated booking is shown.
export function linksToBookingList(url: string): boolean {
  const path = url.replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, '').replace(/\/$/, '')
  return ['/dashboard', '/dashboard/bookings', '/pro/messages', '/pro/bookings'].includes(path)
}

export function textBody(payload: NotificationPayload): string {
  return `Tydio: ${payload.body} ${payload.url}`
}

type Person = { id: string; role: string | null; name: string; phone: string | null; email: string | null }

async function peopleByIds(admin: Admin, ids: string[]): Promise<Map<string, Person>> {
  if (ids.length === 0) return new Map()
  const [{ data: profiles }, { data: pros }] = await Promise.all([
    admin.from('profiles').select('id, role, first_name, last_name, email, phone').in('id', ids),
    admin.from('tidypro_profiles').select('id, phone').in('id', ids),
  ])
  const proPhone = new Map((pros ?? []).map((p) => [p.id, p.phone]))
  return new Map(
    (profiles ?? []).map((p) => [
      p.id,
      {
        id: p.id,
        role: p.role,
        name: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown',
        // Tidy Pros are texted at their Tidy Pro profile's number.
        phone: (p.role === 'TIDYPRO' ? proPhone.get(p.id) : null) ?? p.phone,
        email: p.email,
      },
    ])
  )
}

// Matched on the last four digits, then compared in full (phones are saved as typed).
async function peopleWithPhone(admin: Admin, phone: string): Promise<Person[]> {
  const target = normalizePhone(phone)
  if (target.length < 4) return []
  const ids = new Set<string>()
  for (const table of ['profiles', 'tidypro_profiles'] as const) {
    const { data } = await admin.from(table).select('id, phone').ilike('phone', `%${target.slice(-4)}`)
    for (const row of data ?? []) if (row.phone && normalizePhone(row.phone) === target) ids.add(row.id)
  }
  return [...(await peopleByIds(admin, [...ids])).values()]
}

function roleLabel(role: string | null): string {
  return role === 'TIDYPRO' ? 'Tidy Pro' : role === 'USER' ? 'Customer' : 'Person'
}

function formatStart(date: string | null, time: string | null, timeZone: string): string | null {
  if (!date) return null
  if (!time) return `${date}, anytime`
  return bookingStartInstant(date, time, timeZone).toLocaleString('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

export async function emailAdminManualText(admin: Admin, to: string, payload: NotificationPayload): Promise<void> {
  const recipients = await peopleWithPhone(admin, to)

  let bookingId = bookingIdFromUrl(payload.url)
  let guessed = false
  if (!bookingId && linksToBookingList(payload.url) && recipients.length > 0) {
    const ids = recipients.map((r) => r.id).join(',')
    const { data: latest } = await admin
      .from('bookings')
      .select('id')
      .or(`user_id.in.(${ids}),tidy_pro_id.in.(${ids})`)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    bookingId = latest?.id ?? null
    guessed = !!bookingId
  }

  const { data: booking } = bookingId ? await admin.from('bookings').select('*').eq('id', bookingId).maybeSingle() : { data: null }
  const [parties, { data: tasks }] = await Promise.all([
    peopleByIds(admin, booking ? [booking.user_id, booking.tidy_pro_id].filter((id): id is string => !!id) : []),
    booking ? admin.from('booking_tasks').select('task_name').eq('booking_id', booking.id) : Promise.resolve({ data: [] }),
  ])
  const customer = booking ? parties.get(booking.user_id) : undefined
  const tidyPro = booking?.tidy_pro_id ? parties.get(booking.tidy_pro_id) : undefined

  // The booking's own customer or Tidy Pro, when the number is theirs.
  const recipient =
    [customer, tidyPro].find((p) => p?.phone && normalizePhone(p.phone) === normalizePhone(to)) ?? recipients[0] ?? null
  const who = recipient ? `${roleLabel(recipient.role)} ${recipient.name}` : 'Unknown person'
  const text = textBody(payload)

  const bookingHtml = booking
    ? `${guessed ? '<p style="margin:24px 0 0;font-size:13px;color:#b45309;">This text doesn’t name a booking, so this is their most recently updated one.</p>' : ''}
      ${detailSection('Booking', [
        ['Booking ID', booking.id],
        ['Status', [booking.status, booking.progress_status].filter(Boolean).join(' / ')],
        ['Start', formatStart(booking.scheduled_date, booking.scheduled_time, booking.time_zone)],
        ['Estimated length', booking.estimated_duration_minutes != null ? `${booking.estimated_duration_minutes} minutes` : null],
        ['Service address', serviceAddressText(booking.scheduled_location as ScheduledLocation | null)],
        ['Tasks', (tasks ?? []).map((t) => t.task_name).join('\n') || booking.task_description],
        ['Customer paid', booking.total_customer_charge != null ? `$${Number(booking.total_customer_charge).toFixed(2)}` : null],
      ])}
      ${detailSection('Customer', [
        ['Name', customer?.name],
        ['Phone', customer?.phone],
        ['Email', customer?.email],
      ])}
      ${detailSection('Tidy Pro', [
        ['Name', tidyPro?.name ?? booking.tidy_pro_name],
        ['Phone', tidyPro?.phone],
        ['Email', tidyPro?.email],
      ])}`
    : '<p style="margin:24px 0 0;font-size:13px;color:#64748b;">Not about a specific booking.</p>'

  await sendEmail({
    to: [{ email: TYDIO_ADMIN_EMAIL }],
    subject: `Text ${who} at ${to}: ${payload.title}`,
    htmlContent: emailShell(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">Send this text</h2>
      <p style="margin:0 0 8px;font-size:15px;color:#475569;line-height:1.6;">
        To: <strong>${escapeHtml(who)}</strong> at <a href="sms:${escapeHtml(to)}?&body=${encodeURIComponent(text)}">${escapeHtml(to)}</a>
      </p>
      <div style="margin:0 0 8px;padding:12px 14px;background:#f1f5f9;border-radius:10px;font-size:15px;color:#1a2332;line-height:1.5;white-space:pre-wrap;">${escapeHtml(text)}</div>
      <p style="margin:0;font-size:12px;color:#94a3b8;">On your phone, tap the number to open Messages with the text filled in.</p>
      ${bookingHtml}
    `),
  })
}
