/* eslint-disable @typescript-eslint/no-explicit-any -- test-only chainable Supabase query mock */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(async () => {}),
  emailShell: (body: string) => body,
  escapeHtml: (value: string) => value,
}))
vi.mock('@/lib/banAccount', () => ({ banAndDeleteNow: vi.fn() }))
vi.mock('@/lib/backgroundCheck', () => ({
  BackgroundCheckStateError: class extends Error {},
  emailAdminDecision: vi.fn(async () => {}),
  passBackgroundCheck: vi.fn(async () => {}),
}))

import { sendEmail } from '@/lib/email'
import { banAndDeleteNow } from '@/lib/banAccount'
import { emailAdminDecision, passBackgroundCheck } from '@/lib/backgroundCheck'
import {
  acceptBackgroundCheckAppeal,
  denyBackgroundCheckAppeal,
  expireBackgroundCheckDenials,
  submitBackgroundCheckAppeal,
} from './backgroundCheckAppeals'

type Query = { table: string; op: 'select' | 'update'; values?: any; filters: string[] }

function fakeAdmin(respond: (q: Query) => { data?: unknown } = () => ({})) {
  const queries: Query[] = []
  const admin = {
    from: (table: string) => {
      const q: Query = { table, op: 'select', filters: [] }
      queries.push(q)
      const done = async () => ({ data: null, error: null, ...respond(q) })
      const chain: any = {
        select: () => chain,
        update: (values: unknown) => { q.op = 'update'; q.values = values; return chain },
        eq: (c: string, v: unknown) => { q.filters.push(`${c}=${v}`); return chain },
        is: (c: string, v: unknown) => { q.filters.push(`${c} is ${v}`); return chain },
        lt: (c: string, v: unknown) => { q.filters.push(`${c}<${v}`); return chain },
        maybeSingle: done,
        then: (resolve: (v: unknown) => void) => done().then(resolve),
      }
      return chain
    },
  }
  return { admin: admin as any, queries }
}

const NOW = new Date('2026-11-10T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString()
const PRO = { email: 'pro@example.com', first_name: 'Nia', last_name: 'T' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

describe('submitBackgroundCheckAppeal', () => {
  it('saves one appeal within the window', async () => {
    const { admin, queries } = fakeAdmin(q => (q.op === 'select' ? { data: { pro_id: 'p1', denied_at: daysAgo(3), appeal_submitted_at: null } } : {}))
    await submitBackgroundCheckAppeal(admin, 'tok', ' The report mixed me up with someone else. ')
    const update = queries.find(q => q.op === 'update')!
    expect(update.values).toEqual({ appeal_message: 'The report mixed me up with someone else.', appeal_submitted_at: NOW.toISOString() })
    expect(update.filters).toEqual(['pro_id=p1', 'appeal_submitted_at is null'])
  })

  it.each([
    ['an unknown or closed denial', null, 'invalid'],
    ['a second appeal', { pro_id: 'p1', denied_at: daysAgo(3), appeal_submitted_at: daysAgo(1) }, 'already sent'],
    ['a late appeal', { pro_id: 'p1', denied_at: daysAgo(8), appeal_submitted_at: null }, 'has passed'],
  ])('refuses %s', async (_label, denial, error) => {
    const { admin, queries } = fakeAdmin(q => (q.op === 'select' ? { data: denial } : {}))
    await expect(submitBackgroundCheckAppeal(admin, 'tok', 'Please')).rejects.toThrow(error)
    expect(queries.some(q => q.op === 'update')).toBe(false)
  })
})

describe('acceptBackgroundCheckAppeal', () => {
  it('passes the check and clears the denial', async () => {
    const { admin, queries } = fakeAdmin(q =>
      q.op === 'select' ? { data: { pro_id: 'p1', denied_at: daysAgo(3), denial_reason: 'x', appeal_submitted_at: daysAgo(1) } } : {}
    )
    await acceptBackgroundCheckAppeal(admin, 'p1')
    expect(passBackgroundCheck).toHaveBeenCalledWith(admin, 'p1')
    expect(queries.find(q => q.op === 'update')?.values).toMatchObject({ denied_at: null, appeal_token: null })
  })

  it('needs an appeal to accept', async () => {
    const { admin } = fakeAdmin(q => (q.op === 'select' ? { data: { pro_id: 'p1', denied_at: daysAgo(3), appeal_submitted_at: null } } : {}))
    await expect(acceptBackgroundCheckAppeal(admin, 'p1')).rejects.toThrow('already been decided')
    expect(passBackgroundCheck).not.toHaveBeenCalled()
  })
})

describe('denyBackgroundCheckAppeal', () => {
  it('bans the cleaner and deletes the account, keeping the fee for reference', async () => {
    vi.mocked(banAndDeleteNow).mockResolvedValue({ deleted: true })
    const denial = { pro_id: 'p1', denied_at: daysAgo(3), denial_reason: 'Not passed', appeal_submitted_at: daysAgo(1) }
    const { admin } = fakeAdmin(q => {
      if (q.table === 'profiles') return { data: PRO }
      return { data: { ...denial, fee_amount_cents: 3500, stripe_payment_intent_id: 'pi_1' } }
    })

    expect(await denyBackgroundCheckAppeal(admin, 'p1')).toEqual({ deleted: true })
    expect(banAndDeleteNow).toHaveBeenCalledWith(admin, 'p1', 'Not passed', { fee_amount_cents: 3500, stripe_payment_intent_id: 'pi_1' })
    expect(vi.mocked(sendEmail).mock.calls[0][0].htmlContent).toContain('We reviewed your appeal')
    expect(emailAdminDecision).toHaveBeenCalledWith(PRO, 'banned', 'Not passed')
  })
})

describe('expireBackgroundCheckDenials', () => {
  it('bans every cleaner whose denial is past day 7, and stops a held-up one being picked up again', async () => {
    vi.mocked(banAndDeleteNow).mockImplementation(async (_admin, id) => (id === 'p2' ? { deleted: false, deleteError: 'unpaid' } : { deleted: true }))
    const due = [
      { pro_id: 'p1', denied_at: daysAgo(8), denial_reason: 'r', appeal_submitted_at: null },
      { pro_id: 'p2', denied_at: daysAgo(9), denial_reason: 'r', appeal_submitted_at: daysAgo(5) },
    ]
    const { admin, queries } = fakeAdmin(q => {
      if (q.table === 'profiles') return { data: PRO }
      if (q.op === 'select' && q.filters.some(f => f.startsWith('denied_at<'))) return { data: due }
      return { data: {} }
    })

    expect(await expireBackgroundCheckDenials(admin, NOW)).toEqual({ banned: 2, failed: 0 })
    expect(queries[0].filters).toEqual([`denied_at<${daysAgo(7)}`])
    expect(queries.filter(q => q.op === 'update')).toEqual([
      { table: 'background_checks', op: 'update', values: { denied_at: null }, filters: ['pro_id=p2'] },
    ])
  })
})
