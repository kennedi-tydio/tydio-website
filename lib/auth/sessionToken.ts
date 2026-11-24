import { SignJWT } from 'jose'

export const SESSION_COOKIE = 'tydio_session'

// "Stay signed in" keeps someone signed in for 30 days.
export const REMEMBERED_MAX_AGE = 60 * 60 * 24 * 30
// Without it they stay signed in until they've been away for 30 minutes. The
// cookie is persistent (not a browser-session cookie) because phones, and the
// home-screen app especially, drop session cookies as soon as the app leaves
// the screen. SessionKeepAlive restarts the 30 minutes while they're active.
export const IDLE_MAX_AGE = 60 * 30
// Don't re-sign more than once a minute; that's plenty to stay inside 30.
export const IDLE_REFRESH_AFTER = 60

export function sessionSecret() {
  const key = process.env.JWT_SECRET
  if (!key) throw new Error('JWT_SECRET is not set')
  return new TextEncoder().encode(key)
}

// rm = remembered. Tokens issued before this claim existed have no rm and are
// left to expire on their own terms.
export type SessionClaims = {
  profileId: string
  role: 'USER' | 'TIDYPRO' | 'ADMIN'
  email: string
  pv: string
  rm: boolean
}

export async function signSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${claims.rm ? REMEMBERED_MAX_AGE : IDLE_MAX_AGE}s`)
    .sign(sessionSecret())
}

export function sessionCookieOptions(remember: boolean) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: remember ? REMEMBERED_MAX_AGE : IDLE_MAX_AGE,
    path: '/',
  }
}
