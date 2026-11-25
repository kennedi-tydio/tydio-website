import { cache } from 'react'
import { jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { currentFingerprint, isSessionCurrent } from '@/lib/auth/sessionFingerprint'
import { hasActiveBooking } from '@/lib/auth/activeBooking'
import {
  IDLE_REFRESH_AFTER,
  SESSION_COOKIE,
  sessionCookieOptions,
  sessionMaxAge,
  sessionSecret,
  signSessionToken,
  type SessionClaims,
} from '@/lib/auth/sessionToken'

export type SessionPayload = {
  profileId: string
  role: 'USER' | 'TIDYPRO' | 'ADMIN'
  email: string
}

// "Stay signed in" keeps the session for 30 days. Without it the session ends
// once they've been away for 30 minutes (see sessionToken.ts and proxy.ts),
// except while they have a booking under way (lib/auth/activeBooking).
export async function createSession(payload: SessionPayload, { remember = false }: { remember?: boolean } = {}): Promise<void> {
  const pv = await currentFingerprint(payload.profileId)
  if (!pv) throw new Error('Cannot create a session for a missing profile')

  const maxAge = sessionMaxAge(remember, !remember && (await hasActiveBooking(payload.profileId, payload.role)))
  const token = await signSessionToken({ ...payload, pv, rm: remember }, maxAge)
  const store = await cookies()
  store.set(SESSION_COOKIE, token, sessionCookieOptions(remember, maxAge))
}

// Cached per request, so a page and its components share one check.
const verifySessionToken = cache(async (token: string): Promise<SessionPayload | null> => {
  let payload: SessionPayload & { pv?: string }
  try {
    payload = (await jwtVerify(token, sessionSecret())).payload as unknown as SessionPayload & { pv?: string }
  } catch {
    return null
  }
  if (!(await isSessionCurrent(payload))) return null
  return { profileId: payload.profileId, role: payload.role, email: payload.email }
})

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  return verifySessionToken(token)
}

export async function deleteSession(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

// Restarts the 30 minutes on a session without "Stay signed in" (12 hours
// while they have a booking under way). Leaves remembered sessions, sessions
// from before the rm claim existed, and ended sessions (password reset, ban)
// alone. `force` skips the once-a-minute limit: used right after a Tidy Pro
// starts a booking, so the longer session starts before they put the phone away.
export async function refreshIdleSession({ force = false }: { force?: boolean } = {}): Promise<void> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return
  let claims: Partial<SessionClaims> & { iat?: number }
  try {
    claims = (await jwtVerify(token, sessionSecret())).payload as typeof claims
  } catch {
    return
  }
  if (claims.rm !== false || !claims.profileId || !claims.role || !claims.email || !claims.pv) return
  if (!force && Math.floor(Date.now() / 1000) - (claims.iat ?? 0) < IDLE_REFRESH_AFTER) return
  if (!(await isSessionCurrent(claims))) return

  const maxAge = sessionMaxAge(false, await hasActiveBooking(claims.profileId, claims.role))
  const fresh = await signSessionToken({ profileId: claims.profileId, role: claims.role, email: claims.email, pv: claims.pv, rm: false }, maxAge)
  store.set(SESSION_COOKIE, fresh, sessionCookieOptions(false, maxAge))
}
