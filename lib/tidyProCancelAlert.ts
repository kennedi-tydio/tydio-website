import type { createAdminClient } from '@/lib/supabase/admin'
import { TYDIO_ADMIN_EMAIL, emailShell, escapeHtml, sendEmail } from '@/lib/email'
import { cancelReasonLabel } from '@/lib/cancellationReasons'

type Admin = ReturnType<typeof createAdminClient>

const p = 'margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;'
const button = 'display:inline-block;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;'

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

function whenLabel(date: string | null, time: string | null): string {
  if (!date) return 'an unscheduled booking'
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
  if (!time) return day
  const [h, min] = time.split(':').map(Number)
  return `${day} at ${h % 12 === 0 ? 12 : h % 12}:${String(min).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

// Tells the admin a Tidy Pro canceled a booking they'd accepted: who, which booking, when
// it was for, and their reason. Not sent for cancels the admin caused (suspending or
// banning a Tidy Pro). A failed email never stops the cancel.
export async function emailAdminOfTidyProCancel(
  admin: Admin,
  input: { bookingId: string; tidyProId: string; reason: { cancellation_reason: string; cancellation_note: string | null } }
): Promise<void> {
  const { data: booking } = await admin
    .from('bookings')
    .select('id, user_id, scheduled_date, scheduled_time, recurring_booking_id')
    .eq('id', input.bookingId)
    .maybeSingle()
  if (!booking) return

  const { data: people } = await admin.from('profiles').select('id, first_name, last_name, email').in('id', [input.tidyProId, booking.user_id])
  const byId = new Map((people ?? []).map((person) => [person.id, person]))
  const name = (id: string) => {
    const person = byId.get(id)
    return [person?.first_name, person?.last_name].filter(Boolean).join(' ') || 'Unknown'
  }
  const tidyPro = byId.get(input.tidyProId)
  const tidyProName = name(input.tidyProId)
  const reason = cancelReasonLabel(input.reason.cancellation_reason) ?? input.reason.cancellation_reason

  await sendEmail({
    to: [{ email: TYDIO_ADMIN_EMAIL }],
    subject: `${tidyProName} canceled a booking`,
    htmlContent: emailShell(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">A Tidy Pro canceled a booking</h2>
      <p style="${p}"><strong>${escapeHtml(tidyProName)}</strong>${tidyPro?.email ? ` (${escapeHtml(tidyPro.email)})` : ''} canceled ${escapeHtml(name(booking.user_id))}'s ${booking.recurring_booking_id ? 'recurring visit' : 'booking'} on <strong>${escapeHtml(whenLabel(booking.scheduled_date, booking.scheduled_time))}</strong>.</p>
      <p style="${p}"><strong>Reason:</strong> ${escapeHtml(reason)}${input.reason.cancellation_note ? `<br><strong>Note:</strong> ${escapeHtml(input.reason.cancellation_note)}` : ''}</p>
      <p style="${p}">The customer has been told and offered other Tidy Pros or a refund. Booking ID: ${escapeHtml(booking.id)}</p>
      <a href="${siteUrl()}/admin/bookings" style="${button}">View bookings</a>
    `),
  })
}
