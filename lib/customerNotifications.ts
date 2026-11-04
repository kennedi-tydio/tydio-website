import type { createAdminClient } from '@/lib/supabase/admin'
import { emailShell, escapeHtml, sendEmail } from '@/lib/email'
import type { NotificationPayload } from '@/lib/notifications'
import { canSendSms, sendSmsForPayload } from '@/lib/sms'
import { sendPushForPayload } from '@/lib/push'

type Admin = ReturnType<typeof createAdminClient>

// Every notification to a customer goes through here, so each one reaches them by text,
// push, and email alike. A failure on one channel never stops the others, or the action
// that triggered it. Text needs their opt-in. Email is on unless they've turned it off,
// and is for booking updates, so chat messages pass `email: false`.
export async function notifyCustomer(
  admin: Admin,
  customerId: string,
  payload: NotificationPayload,
  { email = true }: { email?: boolean } = {}
): Promise<void> {
  const { data: customer } = await admin
    .from('profiles')
    .select('email, first_name, phone, sms_consent, email_notifications_enabled')
    .eq('id', customerId)
    .maybeSingle()

  if (canSendSms(customer?.sms_consent ?? null, customer?.phone ?? null)) {
    await sendSmsForPayload(customer!.phone!, payload).catch((err) => console.error('Customer SMS failed', err))
  }

  await sendPushForPayload(customerId, payload).catch((err) => console.error('Customer push failed', err))

  if (email && customer?.email && customer.email_notifications_enabled !== false) {
    await sendEmail({
      to: [{ email: customer.email, name: customer.first_name ?? undefined }],
      subject: payload.title,
      htmlContent: emailShell(`
        <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">${escapeHtml(payload.title)}</h2>
        <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.6;">${escapeHtml(payload.body)}</p>
        <a href="${escapeHtml(payload.url)}" style="display:inline-block;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">Open Tydio</a>
      `),
    }).catch((err) => console.error('Customer email failed', err))
  }
}
