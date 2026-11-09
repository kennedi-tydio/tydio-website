/* eslint-disable @typescript-eslint/no-explicit-any -- test-only chainable Supabase query mock */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  emailShell: (body: string) => body,
  escapeHtml: (value: string) => value,
  TYDIO_ADMIN_EMAIL: 'admin@example.com',
}))

import { sendEmail } from '@/lib/email'
import { acceptanceRate, checkAcceptanceRate, formatAcceptanceRate, isAcceptanceRateLow } from './acceptanceRate'

const email = vi.mocked(sendEmail)

describe('acceptanceRate', () => {
  it('is the share of answered requests that were accepted', () => {
    expect(acceptanceRate({ accepted: 7, declined: 3 })).toBe(0.7)
    expect(acceptanceRate({ accepted: 0, declined: 0 })).toBeNull()
  })

  it('formats as a whole percent, rounded down', () => {
    expect(formatAcceptanceRate({ accepted: 7, declined: 3 })).toBe('70%')
    expect(formatAcceptanceRate({ accepted: 399, declined: 101 })).toBe('79%')
    expect(formatAcceptanceRate({ accepted: 0, declined: 0 })).toBe('—')
  })
})

describe('isAcceptanceRateLow', () => {
  it('flags a rate under 80%', () => {
    expect(isAcceptanceRateLow({ accepted: 7, declined: 3 })).toBe(true)
  })

  it('does not flag exactly 80%', () => {
    expect(isAcceptanceRateLow({ accepted: 8, declined: 2 })).toBe(false)
  })

  it('waits for enough answers before judging', () => {
    expect(isAcceptanceRateLow({ accepted: 1, declined: 3 })).toBe(false)
    expect(isAcceptanceRateLow({ accepted: 2, declined: 3 })).toBe(true)
  })
})

function fakeAdmin({ stats, claimed = true, alerted = false }: { stats: { accepted: number; declined: number } | null; claimed?: boolean; alerted?: boolean }) {
  const updates: any[] = []
  const admin = {
    from: (table: string) => {
      let update: any = null
      const filters: string[] = []
      const chain: any = {
        select: () => chain,
        update: (values: any) => {
          update = values
          updates.push(values)
          return chain
        },
        eq: () => chain,
        in: () => chain,
        is: (col: string) => {
          filters.push(`is:${col}`)
          return chain
        },
        not: (col: string) => {
          filters.push(`not:${col}`)
          return chain
        },
        maybeSingle: () => Promise.resolve({ data: { email: 'pro@example.com', first_name: 'Nia', last_name: 'T' }, error: null }),
        then: (resolve: any) => {
          if (table === 'tidypro_acceptance_stats') {
            return resolve({
              data: stats ? [{ tidy_pro_id: 'p1', accepted_count: stats.accepted, declined_count: stats.declined }] : [],
              error: null,
            })
          }
          // Clearing only matches a cleaner who was alerted; claiming only one who wasn't.
          const matches = update?.low_acceptance_alerted_at === null ? alerted : claimed
          return resolve({ data: matches ? [{ id: 'p1' }] : [], error: null })
        },
      }
      return chain
    },
  }
  return { admin: admin as any, updates }
}

beforeEach(() => email.mockClear())

describe('checkAcceptanceRate', () => {
  it('emails the cleaner and the admin the first time the rate drops below 80%', async () => {
    const { admin, updates } = fakeAdmin({ stats: { accepted: 7, declined: 3 } })
    expect(await checkAcceptanceRate(admin, 'p1')).toBe('alerted')
    expect(updates[0].low_acceptance_alerted_at).toEqual(expect.any(String))
    const recipients = email.mock.calls.map((c) => c[0].to[0].email).sort()
    expect(recipients).toEqual(['admin@example.com', 'pro@example.com'])
    expect(email.mock.calls.find((c) => c[0].to[0].email === 'pro@example.com')![0].htmlContent).toContain('3 of 10')
  })

  it('does not email again while the rate stays low', async () => {
    const { admin } = fakeAdmin({ stats: { accepted: 6, declined: 4 }, claimed: false })
    expect(await checkAcceptanceRate(admin, 'p1')).toBeNull()
    expect(email).not.toHaveBeenCalled()
  })

  it('clears the alert once the rate is back up, so the next dip emails again', async () => {
    const { admin, updates } = fakeAdmin({ stats: { accepted: 8, declined: 2 }, alerted: true })
    expect(await checkAcceptanceRate(admin, 'p1')).toBe('cleared')
    expect(updates).toEqual([{ low_acceptance_alerted_at: null }])
    expect(email).not.toHaveBeenCalled()
  })

  it('does nothing for a cleaner with no answered requests', async () => {
    const { admin } = fakeAdmin({ stats: null })
    expect(await checkAcceptanceRate(admin, 'p1')).toBeNull()
    expect(email).not.toHaveBeenCalled()
  })

  it('never throws, even if an email fails', async () => {
    email.mockRejectedValueOnce(new Error('down'))
    const { admin } = fakeAdmin({ stats: { accepted: 1, declined: 9 } })
    await expect(checkAcceptanceRate(admin, 'p1')).resolves.toBe('alerted')
  })
})
