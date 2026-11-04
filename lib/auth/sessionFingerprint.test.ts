/* eslint-disable @typescript-eslint/no-explicit-any -- test-only chainable Supabase query mock */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSessionCurrent, passwordFingerprint } from './sessionFingerprint'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

let profiles: Record<string, string | null>
let banned: Set<string>

beforeEach(() => {
  profiles = { p1: '$2b$12$original' }
  banned = new Set()
  vi.mocked(createAdminClient).mockReturnValue({
    from: () => {
      let id = ''
      const chain: any = {
        select: () => chain,
        eq: (_column: string, value: string) => { id = value; return chain },
        maybeSingle: async () => ({
          data: id in profiles ? { password_hash: profiles[id], banned_at: banned.has(id) ? '2026-01-01T00:00:00Z' : null } : null,
        }),
      }
      return chain
    },
  } as any)
})

describe('isSessionCurrent', () => {
  it('accepts a session signed in with the current password', async () => {
    expect(await isSessionCurrent({ profileId: 'p1', pv: passwordFingerprint('$2b$12$original') })).toBe(true)
  })

  it('ends the session once the password changes', async () => {
    const pv = passwordFingerprint('$2b$12$original')
    profiles.p1 = '$2b$12$reset'
    expect(await isSessionCurrent({ profileId: 'p1', pv })).toBe(false)
  })

  it('ends the session once the profile is gone (deleted or banned)', async () => {
    const pv = passwordFingerprint('$2b$12$original')
    delete profiles.p1
    expect(await isSessionCurrent({ profileId: 'p1', pv })).toBe(false)
  })

  it('ends the session while the account is banned, and accepts it again once lifted', async () => {
    const pv = passwordFingerprint('$2b$12$original')
    banned.add('p1')
    expect(await isSessionCurrent({ profileId: 'p1', pv })).toBe(false)
    banned.delete('p1')
    expect(await isSessionCurrent({ profileId: 'p1', pv })).toBe(true)
  })

  it('refuses tokens issued before fingerprints existed', async () => {
    expect(await isSessionCurrent({ profileId: 'p1' })).toBe(false)
  })

  it('never puts the hash itself in the token', () => {
    expect(passwordFingerprint('$2b$12$original')).not.toContain('$2b$')
  })
})
