/* eslint-disable @typescript-eslint/no-explicit-any -- test-only chainable Supabase query mock */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/email', () => ({
  TYDIO_ADMIN_EMAIL: 'admin@example.com',
  sendEmail: vi.fn(async () => {}),
  emailShell: (body: string) => body,
  escapeHtml: (value: string) => value,
}))
vi.mock('@/lib/accountDeletion', () => ({ deleteOwnAccount: vi.fn() }))
vi.mock('@/lib/accountSuspension', () => ({ suspendAccounts: vi.fn(), unsuspendAccounts: vi.fn() }))

import { sendEmail } from '@/lib/email'
import { deleteOwnAccount } from '@/lib/accountDeletion'
import { suspendAccounts, unsuspendAccounts } from '@/lib/accountSuspension'
import {
  BanAppealError,
  acceptAppeal,
  appealDeadline,
  banAccount,
  banAndDeleteNow,
  canAppeal,
  deleteExpiredBans,
  denyAppeal,
  submitAppeal,
} from './banAccount'

type Query = { table: string; op: 'select' | 'insert' | 'update' | 'delete'; values?: any; filters: string[] }

// Records every query, and answers each one with `respond` (or an empty result).
function fakeAdmin(respond: (q: Query) => { data?: unknown; error?: unknown } = () => ({})) {
  const queries: Query[] = []
  const admin = {
    from: (table: string) => {
      const q: Query = { table, op: 'select', filters: [] }
      queries.push(q)
      const done = async () => ({ data: null, error: null, ...respond(q) })
      const chain: any = {
        select: () => chain,
        insert: (values: unknown) => { q.op = 'insert'; q.values = values; return chain },
        update: (values: unknown) => { q.op = 'update'; q.values = values; return chain },
        delete: () => { q.op = 'delete'; return chain },
        eq: (c: string, v: unknown) => { q.filters.push(`${c}=${v}`); return chain },
        is: (c: string, v: unknown) => { q.filters.push(`${c} is ${v}`); return chain },
        or: (expr: string) => { q.filters.push(`or ${expr}`); return chain },
        limit: done,
        maybeSingle: done,
        single: done,
        then: (resolve: (v: unknown) => void) => done().then(resolve),
      }
      return chain
    },
  }
  return { admin: admin as any, queries }
}

