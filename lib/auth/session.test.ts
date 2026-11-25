import { beforeEach, describe, expect, it, vi } from 'vitest'
import { decodeJwt } from 'jose'
import { createSession, refreshIdleSession } from './session'

const cookieSet = vi.fn()
const cookieGet = vi.fn()
vi.mock('next/headers', () => ({ cookies: async () => ({ set: cookieSet, get: cookieGet }) }))
vi.mock('@/lib/auth/sessionFingerprint', () => ({ currentFingerprint: async () => 'fp', isSessionCurrent: async () => true }))
const activeBooking = vi.fn(async (..._args: unknown[]) => false)
vi.mock('@/lib/auth/activeBooking', () => ({ hasActiveBooking: (...args: unknown[]) => activeBooking(...args) }))

const payload = { profileId: 'p1', role: 'USER' as const, email: 'a@example.com' }

function issued() {
  const [name, token, options] = cookieSet.mock.calls[0]
  const { iat, exp } = decodeJwt(token)
  return { name, options, lifetime: exp! - iat! }
}

beforeEach(() => {
  cookieSet.mockClear()
  activeBooking.mockReset()
  activeBooking.mockResolvedValue(false)
  process.env.JWT_SECRET = 'test-secret'
})

describe('createSession', () => {
  it('with "Stay signed in", keeps the cookie and token for 30 days', async () => {
    await createSession(payload, { remember: true })
    const { name, options, lifetime } = issued()
    expect(name).toBe('tydio_session')
    expect(options.maxAge).toBe(60 * 60 * 24 * 30)
    expect(lifetime).toBe(60 * 60 * 24 * 30)
  })

  it('without it, the cookie survives the app leaving the screen but lapses after 30 minutes', async () => {
    await createSession(payload)
    const { options, lifetime } = issued()
    expect(options.maxAge).toBe(60 * 30)
    expect(lifetime).toBe(60 * 30)
  })
})

describe('refreshIdleSession', () => {
  async function tokenFor(remember: boolean, issuedSecondsAgo: number) {
    vi.useFakeTimers({ now: Date.now() - issuedSecondsAgo * 1000 })
    await createSession(payload, { remember })
    vi.useRealTimers()
    const token = cookieSet.mock.calls[0][1]
    cookieSet.mockClear()
    cookieGet.mockReturnValue({ value: token })
  }

  it('restarts the 30 minutes on an idle-timeout session', async () => {
    await tokenFor(false, 10 * 60)
    await refreshIdleSession()
    const { options, lifetime } = issued()
    expect(options.maxAge).toBe(60 * 30)
    expect(lifetime).toBe(60 * 30)
    expect(decodeJwt(cookieSet.mock.calls[0][1])).toMatchObject({ profileId: 'p1', pv: 'fp', rm: false })
  })

  it('leaves a "Stay signed in" session alone', async () => {
    await tokenFor(true, 10 * 60)
    await refreshIdleSession()
    expect(cookieSet).not.toHaveBeenCalled()
  })

  it('does nothing once the 30 minutes have run out', async () => {
    await tokenFor(false, 31 * 60)
    await refreshIdleSession()
    expect(cookieSet).not.toHaveBeenCalled()
  })

  it('does nothing with no session', async () => {
    cookieGet.mockReturnValue(undefined)
    await refreshIdleSession()
    expect(cookieSet).not.toHaveBeenCalled()
  })

  it('lasts 12 hours while they have a booking under way', async () => {
    await tokenFor(false, 10 * 60)
    activeBooking.mockResolvedValue(true)
    await refreshIdleSession()
    const { options, lifetime } = issued()
    expect(options.maxAge).toBe(60 * 60 * 12)
    expect(lifetime).toBe(60 * 60 * 12)
    expect(activeBooking).toHaveBeenCalledWith('p1', 'USER')
  })

  it('goes back to 30 minutes once the booking is over', async () => {
    activeBooking.mockResolvedValue(true)
    await tokenFor(false, 10 * 60)
    activeBooking.mockResolvedValue(false)
    await refreshIdleSession()
    expect(issued().lifetime).toBe(60 * 30)
  })

  it('with force, refreshes a session signed in under a minute ago', async () => {
    await tokenFor(false, 5)
    activeBooking.mockResolvedValue(true)
    await refreshIdleSession()
    expect(cookieSet).not.toHaveBeenCalled()
    await refreshIdleSession({ force: true })
    expect(issued().lifetime).toBe(60 * 60 * 12)
  })
})

describe('createSession with a booking under way', () => {
  it('signs in for 12 hours without "Stay signed in"', async () => {
    activeBooking.mockResolvedValue(true)
    await createSession({ profileId: 'pro1', role: 'TIDYPRO', email: 'p@example.com' })
    expect(issued().lifetime).toBe(60 * 60 * 12)
    expect(activeBooking).toHaveBeenCalledWith('pro1', 'TIDYPRO')
  })

  it('still gives 30 days with "Stay signed in", without looking up bookings', async () => {
    activeBooking.mockResolvedValue(true)
    await createSession(payload, { remember: true })
    expect(issued().lifetime).toBe(60 * 60 * 24 * 30)
    expect(activeBooking).not.toHaveBeenCalled()
  })
})
