/* eslint-disable @typescript-eslint/no-explicit-any -- test-only chainable Supabase query mock */
import { describe, expect, it } from 'vitest'
import { BANNED_MESSAGE, isBanned, normalizePhone } from './bannedUsers'

function adminWithBans(bans: { email: string; phones: string[] }[]) {
  return {
    from: () => {
      let matches = bans
      const chain: any = {
        select: () => chain,
        eq: (_column: string, email: string) => {
          matches = matches.filter((b) => b.email === email)
          return chain
        },
        contains: (_column: string, [phone]: string[]) => {
          matches = matches.filter((b) => b.phones.includes(phone))
          return chain
        },
        limit: async () => ({ data: matches }),
      }
      return chain
    },
  } as any
}

describe('normalizePhone', () => {
  it('treats the same number in any format as equal', () => {
    expect(normalizePhone('+1 (555) 123-4567')).toBe('5551234567')
    expect(normalizePhone('555-123-4567')).toBe('5551234567')
  })
})

describe('isBanned', () => {
  const admin = adminWithBans([{ email: 'banned@example.com', phones: ['5551234567'] }])

  it('matches on email, ignoring case and spaces', async () => {
    expect(await isBanned(admin, { email: ' Banned@Example.com ' })).toBe(true)
  })

  it('matches on phone in any format, even with a different email', async () => {
    expect(await isBanned(admin, { email: 'new@example.com', phone: '+1 (555) 123-4567' })).toBe(true)
  })

  it('does not match anyone else', async () => {
    expect(await isBanned(admin, { email: 'new@example.com', phone: '5550000000' })).toBe(false)
    expect(await isBanned(admin, {})).toBe(false)
  })
})

describe('BANNED_MESSAGE', () => {
  it('says how to appeal', () => {
    expect(BANNED_MESSAGE).toContain('kennedicoats@tydioapp.com')
  })
})
