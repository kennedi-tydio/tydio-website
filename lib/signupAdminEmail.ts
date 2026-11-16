import { TYDIO_ADMIN_EMAIL, sendEmail, emailShell, escapeHtml } from '@/lib/email'

// Tells the admin someone signed up (customer or Tidy Pro), so new accounts
// don't go unseen. A failed send never blocks the signup itself.
export async function emailAdminSignup(signup: {
  role: 'USER' | 'TIDYPRO' | 'ADMIN'
  firstName: string
  lastName: string
  email: string
  phone: string | null
  zip: string
  inServiceArea: boolean
}): Promise<void> {
  const plainName = `${signup.firstName} ${signup.lastName}`.trim()
  const kind = signup.role === 'TIDYPRO' ? 'Tidy Pro' : 'customer'
  const outOfArea = signup.inServiceArea
    ? ''
    : '<p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">Their ZIP code is outside the service area, so they were added to the waitlist.</p>'

  await sendEmail({
    to: [{ email: TYDIO_ADMIN_EMAIL }],
    subject: `New ${kind} signup: ${plainName}`,
    htmlContent: emailShell(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">New ${kind} signup</h2>
      <p style="margin:0 0 12px;font-size:15px;color:#475569;line-height:1.6;">
        ${escapeHtml(plainName)} created a ${kind} account.
      </p>
      <p style="margin:0 0 12px;font-size:14px;color:#475569;line-height:1.6;">
        Name: ${escapeHtml(plainName)}<br/>
        Email: <a href="mailto:${escapeHtml(signup.email)}">${escapeHtml(signup.email)}</a><br/>
        ${signup.phone ? `Phone: ${escapeHtml(signup.phone)}<br/>` : ''}
        ZIP code: ${escapeHtml(signup.zip)}
      </p>
      ${outOfArea}
    `),
  }).catch((err) => console.error('[Tydio] Signup admin email failed:', err))
}
