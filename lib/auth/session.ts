import { cache } from 'react'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { currentFingerprint, isSessionCurrent } from '@/lib/auth/sessionFingerprint'

const COOKIE = 'tydio_session'
// "Stay signed in" keeps the cookie for 7 days. Without it the cookie ends when
// the browser closes, and the token lapses after a day in case it's left open.
const REMEMBERED_MAX_AGE = 60 * 60 * 24 * 7 // 7 days
const REMEMBERED_TTL = '7d'
const BROWSER_SESSION_TTL = '1d'

function secret() {
  const key = process.env.JWT_SECRET
  if (!key) throw new Error('JWT_SECRET is not set')
  return new TextEncoder().encode(key)
}

export type SessionPayload = {
  profileId: string
  role: 'USER' | 'TIDYPRO' | 'ADMIN'
  email: string
}

export async function createSession(payload: SessionPayload, { remember = false }: { remember?: boolean } = {}): Promise<void> {
  const pv = await currentFingerprint(payload.profileId)
  if (!pv) throw new Error('Cannot create a session for a missing profile')

  const token = await new SignJWT({ ...payload, pv })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(remember ? REMEMBERED_TTL : BROWSER_SESSION_TTL)
    .sign(secret())

  const store = await cookies()
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    ...(remember && { maxAge: REMEMBERED_MAX_AGE }),
    path: '/',
  })
}

// Cached per request, so a page and its components share one check.
const verifySessionToken = cache(async (token: string): Promise<SessionPayload | null> => {
  let payload: SessionPayload & { pv?: string }
  try {
    payload = (await jwtVerify(token, secret())).payload as unknown as SessionPayload & { pv?: string }
  } catch {
    return null
  }
  if (!(await isSessionCurrent(payload))) return null
  return { profileId: payload.profileId, role: payload.role, email: payload.email }
})

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies()
  const token = store.get(COOKIE)?.value
  if (!token) return null
  return verifySessionToken(token)
}

export async function deleteSession(): Promise<void> {
  const store = await cookies()
  store.delete(COOKIE)
}
