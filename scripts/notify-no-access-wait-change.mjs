// One-off: tells every Tidy Pro who has signed the Independent Contractor Agreement that
// the "Customer unavailable — no access" wait in Schedule A went from 15 to 10 minutes
// (changed 2026-11-14 without a new agreement version, so nobody re-signs). One email
// per Tidy Pro, so no one sees anyone else's address.
//
//   node --env-file=.env.local scripts/notify-no-access-wait-change.mjs                     # dry run
//   node --env-file=.env.local scripts/notify-no-access-wait-change.mjs --preview=out.html  # dry run + save the email
//   node --env-file=.env.local scripts/notify-no-access-wait-change.mjs --send              # send
import { writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const send = process.argv.includes('--send')
const previewPath = process.argv.find((a) => a.startsWith('--preview='))?.slice('--preview='.length)
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (use --env-file=.env.local).')
  process.exit(1)
}
if (send && !process.env.BREVO_API_KEY) {
  console.error('BREVO_API_KEY must be set to send.')
  process.exit(1)
}

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const escapeHtml = (v) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Same shell as emailShell in lib/email.ts.
function emailShell(body) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:white;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06);">
        <tr><td style="background:#EDFFFF;padding:20px 32px;">
          <img src="${siteUrl}/email-logo.png" alt="Tydio" width="140" height="48" style="display:block;border:0;outline:none;text-decoration:none;font-size:24px;font-weight:800;letter-spacing:-0.5px;color:#38C7CA;" />
        </td></tr>
        <tr><td style="padding:32px;">
          ${body}
        </td></tr>
        <tr><td style="padding:16px 32px 24px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:12px;">Cleaning made simple.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

const P = 'margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;'
const SUBJECT = 'Update to your Tydio agreement: no-access wait is now 10 minutes'

function emailHtml(firstName) {
  return emailShell(`
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">The no-access wait is now 10 minutes</h2>
    <p style="${P}">Hi ${escapeHtml(firstName || 'there')},</p>
    <p style="${P}">
      We&rsquo;ve updated the &ldquo;Customer unavailable or no access&rdquo; section of Schedule A in your Tidy Pro
      Independent Contractor and Platform Agreement. If you arrive at a booking and can&rsquo;t get in, you now wait
      <strong>10 minutes</strong> (instead of 15) after the scheduled start time or your arrival, whichever is later, before you can cancel the booking as &ldquo;Customer unavailable&mdash;no access&rdquo;.
    </p>
    <p style="${P}">Everything else in your agreement, including your pay for no-access bookings, stays the same. You don&rsquo;t need to sign anything again.</p>
    <h3 style="margin:20px 0 8px;font-size:16px;font-weight:700;color:#1a2332;">How it works in the app</h3>
    <ul style="margin:0 0 12px;padding-left:20px;color:#475569;font-size:15px;line-height:1.6;">
      <li>Tap <strong>Unable to access location</strong> under &ldquo;I&rsquo;ve arrived&rdquo;, or on your task list before you&rsquo;ve finished a task.</li>
      <li>A countdown shows how long is left. You can message the customer while you wait, and the countdown will still be there when you come back.</li>
      <li>If you get in, tap <strong>I got access &mdash; continue booking</strong>. If the timer runs out and you still can&rsquo;t get in, you can cancel the booking.</li>
    </ul>
    <p style="${P}">Questions? Just reply to this email.</p>
    <p style="margin:0;color:#475569;font-size:15px;line-height:1.6;">&mdash; The Tydio team</p>
  `)
}

const admin = createClient(url, key, { auth: { persistSession: false } })

const { data: signatures, error: sigError } = await admin.from('agreement_signatures').select('pro_id').not('pro_id', 'is', null)
if (sigError) {
  console.error('Loading agreement signatures failed:', sigError.message)
  process.exit(1)
}
const proIds = [...new Set(signatures.map((s) => s.pro_id))]
if (proIds.length === 0) {
  console.log('No Tidy Pros have signed the agreement. Nothing to send.')
  process.exit(0)
}

const { data: profiles, error: profileError } = await admin
  .from('profiles')
  .select('id, first_name, email, role')
  .in('id', proIds)
  .eq('role', 'TIDYPRO')
if (profileError) {
  console.error('Loading profiles failed:', profileError.message)
  process.exit(1)
}
const recipients = profiles.filter((p) => p.email)

console.log(`${recipients.length} Tidy Pro${recipients.length === 1 ? '' : 's'} with a signed agreement:`)
for (const r of recipients) console.log(`  ${r.first_name ?? '(no first name)'} <${r.email}>`)
console.log(`Subject: ${SUBJECT}`)

if (previewPath) {
  writeFileSync(previewPath, emailHtml(recipients[0]?.first_name ?? 'Alex'))
  console.log(`Preview saved to ${previewPath}`)
}

if (!send) {
  console.log('\nDry run. Re-run with --send to email them.')
  process.exit(0)
}

let failed = 0
for (const r of recipients) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: process.env.BREVO_SENDER_NAME ?? 'Tydio', email: process.env.BREVO_SENDER_EMAIL ?? 'kennedicoats@tydioapp.com' },
      to: [{ email: r.email, name: r.first_name ?? undefined }],
      subject: SUBJECT,
      htmlContent: emailHtml(r.first_name),
    }),
  })
  if (res.ok) {
    console.log(`  sent: ${r.email}`)
  } else {
    failed += 1
    console.error(`  FAILED: ${r.email}`, await res.text().catch(() => ''))
  }
}
console.log(`\nDone. ${recipients.length - failed} sent, ${failed} failed.`)
process.exit(failed > 0 ? 1 : 0)
