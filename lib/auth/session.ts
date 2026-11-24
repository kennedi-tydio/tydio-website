import { cache } from 'react'
import { jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { currentFingerprint, isSessionCurrent } from '@/lib/auth/sessionFingerprint'
import {
  IDLE_REFRESH_AFTER,
  SESSION_COOKIE,
  sessionCookieOptions,
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
// once they've been away for 30 minutes (see sessionToken.ts and proxy.ts).
export async function createSession(payload: SessionPayload, { remember = false }: { remember?: boolean } = {}): Promise<void> {
  const pv = await currentFingerprint(payload.profileId)
  if (!pv) throw new Error('Cannot create a session for a missing profile')

  const token = await signSessionToken({ ...payload, pv, rm: remember })
  const store = await cookies()
  store.set(SESSION_COOKIE, token, sessionCookieOptions(remember))
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

// Restarts the 30 minutes on a session without "Stay signed in". Leaves
// remembered sessions, sessions from before the rm claim existed, and ended
// sessions (password reset, ban) alone.
export async function refreshIdleSession(): Promise<void> {
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
  if (Math.floor(Date.now() / 1000) - (claims.iat ?? 0) < IDLE_REFRESH_AFTER) return
  if (!(await isSessionCurrent(claims))) return

  const fresh = await signSessionToken({ profileId: claims.profileId, role: claims.role, email: claims.email, pv: claims.pv, rm: false })
  store.set(SESSION_COOKIE, fresh, sessionCookieOptions(false))
}
