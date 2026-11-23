import { emailShell, escapeHtml } from '@/lib/email'
import { describePromoDiscount, describeUsesPerCustomer, type PromoDiscount } from '@/lib/promoCodes'

export type PromoEmailInput = PromoDiscount & {
  code: string
  firstName: string | null
  expiresAt: string | null
  maxUsesPerCustomer: number | null
  // The admin's own words, shown above the code.
  message: string
}

export function promoEmailSubject(promo: PromoDiscount): string {
  return `Your Tydio promo code: ${describePromoDiscount(promo)} your next booking`
}

function expiryLabel(expiresAt: string): string {
  return new Date(expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })
}

export function promoEmailHtml(input: PromoEmailInput): string {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const greeting = input.firstName ? `Hi ${escapeHtml(input.firstName)},` : 'Hi there,'
  const message = input.message.trim()
    ? `<p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.6;">${escapeHtml(input.message.trim()).replace(/\n/g, '<br/>')}</p>`
    : ''

  return emailShell(`
    <p style="margin:0 0 16px;color:#0f172a;font-size:16px;font-weight:600;">${greeting}</p>
    ${message}
    <p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.6;">
      Here&rsquo;s <strong>${escapeHtml(describePromoDiscount(input))}</strong> your next Tydio booking. Enter this code in the
      Promo code field when you review your request:
    </p>
    <p style="margin:0 0 20px;text-align:center;">
      <span style="display:inline-block;padding:12px 24px;border:2px dashed #38C7CA;border-radius:12px;font-size:22px;font-weight:800;letter-spacing:2px;color:#0f172a;">${escapeHtml(input.code)}</span>
    </p>
    <p style="margin:0 0 20px;color:#64748b;font-size:13px;text-align:center;">${input.expiresAt ? `Use it by ${expiryLabel(input.expiresAt)}. ` : ''}${describeUsesPerCustomer(input.maxUsesPerCustomer)}.</p>
    <p style="margin:0 0 8px;text-align:center;">
      <a href="${siteUrl}/dashboard" style="display:inline-block;background:#38C7CA;color:white;text-decoration:none;font-weight:700;font-size:15px;padding:12px 28px;border-radius:12px;">Book a cleaning</a>
    </p>
  `)
}
