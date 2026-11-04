import { headers } from 'next/headers'
import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

export type RateLimit = { limit: number; windowMinutes: number }

export const RATE_LIMITS = {
  // Failed attempts only, so a customer who types their password right is never slowed down.
  loginPerAccount: { limit: 10, windowMinutes: 15 },
  loginPerIp: { limit: 50, windowMinutes: 15 },
  adminLoginPerIp: { limit: 5, windowMinutes: 15 },
  signupPerIp: { limit: 10, windowMinutes: 60 },
  // Each of these sends an email through Brevo.
  emailPerAddress: { limit: 3, windowMinutes: 60 },
  emailPerIp: { limit: 10, windowMinutes: 60 },
  // Each estimate is an OpenAI call.
  taskEstimatePerUser: { limit: 100, windowMinutes: 60 },
  // Each masked call is two paid Twilio call legs.
  maskedCallPerBooking: { limit: 1, windowMinutes: 1 },
} satisfies Record<string, RateLimit>

export const RATE_LIMITED_MESSAGE = 'Too many attempts. Please wait a few minutes and try again.'

// Whether `key` has used up its limit. If the check itself fails (database
// down, table missing) the request is let through: a broken limiter must never
// lock real customers out.
export async function isRateLimited(admin: Admin, key: string, { limit, windowMinutes }: RateLimit): Promise<boolean> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString()
  const { count, error } = await admin
    .from('rate_limit_events')
    .select('id', { count: 'exact', head: true })
    .eq('key', key)
    .gte('created_at', since)
  if (error) {
    console.error('[Tydio] Rate limit check failed:', error.message)
    return false
  }
  return (count ?? 0) >= limit
}

export async function recordRateLimitEvent(admin: Admin, key: string): Promise<void> {
  const { error } = await admin.from('rate_limit_events').insert({ key })
  if (error) console.error('[Tydio] Rate limit record failed:', error.message)
}

// For actions that send an email to an address someone typed in (reset password,
// resend verification): caps sends per address and per caller, and counts this
// request toward both. Every request counts, found account or not, so the limit
// doesn't reveal which addresses have accounts.
export async function allowEmailSend(admin: Admin, kind: string, email: string): Promise<boolean> {
  const addressKey = `${kind}:email:${email}`
  const ipKey = `${kind}:ip:${await clientIp()}`
  if (
    (await isRateLimited(admin, addressKey, RATE_LIMITS.emailPerAddress)) ||
    (await isRateLimited(admin, ipKey, RATE_LIMITS.emailPerIp))
  ) {
    return false
  }
  await Promise.all([recordRateLimitEvent(admin, addressKey), recordRateLimitEvent(admin, ipKey)])
  return true
}

// The caller's IP as set by the host's proxy (Vercel puts the client first in
// x-forwarded-for). Falls back to one shared bucket when there's no header, as
// in local development.
export async function clientIp(): Promise<string> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown'
}
