import { sendEmail, emailShell, escapeHtml } from '@/lib/email'
import { isGeorgiaZip } from '@/lib/georgiaZip'

// The "Welcome to Tydio" email, sent once per in-area account: after email
// verification for password signups (app/verify-email/route.ts), or straight
// away for Google signups. Out-of-area signups get the waitlist email instead.
//
// Every highlight below is something the app does today (or is clearly marked
// coming soon). Check the copy against the product when features change.

type Role = 'USER' | 'TIDYPRO' | 'ADMIN'
type Highlight = { title: string; text: string }

const P = 'margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;'
const H3 = 'margin:20px 0 8px;font-size:16px;font-weight:700;color:#1a2332;'

// Task types customers can book today: lib/entireHome.ts, lib/laundry.ts,
// lib/petTasks.ts, and the examples in app/components/Pricing.tsx.
const CUSTOMER_TASKS: Highlight[] = [
  { title: 'Baseboards, windows, and floors', text: 'for one room or your entire home.' },
  { title: 'Laundry', text: 'wash, dry, fold, and ironing.' },
  { title: 'Any room in the house', text: 'wipe down counters, scrub the tub, and other specific jobs.' },
  { title: 'Pet care chores', text: 'litter boxes and pet enclosures.' },
]

const CUSTOMER_COMING_SOON = 'standard and deep cleanings for your whole home.'

const CUSTOMER_HIGHLIGHTS: Highlight[] = [
  { title: 'Pick your Tidy Pro', text: 'browse local, background-checked pros rated by real customers.' },
  { title: 'Flat, upfront pricing', text: 'pay only for the tasks you choose, with nothing hidden.' },
  { title: 'No contracts, ever', text: 'book once or every week, and cancel anytime.' },
]

// Only ever describe what the Tidy Pro keeps, never Tydio's share.
const PRO_HIGHLIGHTS: Highlight[] = [
  { title: 'Set your own schedule', text: 'choose your weekly hours and block off time whenever you need it.' },
  { title: 'Offer the services you want', text: "choose your services and how far you'll travel." },
  { title: 'Know the job before you go', text: 'customers list every task up front, with clear pay and no surprise upsells.' },
  { title: 'Keep 80% of every job, plus 100% of your tips', text: 'paid straight to your bank account.' },
  { title: 'Message customers in the app', text: 'no need to share your personal number.' },
]

// A table, not a <ul>: list styling is unreliable across email clients (Outlook).
function highlightsHtml(heading: string, items: Highlight[]): string {
  const rows = items
    .map(
      (h) => `
        <tr>
          <td valign="top" style="width:24px;padding:0 0 10px;color:#38C7CA;font-size:15px;font-weight:700;line-height:1.6;">&#10003;</td>
          <td valign="top" style="padding:0 0 10px;color:#475569;font-size:15px;line-height:1.6;">
            <strong style="color:#1a2332;">${escapeHtml(h.title)}</strong>: ${escapeHtml(h.text)}
          </td>
        </tr>`
    )
    .join('')
  return `
    <h3 style="${H3}">${escapeHtml(heading)}</h3>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">${rows}
    </table>`
}

function comingSoonHtml(text: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 12px;">
      <tr><td style="background:#EDFFFF;border-radius:12px;padding:12px 16px;color:#1a2332;font-size:14px;line-height:1.6;">
        <strong>Coming soon:</strong> ${escapeHtml(text)}
      </td></tr>
    </table>`
}

export function welcomeEmailSubject(firstName: string): string {
  return firstName ? `Welcome to Tydio, ${firstName}!` : 'Welcome to Tydio!'
}

export function welcomeEmailHtml(opts: { firstName: string; role: Role }): string {
  const name = escapeHtml(opts.firstName || 'there')
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const isPro = opts.role === 'TIDYPRO'

  const body = isPro
    ? `
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">Welcome to the Tydio team, ${name}!</h2>
      <p style="${P}">Thanks for applying to be a Tidy Pro.</p>
      ${highlightsHtml('What you get as a Tidy Pro', PRO_HIGHLIGHTS)}
      <h3 style="${H3}">What happens next</h3>
      <p style="${P}">
        We&rsquo;re bringing Tidy Pros on a few at a time during early access. We&rsquo;ll email you as
        soon as your account is approved so you can finish onboarding: your profile, background check,
        and payout setup.
      </p>`
    : `
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">Welcome to Tydio, ${name}!</h2>
      <p style="${P}">Thanks for joining Tydio.</p>
      ${highlightsHtml('What you can book', CUSTOMER_TASKS)}
      ${comingSoonHtml(CUSTOMER_COMING_SOON)}
      ${highlightsHtml("Why you'll love Tydio", CUSTOMER_HIGHLIGHTS)}
      <h3 style="${H3}">What happens next</h3>
      <p style="${P}">
        We&rsquo;re letting customers in a few at a time during early access. You&rsquo;re on the list,
        and we&rsquo;ll email you as soon as you can book your first cleaning.
      </p>
      <p style="${P}">
        <strong>While you wait</strong>, sign in and finish your home profile (pets, entry instructions)
        so your first booking takes less time.
      </p>`

  return emailShell(`
    ${body}
    <a href="${siteUrl}/login"
       style="display:inline-block;margin:8px 0 20px;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">
      Sign in to Tydio
    </a>
    <p style="${P}">Questions? Just reply to this email.</p>
    <p style="margin:0;color:#94a3b8;font-size:13px;">
      You received this because you created a Tydio account.
    </p>
  `)
}

// Best-effort: a failed send never blocks signup or verification. Only Georgia
// accounts are welcomed; everyone else already got the waitlist email.
export async function sendWelcomeEmail(opts: {
  email: string
  firstName: string
  role: Role
  zip: string | null | undefined
}): Promise<void> {
  if (!isGeorgiaZip(opts.zip)) return
  try {
    await sendEmail({
      to: [{ email: opts.email, name: opts.firstName || undefined }],
      subject: welcomeEmailSubject(opts.firstName),
      htmlContent: welcomeEmailHtml(opts),
    })
  } catch (err) {
    console.error('[Tydio] Welcome email failed:', err)
  }
}
