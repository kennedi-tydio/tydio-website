import type { createAdminClient } from '@/lib/supabase/admin'
import { TYDIO_ADMIN_EMAIL, emailShell, escapeHtml, sendEmail } from '@/lib/email'
import { detailSection } from '@/lib/bookingIncidentEmail'
import type { ContactInfoKind } from '@/lib/contactInfoFilter'

type Admin = ReturnType<typeof createAdminClient>

// Tells the admin someone tried to send a phone number or email address in a booking chat.
// The message itself was never delivered. A failed send never surfaces to the sender.
export async function emailAdminContactInfoAttempt(
  admin: Admin,
  attempt: { bookingId: string; senderRole: 'USER' | 'TIDYPRO'; body: string; kind: ContactInfoKind }
): Promise<void> {
  try {
    const { data: booking } = await admin
      .from('bookings')
      .select('id, user_id, tidy_pro_id')
      .eq('id', attempt.bookingId)
      .maybeSingle()

    const senderId = attempt.senderRole === 'USER' ? booking?.user_id : booking?.tidy_pro_id
    const recipientId = attempt.senderRole === 'USER' ? booking?.tidy_pro_id : booking?.user_id
    const ids = [senderId, recipientId].filter((id): id is string => !!id)
    const { data: people } = ids.length
      ? await admin.from('profiles').select('id, first_name, last_name, email').in('id', ids)
      : { data: [] }

    const person = (id: string | null | undefined) => people?.find((p) => p.id === id)
    const fullName = (id: string | null | undefined) =>
      [person(id)?.first_name, person(id)?.last_name].filter(Boolean).join(' ') || 'Unknown'

    const senderKind = attempt.senderRole === 'USER' ? 'Customer' : 'Tidy Pro'
    const recipientKind = attempt.senderRole === 'USER' ? 'Tidy Pro' : 'Customer'
    const what = attempt.kind === 'phone' ? 'a phone number' : 'an email address'
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

    await sendEmail({
      to: [{ email: TYDIO_ADMIN_EMAIL }],
      subject: `${senderKind} tried to share ${what} in chat: ${fullName(senderId)}`,
      htmlContent: emailShell(`
        <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">Contact info blocked in chat</h2>
        <p style="margin:0 0 12px;font-size:15px;color:#475569;line-height:1.6;">
          ${escapeHtml(fullName(senderId))} (${senderKind.toLowerCase()}) tried to send ${what} to
          ${escapeHtml(fullName(recipientId))}. The message was not delivered.
        </p>
        ${detailSection('Blocked message', [['Message', attempt.body]])}
        ${detailSection(`Sender (${senderKind})`, [
          ['Name', fullName(senderId)],
          ['Email', person(senderId)?.email],
          ['Profile ID', senderId],
        ])}
        ${detailSection(`Recipient (${recipientKind})`, [
          ['Name', fullName(recipientId)],
          ['Email', person(recipientId)?.email],
          ['Profile ID', recipientId],
        ])}
        ${detailSection('Booking', [
          ['Booking ID', attempt.bookingId],
          ['Admin page', `${siteUrl}/admin/bookings`],
        ])}
      `),
    })
  } catch (err) {
    console.error('[Tydio] Contact info attempt admin email failed:', err)
  }
}
