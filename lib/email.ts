const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email'

type EmailOptions = {
  to: { email: string; name?: string }[]
  subject: string
  htmlContent: string
}

export async function sendEmail(opts: EmailOptions): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) throw new Error('BREVO_API_KEY is not set')

  const res = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: {
        name: process.env.BREVO_SENDER_NAME ?? 'Tydio',
        email: process.env.BREVO_SENDER_EMAIL ?? 'hello@tydio.com',
      },
      ...opts,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Email send failed: ${JSON.stringify(err)}`)
  }
}

// ── Shared HTML shell ─────────────────────────────────────────────────────────

export function emailShell(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:white;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06);">
        <!-- Header -->
        <tr><td style="background:#EDFFFF;padding:20px 32px;">
          <span style="font-size:24px;font-weight:800;letter-spacing:-0.5px;color:#38C7CA;">Tydio</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          ${body}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 32px 24px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:12px;">Cleaning, tailored to your to-do list.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
