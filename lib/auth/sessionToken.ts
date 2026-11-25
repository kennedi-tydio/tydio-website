import { SignJWT } from 'jose'

export const SESSION_COOKIE = 'tydio_session'

// "Stay signed in" keeps someone signed in for 30 days.
export const REMEMBERED_MAX_AGE = 60 * 60 * 24 * 30
// Without it they stay signed in until they've been away for 30 minutes. The
// cookie is persistent (not a browser-session cookie) because phones, and the
// home-screen app especially, drop session cookies as soon as the app leaves
// the screen. SessionKeepAlive restarts the 30 minutes while they're active.
export const IDLE_MAX_AGE = 60 * 30
// While they have a booking under way (lib/auth/activeBooking), the session
// lasts this long instead, so it outlasts a long cleaning with the phone put
// away. The next refresh after the booking ends goes back to 30 minutes.
export const ACTIVE_BOOKING_MAX_AGE = 60 * 60 * 12
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

// How long a session lasts: 30 days with "Stay signed in", otherwise 30
// minutes, or 12 hours while they have a booking under way.
export function sessionMaxAge(remember: boolean, activeBooking = false): number {
  if (remember) return REMEMBERED_MAX_AGE
  return activeBooking ? ACTIVE_BOOKING_MAX_AGE : IDLE_MAX_AGE
}

export async function signSessionToken(claims: SessionClaims, maxAge = sessionMaxAge(claims.rm)): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(sessionSecret())
}

export function sessionCookieOptions(remember: boolean, maxAge = sessionMaxAge(remember)) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge,
    path: '/',
  }
}
