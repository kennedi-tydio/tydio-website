// One-off: tells the Tidy Pros named in Amendment No. 1 to the Independent Contractor
// Agreement (lib/legal/agreementAmendments.ts) that it's waiting in the app for them to
// sign. Skips the test signer and anyone who has already signed. One email per Tidy Pro.
//
//   node --env-file=.env.local scripts/notify-amendment-1.mjs                     # dry run
//   node --env-file=.env.local scripts/notify-amendment-1.mjs --preview=out.html  # dry run + save the email
//   node --env-file=.env.local scripts/notify-amendment-1.mjs --send              # send
import { writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// Keep in step with AMENDMENT_1 in lib/legal/agreementAmendments.ts (non-test signers).
const AMENDMENT_VERSION = '2026-11-04.2+amendment-1'
const SIGNER_IDS = ['160e087e-70f6-4d2b-8876-ea9d59367c90', '478e7d80-f3b7-4668-a891-2e9290573bd8']

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

// Always the live site: .env.local points NEXT_PUBLIC_SITE_URL at localhost.
const siteUrl = 'https://tydioapp.com'
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
const SUBJECT = 'Please sign Amendment No. 1 to your Tydio agreement'
const signUrl = `${siteUrl}/pro/onboarding/amendment`

function emailHtml(firstName) {
  return emailShell(`
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">An amendment to your agreement is ready to sign</h2>
    <p style="${P}">Hi ${escapeHtml(firstName || 'there')},</p>
    <p style="${P}">
      We&rsquo;ve added <strong>Amendment No. 1</strong> to your Tidy Pro Independent Contractor and Platform Agreement
      in the Tydio app. It updates two parts of Schedule A:
    </p>
    <ul style="margin:0 0 12px;padding-left:20px;color:#475569;font-size:15px;line-height:1.6;">
      <li><strong>No-access wait:</strong> 10 minutes instead of 15, after the scheduled start time or your arrival, whichever is later.</li>
      <li><strong>Late customer cancellations:</strong> a cancellation counts as late when it&rsquo;s less than 2 hours before the start (instead of 12). You still receive 40% of the Service Price on a late cancellation.</li>
    </ul>
    <p style="${P}">Everything else in your agreement stays the same. The full amendment is in the app for you to read before you sign.</p>
    <p style="${P}">The next time you open the Tidy Pro app, you&rsquo;ll be asked to review and sign it before continuing. It only takes a minute.</p>
    <p style="margin:20px 0;">
      <a href="${signUrl}" style="display:inline-block;background:#38C7CA;color:white;font-weight:600;font-size:15px;text-decoration:none;padding:12px 20px;border-radius:12px;">Review and sign</a>
    </p>
    <p style="${P}">Questions? Just reply to this email.</p>
    <p style="margin:0;color:#475569;font-size:15px;line-height:1.6;">&mdash; The Tydio team</p>
  `)
}

const admin = createClient(url, key, { auth: { persistSession: false } })

const { data: signed, error: sigError } = await admin
  .from('agreement_signatures')
  .select('pro_id')
  .eq('agreement_version', AMENDMENT_VERSION)
  .in('pro_id', SIGNER_IDS)
if (sigError) {
  console.error('Loading amendment signatures failed:', sigError.message)
  process.exit(1)
}
const signedIds = new Set(signed.map((s) => s.pro_id))
const unsignedIds = SIGNER_IDS.filter((id) => !signedIds.has(id))
if (signedIds.size) console.log(`Already signed, skipping: ${[...signedIds].join(', ')}`)
if (unsignedIds.length === 0) {
  console.log('Everyone named has signed. Nothing to send.')
  process.exit(0)
}

const { data: profiles, error: profileError } = await admin.from('profiles').select('id, first_name, email').in('id', unsignedIds)
if (profileError) {
  console.error('Loading profiles failed:', profileError.message)
  process.exit(1)
}
const recipients = profiles.filter((p) => p.email)

console.log(`${recipients.length} Tidy Pro${recipients.length === 1 ? '' : 's'} to email:`)
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
