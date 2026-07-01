import { cookies } from 'next/headers'

const COOKIE = 'tydio_admin'

export async function isAdminAuthed(): Promise<boolean> {
  const secret = process.env.ADMIN_SECRET
  if (!secret) return false
  const store = await cookies()
  return store.get(COOKIE)?.value === secret
}

export async function setAdminCookie(): Promise<void> {
  const secret = process.env.ADMIN_SECRET
  if (!secret) throw new Error('ADMIN_SECRET not set')
  const store = await cookies()
  store.set(COOKIE, secret, {
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
