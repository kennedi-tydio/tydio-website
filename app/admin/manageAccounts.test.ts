import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/auth/admin', () => ({ isAdminAuthed: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/stripe', () => ({ stripe: {} }))
vi.mock('@/lib/marketPricing', () => ({}))
vi.mock('@/lib/accountSuspension', () => ({ suspendAccounts: vi.fn(), unsuspendAccounts: vi.fn() }))
vi.mock('@/lib/accountBookingCancellation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/accountBookingCancellation')>()),
  cancelBookingsForAccounts: vi.fn(),
}))
vi.mock('@/lib/accountDeletion', () => ({
  OPEN_BOOKINGS_MESSAGE: 'open-bookings',
  UNPAID_PAYOUT_MESSAGE: 'unpaid-payout',
  deleteOwnAccount: vi.fn(),
}))
vi.mock('@/lib/backgroundCheckAppeals', () => ({ acceptBackgroundCheckAppeal: vi.fn(), denyBackgroundCheckAppeal: vi.fn() }))
vi.mock('@/lib/banAccount', () => ({
  BAN_APPEAL_DAYS: 7,
  ALREADY_BANNED_MESSAGE: 'This user is already banned.',
  liftBan: vi.fn(),
  BanAppealError: class extends Error {},
  banAccount: vi.fn(),
  acceptAppeal: vi.fn(),
  denyAppeal: vi.fn(),
}))

import { isAdminAuthed } from '@/lib/auth/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { suspendAccounts, unsuspendAccounts } from '@/lib/accountSuspension'
import { deleteOwnAccount } from '@/lib/accountDeletion'
import { banAccount } from '@/lib/banAccount'
import { cancelBookingsForAccounts } from '@/lib/accountBookingCancellation'
import { manageAccountsAction } from './actions'

type Profile = { id: string; role: string; first_name: string | null; last_name: string | null; email: string }

const PROFILES: Profile[] = [
  { id: 'u1', role: 'USER', first_name: 'Ana', last_name: 'Lee', email: 'ana@example.com' },
  { id: 'p1', role: 'TIDYPRO', first_name: null, last_name: null, email: 'pro@example.com' },
  { id: 'a1', role: 'ADMIN', first_name: 'Ad', last_name: 'Min', email: 'admin@example.com' },
]

function request(intent: string, ids: string[], note?: string): FormData {
  const fd = new FormData()
  fd.set('intent', intent)
  if (note !== undefined) fd.set('note', note)
  for (const id of ids) fd.append('ids', id)
  return fd
}

const loggedDeletions: unknown[] = []
const NOTHING_CANCELLED = { cancelled: 0, released: 0, inProgress: 0, failed: 0 }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(isAdminAuthed).mockResolvedValue(true)
  loggedDeletions.length = 0
  vi.mocked(cancelBookingsForAccounts).mockResolvedValue(NOTHING_CANCELLED)
  vi.mocked(createAdminClient).mockReturnValue({
    from: () => ({
      select: () => ({
        in: async (_column: string, ids: string[]) => ({ data: PROFILES.filter(p => ids.includes(p.id)), error: null }),
      }),
      insert: async (row: unknown) => { loggedDeletions.push(row); return { error: null } },
    }),
  } as never)
})

