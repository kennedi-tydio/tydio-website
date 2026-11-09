import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

const COOKIE = 'tydio_admin'

// The cookie holds an HMAC of the secret, never the secret itself, so a leaked
// cookie (logs, a shared browser) doesn't reveal the admin password.
export function adminCookieValue(secret: string): string {
  return createHmac('sha256', secret).update('tydio_admin_session').digest('hex')
}

// Constant-time check of a submitted admin password or API secret.
export function isAdminSecret(value: string | null | undefined): boolean {
  const secret = process.env.ADMIN_SECRET
  if (!secret || !value) return false
  const hash = (v: string) => createHmac('sha256', 'tydio_admin_compare').update(v).digest()
  return timingSafeEqual(hash(value), hash(secret))
}

export async function isAdminAuthed(): Promise<boolean> {
  // Read cookies before anything can return early: it's what marks every admin
  // page as rendered per request. Without it, a build where ADMIN_SECRET isn't
  // set would try to prerender admin pages, and their database queries.
  const store = await cookies()
  const secret = process.env.ADMIN_SECRET
  if (!secret) return false
  const value = store.get(COOKIE)?.value
  if (!value) return false
  const expected = Buffer.from(adminCookieValue(secret))
  const actual = Buffer.from(value)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export async function setAdminCookie(): Promise<void> {
  const secret = process.env.ADMIN_SECRET
  if (!secret) throw new Error('ADMIN_SECRET not set')
  const store = await cookies()
  store.set(COOKIE, adminCookieValue(secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 8, // 8 hours
    path: '/',
  })
}

export async function clearAdminCookie(): Promise<void> {
  const store = await cookies()
  store.delete(COOKIE)
}
