import { createHash } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import { sendEmail, emailShell, escapeHtml } from '@/lib/email'

// The "You're on the waitlist" email sent when someone signs up from outside
// our service area. People who left the marketing box unticked get a link to
// opt in to Tydio updates instead, so they hear from us before we launch near them.

const OPT_IN_TTL = '365d' // a waitlist can last a while

// Separate from the session key, so this token can't be used as a session.
function optInKey(): Uint8Array {
  const key = process.env.JWT_SECRET
  if (!key) throw new Error('JWT_SECRET is not set')
  return createHash('sha256').update(`${key}|marketing-opt-in`).digest()
}

export async function createMarketingOptInToken(profileId: string): Promise<string> {
  return new SignJWT({ typ: 'marketing-opt-in', pid: profileId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(OPT_IN_TTL)
    .sign(optInKey())
}

// The profile id the link was made for, or null if it's forged or expired.
export async function readMarketingOptInToken(token: string | null | undefined): Promise<string | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, optInKey())
    return payload.typ === 'marketing-opt-in' && typeof payload.pid === 'string' ? payload.pid : null
  } catch {
    return null
  }
}

export async function marketingOptInUrl(profileId: string): Promise<string> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  return `${siteUrl}/email-updates?token=${encodeURIComponent(await createMarketingOptInToken(profileId))}`
}

export async function waitlistEmailHtml(opts: {
  firstName: string
  profileId: string
  marketingOptedIn: boolean
}): Promise<string> {
  const updates = opts.marketingOptedIn
    ? `<p style="margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;">
         You&rsquo;re also signed up for Tydio emails, so you&rsquo;ll hear our news while you wait.
       </p>`
    : `<p style="margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;">
         Want to stay updated about Tydio until we launch in your area?
       </p>
       <a href="${await marketingOptInUrl(opts.profileId)}"
          style="display:inline-block;margin:8px 0 20px;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">
         Click here to sign up for emails
       </a>`

  return emailShell(`
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">You&rsquo;re on the waitlist, ${escapeHtml(opts.firstName || 'there')}!</h2>
    <p style="margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;">
      Thanks for signing up. Tydio isn&rsquo;t available in your area yet, but we&rsquo;ve saved your spot
      and we&rsquo;ll email you as soon as we launch near you.
    </p>
    ${updates}
    <p style="margin:0;color:#94a3b8;font-size:13px;">
      You received this because you created a Tydio account.
    </p>
  `)
}

// Best-effort: a failed send never blocks the signup.
export async function sendWaitlistEmail(opts: {
  email: string
  firstName: string
  profileId: string
  marketingOptedIn: boolean
}): Promise<void> {
  try {
    await sendEmail({
      to: [{ email: opts.email, name: opts.firstName || undefined }],
      subject: "You're on the Tydio waitlist",
      htmlContent: await waitlistEmailHtml(opts),
    })
  } catch (err) {
    console.error('[Tydio] Waitlist email failed:', err)
  }
}
