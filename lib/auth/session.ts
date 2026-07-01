import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const COOKIE = 'tydio_session'
const MAX_AGE = 60 * 60 * 24 * 7 // 7 days

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

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret())

  const store = await cookies()
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE,
    path: '/',
  })
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies()
  const token = store.get(COOKIE)?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, secret())
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

export async function deleteSession(): Promise<void> {
  const store = await cookies()
  store.delete(COOKIE)
}
