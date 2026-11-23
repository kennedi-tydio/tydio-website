import type { createAdminClient } from '@/lib/supabase/admin'
import { TYDIO_ADMIN_EMAIL, emailShell, escapeHtml, sendEmail } from '@/lib/email'
import { bookingDetails } from '@/lib/manualTextEmail'

type Admin = ReturnType<typeof createAdminClient>

// Emails the admin when a customer places a booking, with its details. Now that texts go
// out through Twilio, this is the admin's heads-up for new bookings; problems with a
// booking still come as their own escalation emails (incidents, cancellations, disputes).
export async function emailAdminNewBooking(
  admin: Admin,
  bookingId: string,
  opts: { recurrence?: string | null } = {}
): Promise<void> {
  const { data: booking } = await admin.from('bookings').select('*').eq('id', bookingId).maybeSingle()
  if (!booking) return

  // A request sent to several Tidy Pros at once is one booking row per Pro.
  const { data: group } = booking.request_group_id
    ? await admin.from('bookings').select('tidy_pro_name').eq('request_group_id', booking.request_group_id).neq('id', booking.id)
    : { data: [] }
  const otherPros = (group ?? []).map((b) => b.tidy_pro_name).filter(Boolean)

  const { html, customer } = await bookingDetails(admin, booking)
  const notes = [
    opts.recurrence ? `Recurring: ${opts.recurrence}` : null,
    otherPros.length > 0 ? `Also requested: ${otherPros.join(', ')}` : null,
  ].filter((n): n is string => !!n)

  await sendEmail({
    to: [{ email: TYDIO_ADMIN_EMAIL }],
    subject: `New booking: ${customer?.name ?? 'A customer'} with ${booking.tidy_pro_name ?? 'a Tidy Pro'}`,
    htmlContent: emailShell(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">New booking</h2>
      ${notes.map((n) => `<p style="margin:0 0 8px;font-size:15px;color:#475569;line-height:1.6;">${escapeHtml(n)}</p>`).join('')}
      ${html}
    `),
  })
}