describe('manageAccountsAction', () => {
  it('rejects unauthorized callers without touching the database', async () => {
    vi.mocked(isAdminAuthed).mockResolvedValue(false)
    expect(await manageAccountsAction({}, request('delete', ['u1']))).toEqual({ error: 'Unauthorized' })
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('requires a known intent and at least one account', async () => {
    expect(await manageAccountsAction({}, request('erase', ['u1']))).toEqual({ error: 'Unknown action.' })
    expect(await manageAccountsAction({}, request('suspend', []))).toEqual({ error: 'Select at least one account.' })
  })

  it('suspends the selection, skipping admin accounts', async () => {
    vi.mocked(suspendAccounts).mockResolvedValue(2)
    const result = await manageAccountsAction({}, request('suspend', ['u1', 'p1', 'a1', 'u1']))
    expect(suspendAccounts).toHaveBeenCalledWith(expect.anything(), ['u1', 'p1'], { notify: true })
    expect(result).toEqual({ message: 'Suspended 2 accounts and emailed each one. Skipped 1 admin account.' })
  })

  it('cancels the suspended accounts’ upcoming bookings and says what happened', async () => {
    vi.mocked(suspendAccounts).mockResolvedValue(1)
    vi.mocked(cancelBookingsForAccounts).mockResolvedValue({ cancelled: 0, released: 2, inProgress: 1, failed: 0 })
    const result = await manageAccountsAction({}, request('suspend', ['p1']))
    expect(cancelBookingsForAccounts).toHaveBeenCalledWith(expect.anything(), ['p1'], 'suspend')
    expect(result.message).toBe(
      "Suspended 1 account and emailed them. Took the Tidy Pro off 2 upcoming bookings or requests, as if they'd canceled: customers can choose someone else, or are refunded in full if it's too late. 1 job already under way was left for you to settle."
    )
  })

  it('refuses when only admin accounts are selected', async () => {
    const result = await manageAccountsAction({}, request('suspend', ['a1']))
    expect(result.error).toMatch(/No accounts to change/)
    expect(suspendAccounts).not.toHaveBeenCalled()
  })

  it('reminds the admin that unsuspended Tidy Pros stay paused', async () => {
    vi.mocked(unsuspendAccounts).mockResolvedValue(1)
    const result = await manageAccountsAction({}, request('unsuspend', ['p1']))
    expect(result.message).toBe('Unsuspended 1 account. Tidy Pros stay paused until you approve them.')
  })

  it('deletes what it can and names the accounts it had to leave', async () => {
    vi.mocked(deleteOwnAccount).mockImplementation(async (_admin, id) =>
      id === 'u1' ? { error: 'open-bookings' } : { success: true }
    )
    const result = await manageAccountsAction({}, request('delete', ['u1', 'p1']))
    expect(deleteOwnAccount).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ error: "Deleted 1 account. Couldn't delete 1: Ana Lee (open bookings)." })
    expect(loggedDeletions).toEqual([
      { former_profile_id: 'p1', email: 'pro@example.com', first_name: null, last_name: null, role: 'TIDYPRO' },
    ])
  })

  it('reports a clean bulk delete as a success', async () => {
    vi.mocked(deleteOwnAccount).mockResolvedValue({ success: true })
    expect(await manageAccountsAction({}, request('delete', ['u1', 'p1']))).toEqual({ message: 'Deleted 2 accounts.' })
  })

  it('bans each account with the given reason, skipping admins', async () => {
    vi.mocked(banAccount).mockResolvedValue({ cancelled: 1, released: 0, inProgress: 0, failed: 0 })
    const result = await manageAccountsAction({}, request('ban', ['u1', 'p1', 'a1'], '  Fraud  '))
    expect(banAccount).toHaveBeenCalledWith(expect.anything(), 'u1', 'Fraud')
    expect(banAccount).toHaveBeenCalledWith(expect.anything(), 'p1', 'Fraud')
    expect(banAccount).toHaveBeenCalledTimes(2)
    expect(result.message).toMatch(/^Banned 2 accounts\./)
    expect(result.message).toContain('Canceled 2 upcoming bookings or requests, each with a full refund.')
    expect(result.message).toContain('Skipped 1 admin account.')
  })

  it('says a single user is already banned, as an error', async () => {
    vi.mocked(banAccount).mockRejectedValue(new Error('This user is already banned.'))
    expect(await manageAccountsAction({}, request('ban', ['u1']))).toEqual({ error: 'This user is already banned.' })
  })

  it('names the accounts in a bulk ban that were already banned or failed', async () => {
    vi.mocked(banAccount).mockImplementation(async (_admin, id) => {
      if (id === 'u1') throw new Error('This user is already banned.')
      if (id === 'p1') throw new Error('boom')
      return NOTHING_CANCELLED
    })
    const result = await manageAccountsAction({}, request('ban', ['u1', 'p1'], '   '))
    expect(banAccount).toHaveBeenCalledWith(expect.anything(), 'u1', null)
    expect(result.error).toMatch(/^Banned 0 accounts\./)
    expect(result.error).toContain("Couldn't ban 2: Ana Lee (This user is already banned.), pro@example.com (boom).")
  })
})
