import { beforeEach, describe, expect, it, vi } from 'vitest'
import { decodeJwt } from 'jose'
import { createSession } from './session'

const cookieSet = vi.fn()
vi.mock('next/headers', () => ({ cookies: async () => ({ set: cookieSet }) }))
vi.mock('@/lib/auth/sessionFingerprint', () => ({ currentFingerprint: async () => 'fp', isSessionCurrent: async () => true }))

const payload = { profileId: 'p1', role: 'USER' as const, email: 'a@example.com' }

function issued() {
  const [name, token, options] = cookieSet.mock.calls[0]
  const { iat, exp } = decodeJwt(token)
  return { name, options, lifetime: exp! - iat! }
}

beforeEach(() => {
  cookieSet.mockClear()
  process.env.JWT_SECRET = 'test-secret'
})

describe('createSession', () => {
  it('with "Stay signed in", keeps the cookie and token for 7 days', async () => {
    await createSession(payload, { remember: true })
    const { name, options, lifetime } = issued()
    expect(name).toBe('tydio_session')
    expect(options.maxAge).toBe(60 * 60 * 24 * 7)
    expect(lifetime).toBe(60 * 60 * 24 * 7)
  })

  it('without it, the cookie ends with the browser and the token lapses after a day', async () => {
    await createSession(payload)
    const { options, lifetime } = issued()
    expect(options).not.toHaveProperty('maxAge')
    expect(lifetime).toBe(60 * 60 * 24)
  })
})
