import { NextResponse } from 'next/server'

// Dev-only route to diagnose Brevo email issues
// Visit: http://localhost:3000/api/test-email
export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Only available in development' }, { status: 403 })
  }

  const apiKey = process.env.BREVO_API_KEY
  const senderEmail = process.env.BREVO_SENDER_EMAIL ?? 'hello@tydio.com'
  const senderName = process.env.BREVO_SENDER_NAME ?? 'Tydio'

  if (!apiKey) {
    return NextResponse.json({ error: 'BREVO_API_KEY not set' }, { status: 500 })
  }

  const payload = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: 'rvrblossom@gmail.com', name: 'Test' }],
    subject: 'Tydio email test',
    htmlContent: '<p>If you see this, Brevo is working!</p>',
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const body = await res.json()

  return NextResponse.json({
    status: res.status,
    ok: res.ok,
    senderUsed: senderEmail,
    brevoResponse: body,
  })
}
