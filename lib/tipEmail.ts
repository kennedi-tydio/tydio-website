import { emailShell, escapeHtml } from '@/lib/email'

// The "You received a tip!" email to a Tidy Pro, sent with the tip text and push
// (lib/tipPayout.ts) unless they've turned email notifications off.

const P = 'margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;'

export function tipEmailSubject(amount: number): string {
  return `You received a $${amount.toFixed(2)} tip!`
}

export function tipEmailHtml(opts: { firstName: string; amount: number; bookingId: string }): string {
  const name = escapeHtml(opts.firstName || 'there')
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const bookingUrl = `${siteUrl}/pro/bookings/${encodeURIComponent(opts.bookingId)}`

  return emailShell(`
    <h2 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#1a2332;">You received a tip! &#127881;</h2>
    <p style="${P}">Hi ${name},</p>
    <p style="${P}">Your customer just sent you a tip:</p>
    <p style="margin:8px 0 4px;font-size:40px;font-weight:800;color:#38C7CA;">$${opts.amount.toFixed(2)}</p>
    <p style="margin:0 0 20px;color:#1a2332;font-size:16px;font-weight:600;">Keep up the great work!</p>
    <p style="${P}">You keep 100% of your tips. It's sent to your payout account with your earnings.</p>
    <a href="${bookingUrl}"
       style="display:inline-block;margin:8px 0 20px;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">
      View booking
    </a>
    <p style="margin:0;color:#94a3b8;font-size:13px;">
      You received this because a customer tipped you on Tydio. You can turn off email notifications in your profile.
    </p>`)
}
