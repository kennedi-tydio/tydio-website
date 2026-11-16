import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/auth/admin', () => ({ isAdminAuthed: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/stripe', () => ({ stripe: {} }))
vi.mock('@/lib/marketPricing', () => ({}))
vi.mock('@/lib/cleanerStatus', () => ({ pauseCleaner: vi.fn() }))
vi.mock('@/lib/email', () => ({
  TYDIO_ADMIN_EMAIL: 'kennedicoats@tydioapp.com',
  escapeHtml: (s: string) => s,
  emailShell: (body: string) => body,
  sendEmail: vi.fn(),
}))

import { isAdminAuthed } from '@/lib/auth/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { pauseCleaner } from '@/lib/cleanerStatus'
import { sendEmail } from '@/lib/email'
import { revokeAccessAction } from './actions'

type Matched = { role: string; email: string; first_name: string | null } | null

// Records the profiles update and its filters, and answers with `matched` (the row
// the update hit, or null when nothing matched).
function fakeAdmin(matched: Matched) {
  const update: { values?: Record<string, unknown>; filters: [string, string, unknown][] } = { filters: [] }
  const chain: Record<string, unknown> = {
    update: (values: Record<string, unknown>) => { update.values = values; return chain },
    eq: (column: string, value: unknown) => { update.filters.push(['eq', column, value]); return chain },
    neq: (column: string, value: unknown) => { update.filters.push(['neq', column, value]); return chain },
    select: () => chain,
    maybeSingle: async () => ({ data: matched, error: null }),
  }
  vi.mocked(createAdminClient).mockReturnValue({ from: () => chain } as never)
  return update
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(isAdminAuthed).mockResolvedValue(true)
})

describe('revokeAccessAction', () => {
  it('puts a customer back on the waitlist and emails them', async () => {
    const update = fakeAdmin({ role: 'USER', email: 'ana@example.com', first_name: 'Ana' })
    await revokeAccessAction('u1', new FormData())

    expect(update.values).toEqual({ booking_access_status: 'waitlisted', booking_access_granted_at: null, waitlisted: true })
    expect(update.filters).toEqual(expect.arrayContaining([
      ['eq', 'id', 'u1'],
      ['eq', 'booking_access_status', 'booking_allowed'],
      ['neq', 'role', 'ADMIN'],
    ]))
    expect(pauseCleaner).not.toHaveBeenCalled()

    expect(sendEmail).toHaveBeenCalledTimes(1)
    const [opts] = vi.mocked(sendEmail).mock.calls[0]
    expect(opts.to).toEqual([{ email: 'ana@example.com', name: 'Ana' }])
    expect(opts.subject).toMatch(/waitlist/i)
    expect(opts.htmlContent).toContain('book Tidy Pros')
    expect(opts.htmlContent).toContain('kennedicoats@tydioapp.com')
  })

  it('pauses a Tidy Pro so they stop getting jobs, and emails them', async () => {
    fakeAdmin({ role: 'TIDYPRO', email: 'pro@example.com', first_name: null })
    await revokeAccessAction('p1', new FormData())

    expect(pauseCleaner).toHaveBeenCalledWith(expect.anything(), 'p1')
    const [opts] = vi.mocked(sendEmail).mock.calls[0]
    expect(opts.htmlContent).toContain('take jobs')
    expect(opts.htmlContent).toContain('Hi there')
  })

  it('sends nothing when they had no access to take away (e.g. a double click)', async () => {
    fakeAdmin(null)
    await revokeAccessAction('u1', new FormData())
    expect(sendEmail).not.toHaveBeenCalled()
    expect(pauseCleaner).not.toHaveBeenCalled()
  })

  it('keeps the change when the email fails', async () => {
    fakeAdmin({ role: 'USER', email: 'ana@example.com', first_name: 'Ana' })
    vi.mocked(sendEmail).mockRejectedValue(new Error('Brevo down'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(revokeAccessAction('u1', new FormData())).resolves.toBeUndefined()
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it('does nothing for a caller who is not an admin', async () => {
    vi.mocked(isAdminAuthed).mockResolvedValue(false)
    await revokeAccessAction('u1', new FormData())
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
