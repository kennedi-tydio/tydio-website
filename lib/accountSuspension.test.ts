/* eslint-disable @typescript-eslint/no-explicit-any -- test-only chainable Supabase query mock */
import { describe, expect, it } from 'vitest'
import { SUSPENDED_PAUSE_REASON, suspendAccounts, unsuspendAccounts } from './accountSuspension'

// Records each query's table, update payload and filters, and answers updates on
// profiles with the given rows (as if those were the rows that matched).
function fakeAdmin(matchedProfiles: { id: string; role: string }[]) {
  const queries: { table: string; update?: Record<string, unknown>; filters: [string, string, unknown][] }[] = []
  const admin = {
    from: (table: string) => {
      const query: (typeof queries)[number] = { table, filters: [] }
      queries.push(query)
      const result = { data: table === 'profiles' ? matchedProfiles : null, error: null }
      const chain: any = {
        update: (values: Record<string, unknown>) => { query.update = values; return chain },
        select: () => chain,
        in: (column: string, value: unknown) => { query.filters.push(['in', column, value]); return chain },
        neq: (column: string, value: unknown) => { query.filters.push(['neq', column, value]); return chain },
        is: (column: string, value: unknown) => { query.filters.push(['is', column, value]); return chain },
        not: (column: string, op: string, value: unknown) => { query.filters.push(['not', column, `${op} ${value}`]); return chain },
        then: (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve),
      }
      return chain
    },
  }
  return { admin: admin as any, queries }
}

describe('suspendAccounts', () => {
  it('suspends only accounts that are not admins and not already suspended', async () => {
    const { admin, queries } = fakeAdmin([{ id: 'u1', role: 'USER' }])
    expect(await suspendAccounts(admin, ['u1', 'u2'])).toBe(1)

    const [profiles] = queries
    expect(profiles.table).toBe('profiles')
    expect(profiles.update).toEqual({ suspended_at: expect.any(String) })
    expect(profiles.filters).toEqual(
      expect.arrayContaining([
        ['in', 'id', ['u1', 'u2']],
        ['neq', 'role', 'ADMIN'],
        ['is', 'suspended_at', null],
      ])
    )
  })

  it('pauses suspended Tidy Pros so job offers stop reaching them', async () => {
    const { admin, queries } = fakeAdmin([{ id: 'u1', role: 'USER' }, { id: 'p1', role: 'TIDYPRO' }])
    await suspendAccounts(admin, ['u1', 'p1'])

    const pros = queries.find(q => q.table === 'tidypro_profiles')
    expect(pros?.update).toMatchObject({ cleaner_status: 'paused', active_for_booking: false, pause_reason: SUSPENDED_PAUSE_REASON })
    expect(pros?.filters).toEqual([['in', 'id', ['p1']]])
  })

  it('leaves Tidy Pro profiles alone when only customers are suspended', async () => {
    const { admin, queries } = fakeAdmin([{ id: 'u1', role: 'USER' }])
    await suspendAccounts(admin, ['u1'])
    expect(queries.some(q => q.table === 'tidypro_profiles')).toBe(false)
  })

  it('does nothing for an empty selection', async () => {
    const { admin, queries } = fakeAdmin([])
    expect(await suspendAccounts(admin, [])).toBe(0)
    expect(queries).toHaveLength(0)
  })
})

describe('unsuspendAccounts', () => {
  it('clears suspended_at and leaves Tidy Pros paused', async () => {
    const { admin, queries } = fakeAdmin([{ id: 'p1', role: 'TIDYPRO' }])
    expect(await unsuspendAccounts(admin, ['p1'])).toBe(1)
    expect(queries).toHaveLength(1)
    expect(queries[0].update).toEqual({ suspended_at: null })
  })
})