const NOW = new Date('2026-11-10T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString()

const PENDING_APPEAL = {
  id: 'ban-1',
  email: 'ana@example.com',
  first_name: 'Ana',
  former_profile_id: 'u1',
  banned_at: daysAgo(2),
  appeal_submitted_at: daysAgo(1),
  appeal_denied_at: null,
  account_deleted_at: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

describe('canAppeal', () => {
  const ban = { banned_at: daysAgo(6), appeal_submitted_at: null, account_deleted_at: null }

  it('allows one appeal within 7 days of the ban', () => {
    expect(canAppeal(ban, NOW)).toBe(true)
    expect(canAppeal({ ...ban, appeal_submitted_at: daysAgo(1) }, NOW)).toBe(false)
  })

  it('closes once the window passes or the account is gone', () => {
    expect(canAppeal({ ...ban, banned_at: daysAgo(8) }, NOW)).toBe(false)
    expect(canAppeal({ ...ban, account_deleted_at: daysAgo(1) }, NOW)).toBe(false)
  })

  it('puts the deadline 7 days after the ban', () => {
    expect(appealDeadline(daysAgo(7)).toISOString()).toBe(NOW.toISOString())
  })
})

const BANNED_PROFILE = { email: ' Ana@Example.com ', first_name: 'Ana', last_name: 'Lee', phone: '+1 (555) 123-4567' }

function respondToBan(opts: { proPhone?: string; alreadyBanned?: boolean } = {}) {
  return (q: Query) => {
    if (q.table === 'profiles') return { data: BANNED_PROFILE }
    if (q.table === 'tidypro_profiles') return { data: opts.proPhone ? { phone: opts.proPhone } : null }
    if (q.op === 'insert') return { data: { id: 'ban-1', banned_at: NOW.toISOString() } }
    return { data: opts.alreadyBanned ? [{ id: 'ban-0' }] : [] }
  }
}

describe('banAccount', () => {

  it('records the ban with an appeal link, suspends the account and emails them, without deleting anything', async () => {
    const { admin, queries } = fakeAdmin(respondToBan({ proPhone: '555-123-4567' }))

    await banAccount(admin, 'u1', 'Harassment')

    const insert = queries.find(q => q.op === 'insert')!
    expect(insert.values).toMatchObject({
      email: 'ana@example.com',
      phones_normalized: ['5551234567'],
      note: 'Harassment',
      former_profile_id: 'u1',
      appeal_token: expect.stringMatching(/^[0-9a-f]{64}$/),
    })
    // banned_at is what ends their sessions.
    expect(queries.find(q => q.table === 'profiles' && q.op === 'update')).toMatchObject({
      values: { banned_at: NOW.toISOString() },
      filters: ['id=u1'],
    })
    expect(suspendAccounts).toHaveBeenCalledWith(admin, ['u1'])
    expect(deleteOwnAccount).not.toHaveBeenCalled()

    const email = vi.mocked(sendEmail).mock.calls[0][0]
    expect(email.to).toEqual([{ email: ' Ana@Example.com ', name: 'Ana' }])
    expect(email.htmlContent).toContain(`/appeal?token=${insert.values.appeal_token}`)
    expect(email.htmlContent).toContain('Harassment')
  })

  it('refuses someone who is already banned, changing nothing', async () => {
    const { admin, queries } = fakeAdmin(respondToBan({ alreadyBanned: true }))
    await expect(banAccount(admin, 'u1', null)).rejects.toThrow('This user is already banned.')
    expect(queries.some(q => q.op === 'insert' || q.op === 'update')).toBe(false)
    expect(suspendAccounts).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('refuses an account that no longer exists', async () => {
    const { admin } = fakeAdmin()
    await expect(banAccount(admin, 'gone', null)).rejects.toThrow('no longer exists')
  })
})

describe('banAndDeleteNow', () => {
  it('bans with the appeal already closed, then deletes the account', async () => {
    vi.mocked(deleteOwnAccount).mockResolvedValue({ success: true })
    const { admin, queries } = fakeAdmin(respondToBan())

    expect(await banAndDeleteNow(admin, 'p1', 'Not passed', { fee_amount_cents: 3500 })).toEqual({ deleted: true })
    expect(queries.find(q => q.op === 'insert')?.values).toMatchObject({
      former_profile_id: 'p1',
      note: 'Not passed',
      fee_amount_cents: 3500,
      appeal_denied_at: NOW.toISOString(),
    })
    expect(deleteOwnAccount).toHaveBeenCalledWith(admin, 'p1')
    expect(queries.filter(q => q.table === 'banned_users' && q.op === 'update').map(q => q.values)).toEqual([
      { account_deleted_at: NOW.toISOString() },
    ])
    expect(sendEmail).not.toHaveBeenCalled()
  })
})

describe('submitAppeal', () => {
  const openBan = { ...PENDING_APPEAL, appeal_submitted_at: null }

  it('saves the appeal', async () => {
    const { admin, queries } = fakeAdmin(q => (q.op === 'select' ? { data: openBan } : {}))
    await submitAppeal(admin, 'tok', '  It was a misunderstanding.  ')
    const update = queries.find(q => q.op === 'update')!
    expect(update.values).toEqual({ appeal_message: 'It was a misunderstanding.', appeal_submitted_at: NOW.toISOString() })
    expect(update.filters).toContain('appeal_submitted_at is null')
  })

  it.each([
    ['an empty message', openBan, '   ', 'Please tell us why'],
    ['an unknown token', null, 'Please', 'invalid'],
    ['a second appeal', PENDING_APPEAL, 'Again', 'already sent'],
    ['a late appeal', { ...openBan, banned_at: daysAgo(8) }, 'Late', 'has passed'],
  ])('refuses %s', async (_label, ban, message, error) => {
    const { admin, queries } = fakeAdmin(q => (q.op === 'select' ? { data: ban } : {}))
    const attempt = submitAppeal(admin, 'tok', message)
    await expect(attempt).rejects.toBeInstanceOf(BanAppealError)
    await expect(attempt).rejects.toThrow(error)
    expect(queries.some(q => q.op === 'update')).toBe(false)
  })
})

describe('acceptAppeal', () => {
  it('lifts the ban, reinstates the account and emails them', async () => {
    const { admin, queries } = fakeAdmin(q => (q.op === 'select' ? { data: PENDING_APPEAL } : {}))
    await acceptAppeal(admin, 'ban-1')
    expect(queries.find(q => q.op === 'delete')?.filters).toEqual(['id=ban-1'])
    expect(queries.find(q => q.table === 'profiles' && q.op === 'update')?.values).toEqual({ banned_at: null })
    expect(unsuspendAccounts).toHaveBeenCalledWith(admin, ['u1'])
    expect(vi.mocked(sendEmail).mock.calls[0][0].subject).toMatch(/reinstated/)
  })

  it('refuses an appeal that was already decided', async () => {
    const { admin } = fakeAdmin(q => (q.op === 'select' ? { data: { ...PENDING_APPEAL, appeal_denied_at: daysAgo(0) } } : {}))
    await expect(acceptAppeal(admin, 'ban-1')).rejects.toThrow('already been decided')
    expect(unsuspendAccounts).not.toHaveBeenCalled()
  })
})

describe('denyAppeal', () => {
  it('keeps the ban, deletes the account and emails them', async () => {
    vi.mocked(deleteOwnAccount).mockResolvedValue({ success: true })
    const { admin, queries } = fakeAdmin(q => (q.op === 'select' ? { data: PENDING_APPEAL } : {}))

    expect(await denyAppeal(admin, 'ban-1')).toEqual({ deleted: true })
    const updates = queries.filter(q => q.op === 'update').map(q => q.values)
    expect(updates).toEqual([{ appeal_denied_at: NOW.toISOString() }, { account_deleted_at: NOW.toISOString() }])
    expect(deleteOwnAccount).toHaveBeenCalledWith(admin, 'u1')
    expect(vi.mocked(sendEmail).mock.calls[0][0].htmlContent).toContain('have been permanently deleted')
  })

  it('leaves the account for a later retry when an open booking blocks deletion', async () => {
    vi.mocked(deleteOwnAccount).mockResolvedValue({ error: 'open bookings' })
    const { admin, queries } = fakeAdmin(q => (q.op === 'select' ? { data: PENDING_APPEAL } : {}))

    expect(await denyAppeal(admin, 'ban-1')).toEqual({ deleted: false, deleteError: 'open bookings' })
    expect(queries.filter(q => q.op === 'update').map(q => q.values)).toEqual([{ appeal_denied_at: NOW.toISOString() }])
    expect(vi.mocked(sendEmail).mock.calls[0][0].htmlContent).toContain('will be permanently deleted')
  })
})

describe('deleteExpiredBans', () => {
  it('deletes every ban past day 7 (appeal pending or not) and denied appeals, holding any still blocked', async () => {
    vi.mocked(deleteOwnAccount).mockImplementation(async (_admin, id) => (id === 'u2' ? { error: 'open bookings' } : { success: true }))
    const { admin, queries } = fakeAdmin(q =>
      q.op === 'select' ? { data: [{ id: 'ban-1', former_profile_id: 'u1' }, { id: 'ban-2', former_profile_id: 'u2' }] } : {}
    )

    expect(await deleteExpiredBans(admin, NOW)).toEqual({ deleted: 1, held: 1 })
    expect(queries[0].filters).toEqual([
      'account_deleted_at is null',
      `or banned_at.lt.${daysAgo(7)},appeal_denied_at.not.is.null`,
    ])
    expect(queries.filter(q => q.op === 'update').map(q => q.filters)).toEqual([['id=ban-1']])
  })
})
