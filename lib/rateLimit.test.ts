/* eslint-disable @typescript-eslint/no-explicit-any -- test-only chainable Supabase query mock */
import { describe, expect, it, vi } from 'vitest'
import { isRateLimited, recordRateLimitEvent } from './rateLimit'

vi.mock('next/headers', () => ({ headers: vi.fn() }))

function adminWithEvents(events: { key: string; created_at: string }[], error: { message: string } | null = null) {
  return {
    from: () => {
      let matches = events
      const chain: any = {
        select: () => chain,
        eq: (_column: string, key: string) => {
          matches = matches.filter((e) => e.key === key)
          return chain
        },
        gte: async (_column: string, since: string) => ({
          count: error ? null : matches.filter((e) => e.created_at >= since).length,
          error,
        }),
        insert: async (row: { key: string }) => {
          events.push({ key: row.key, created_at: new Date().toISOString() })
          return { error }
        },
      }
      return chain
    },
  } as any
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000).toISOString()
const limit = { limit: 3, windowMinutes: 15 }

describe('isRateLimited', () => {
  it('allows a key until it reaches the limit within the window', async () => {
    const events = [{ key: 'a', created_at: minutesAgo(1) }, { key: 'a', created_at: minutesAgo(2) }]
    const admin = adminWithEvents(events)
    expect(await isRateLimited(admin, 'a', limit)).toBe(false)
    await recordRateLimitEvent(admin, 'a')
    expect(await isRateLimited(admin, 'a', limit)).toBe(true)
  })

  it('ignores attempts outside the window and for other keys', async () => {
    const events = [
      { key: 'a', created_at: minutesAgo(20) },
      { key: 'a', created_at: minutesAgo(30) },
      { key: 'a', created_at: minutesAgo(40) },
      { key: 'b', created_at: minutesAgo(1) },
      { key: 'b', created_at: minutesAgo(1) },
      { key: 'b', created_at: minutesAgo(1) },
    ]
    expect(await isRateLimited(adminWithEvents(events), 'a', limit)).toBe(false)
  })

  it('lets requests through when the check itself fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const admin = adminWithEvents([], { message: 'relation "rate_limit_events" does not exist' })
    expect(await isRateLimited(admin, 'a', limit)).toBe(false)
  })
})
