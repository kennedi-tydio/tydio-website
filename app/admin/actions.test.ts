/* eslint-disable @typescript-eslint/no-explicit-any -- test-only chainable Supabase query mock */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/auth/admin', () => ({
  isAdminAuthed: vi.fn(),
  setAdminCookie: vi.fn(),
  clearAdminCookie: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(),
  emailShell: vi.fn(),
  escapeHtml: (value: string) => value,
  TYDIO_ADMIN_EMAIL: 'admin@example.com',
}))
vi.mock('@/lib/marketPricing', () => ({ researchAreaMarketPrice: vi.fn() }))
vi.mock('@/lib/stripe', () => ({ stripe: { refunds: { create: vi.fn() } } }))

import { isAdminAuthed } from '@/lib/auth/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import { sendEmail, emailShell } from '@/lib/email'
import {
  approveInsuranceAction,
  decideBackgroundCheckAction,
  refundBackgroundCheckFeeAction,
  markScreeningSentAction,
  sendBackgroundCheckFollowUpAction,
} from './actions'
import {
  activateStatePricingAction,
  createStatePriceAction,
  deactivateStatePricingAction,
  updateStatePriceAction,
} from './actions'

function chainable(result: any): any {
  const obj: any = {}
  const self = () => obj
  obj.select = self
  obj.insert = vi.fn(self)
  obj.update = vi.fn(self)
  obj.eq = self
  obj.single = () => Promise.resolve(result)
  obj.maybeSingle = () => Promise.resolve(result)
  obj.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject)
  return obj
}

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const mockedIsAdminAuthed = vi.mocked(isAdminAuthed)
const mockedCreateAdminClient = vi.mocked(createAdminClient)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('State Pricing admin actions — authorization', () => {
  it('createStatePriceAction rejects unauthorized callers without touching the database', async () => {
    mockedIsAdminAuthed.mockResolvedValue(false)
    const result = await createStatePriceAction({}, formData({ state: 'GA', median_four_hour_price: '150' }))
    expect(result).toEqual({ error: 'Unauthorized' })
    expect(mockedCreateAdminClient).not.toHaveBeenCalled()
  })

  it('updateStatePriceAction rejects unauthorized callers', async () => {
    mockedIsAdminAuthed.mockResolvedValue(false)
    const result = await updateStatePriceAction('sp-1', {}, formData({ median_four_hour_price: '150' }))
    expect(result).toEqual({ error: 'Unauthorized' })
    expect(mockedCreateAdminClient).not.toHaveBeenCalled()
  })

  it('activateStatePricingAction/deactivateStatePricingAction no-op for unauthorized callers', async () => {
    mockedIsAdminAuthed.mockResolvedValue(false)
    await activateStatePricingAction('sp-1', new FormData())
    await deactivateStatePricingAction('sp-1', new FormData())
    expect(mockedCreateAdminClient).not.toHaveBeenCalled()
  })
})

describe('State Pricing admin actions — validation', () => {
  beforeEach(() => {
    mockedIsAdminAuthed.mockResolvedValue(true)
  })

  it.each([
    ['', 'Median 4-hour price is required'],
    ['0', 'Price must be greater than zero'],
    ['-10', 'Price must be a valid amount with at most 2 decimal places'],
    ['abc', 'Price must be a valid amount with at most 2 decimal places'],
    ['10.999', 'Price must be a valid amount with at most 2 decimal places'],
  ])('rejects price %j before calling the database', async (price, expectedError) => {
    const result = await createStatePriceAction({}, formData({ state: 'GA', median_four_hour_price: price }))
    expect(result.error).toBe(expectedError)
    expect(mockedCreateAdminClient).not.toHaveBeenCalled()
  })

  it('requires a state', async () => {
    const result = await createStatePriceAction({}, formData({ state: '', median_four_hour_price: '150' }))
    expect(result).toEqual({ error: 'State is required' })
  })
})

describe('State Pricing admin actions — behavior', () => {
  beforeEach(() => {
    mockedIsAdminAuthed.mockResolvedValue(true)
  })

  it('creates a new active state price with the expected payload', async () => {
    const table = chainable({ error: null })
    mockedCreateAdminClient.mockReturnValue({ from: vi.fn(() => table) } as never)

    const result = await createStatePriceAction({}, formData({ state: 'GA', median_four_hour_price: '150.50' }))

    expect(result).toEqual({ success: true })
    expect(table.insert).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'GA', median_four_hour_price: 150.5, pricing_active: true })
    )
  })

  it('maps a Postgres unique-violation (23505) on create to a friendly duplicate message', async () => {
    const table = chainable({ error: { code: '23505', message: 'duplicate key' } })
    mockedCreateAdminClient.mockReturnValue({ from: vi.fn(() => table) } as never)

    const result = await createStatePriceAction({}, formData({ state: 'GA', median_four_hour_price: '150' }))

    expect(result.error).toBe('GA already has a price — edit it below instead')
  })

  it('updates an existing state price', async () => {
    const table = chainable({ error: null })
    mockedCreateAdminClient.mockReturnValue({ from: vi.fn(() => table) } as never)

    const result = await updateStatePriceAction('sp-1', {}, formData({ median_four_hour_price: '175.25' }))

    expect(result).toEqual({ success: true })
    expect(table.update).toHaveBeenCalledWith(expect.objectContaining({ median_four_hour_price: 175.25 }))
  })

  it('activates state pricing', async () => {
    const table = chainable({ error: null })
    mockedCreateAdminClient.mockReturnValue({ from: vi.fn(() => table) } as never)

    await activateStatePricingAction('sp-1', new FormData())
    expect(table.update).toHaveBeenCalledWith(expect.objectContaining({ pricing_active: true }))
  })

  it('deactivates state pricing', async () => {
    const table = chainable({ error: null })
    mockedCreateAdminClient.mockReturnValue({ from: vi.fn(() => table) } as never)

    await deactivateStatePricingAction('sp-1', new FormData())
    expect(table.update).toHaveBeenCalledWith(expect.objectContaining({ pricing_active: false }))
  })
})

describe('refundBackgroundCheckFeeAction', () => {
  function withReason(reason: string): FormData {
    const formData = new FormData()
    formData.set('reason', reason)
    return formData
  }

  beforeEach(() => {
    vi.mocked(stripe.refunds.create).mockClear()
  })

  it('does nothing without admin auth', async () => {
    mockedIsAdminAuthed.mockResolvedValue(false)
    await refundBackgroundCheckFeeAction('pro_1', withReason('duplicate_charge'))
    expect(stripe.refunds.create).not.toHaveBeenCalled()
  })

  it('refuses a reason outside the fee terms', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    await expect(refundBackgroundCheckFeeAction('pro_1', withReason('screening_result'))).rejects.toThrow('refund reason')
    expect(stripe.refunds.create).not.toHaveBeenCalled()
  })
})

describe('background check decisions', () => {
  type Check = {
    status: string
    requested_at: string | null
    link_sent_at: string | null
    submitted_at: string | null
    background_check_completed_at?: string | null
    id_verification_completed_at?: string | null
  }

  function adminWithCheck(check: Check | null, openBookings: { id: string }[] = [], { recentFollowUp = false } = {}) {
    const updates: Array<{ table: string; values: any }> = []
    const bans: any[] = []
    const deleted: string[] = []
    const rateEvents: any[] = []
    Object.assign(updates, { bans, deleted, rateEvents })
    const client = {
      from(table: string) {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          neq: () => chain,
          is: () => chain,
          in: () => chain,
          gte: () => chain,
          limit: async () => ({ data: table === 'bookings' ? openBookings : [] }),
          insert: async (values: any) => {
            if (table === 'rate_limit_events') {
              rateEvents.push(values)
              return {}
            }
            bans.push(values)
            return {}
          },
          delete: () => {
            deleted.push(table)
            return chain
          },
          update: (values: any) => {
            updates.push({ table, values })
            return chain
          },
          or: () => {
            chain.cooldownFiltered = true
            return chain
          },
          maybeSingle: async () => ({
            data: table === 'background_checks' ? check : table === 'profiles' ? { email: 'Pro@Example.com', first_name: 'Nia', last_name: 'T', phone: '+1 (555) 123-4567' } : null,
          }),
          // Mirrors the resend cooldown filter: a send within the last minute matches no row.
          then: (resolve: any) =>
            resolve({
              count: table === 'rate_limit_events' ? (recentFollowUp ? 1 : 0) : undefined,
              data:
                chain.cooldownFiltered && check?.link_sent_at && Date.now() - Date.parse(check.link_sent_at) < 60_000
                  ? []
                  : [{ pro_id: 'pro_1' }],
            }),
        }
        return chain
      },
    }
    mockedCreateAdminClient.mockReturnValue(client as any)
    return updates
  }

  function decisionForm(backgroundCheck: string, idVerification: string, { reason = 'Reviewed report', confirmed = true } = {}): FormData {
    const formData = new FormData()
    formData.set('backgroundCheck', backgroundCheck)
    formData.set('idVerification', idVerification)
    formData.set('reason', reason)
    if (confirmed) formData.set('noticesConfirmed', 'on')
    return formData
  }

  const approveBoth = () => decisionForm('approve', 'approve', { reason: '', confirmed: false })
  const denyBoth = (options?: { reason?: string; confirmed?: boolean }) => decisionForm('deny', 'deny', options)
  const decide = (form: FormData) => decideBackgroundCheckAction('pro_1', {}, form)

  function sentForm(ordered = true): FormData {
    const formData = new FormData()
    if (ordered) formData.set('ordered', 'on')
    return formData
  }

  function emailRecipients(): string[] {
    return vi.mocked(sendEmail).mock.calls.map(([options]) => options.to[0].email)
  }

  const at = '2026-11-02T10:00:00Z'
  const notStarted: Check = { status: 'pending', requested_at: null, link_sent_at: null, submitted_at: null }
  const paid: Check = { ...notStarted, requested_at: at }
  const linkSent: Check = { ...paid, link_sent_at: at }
  const submitted: Check = { ...linkSent, submitted_at: at }

  beforeEach(() => {
    vi.mocked(sendEmail).mockReset()
    vi.mocked(sendEmail).mockResolvedValue(undefined)
    vi.mocked(emailShell).mockReturnValue('<html></html>')
  })

  it('does nothing without admin auth', async () => {
    mockedIsAdminAuthed.mockResolvedValue(false)
    const updates = adminWithCheck(submitted)
    expect(await markScreeningSentAction('pro_1', {}, sentForm())).toEqual({ error: 'Unauthorized' })
    expect(await decide(approveBoth())).toEqual({ error: 'Unauthorized' })
    expect(await decide(denyBoth())).toEqual({ error: 'Unauthorized' })
    expect(updates).toHaveLength(0)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("marking as sent records it with no link and tells the cleaner to look for Checkr's email", async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    vi.mocked(emailShell).mockImplementation((body: string) => body)
    const updates = adminWithCheck(paid)
    expect(await markScreeningSentAction('pro_1', {}, sentForm())).toEqual({ message: 'Marked as sent.' })
    expect(updates[0].values).toMatchObject({ background_check_link: null, link_sent_at: expect.any(String) })
    expect(vi.mocked(sendEmail).mock.calls[0][0].htmlContent).toContain('invitation from Checkr')
  })

  it('needs the ordered-in-Checkr box ticked', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    const updates = adminWithCheck(paid)
    expect((await markScreeningSentAction('pro_1', {}, sentForm(false))).error).toMatch('ordered in Checkr')
    expect(updates).toHaveLength(0)
  })

  it('refuses to mark as sent again within a minute', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    adminWithCheck({ ...paid, link_sent_at: new Date(Date.now() - 30_000).toISOString() })
    expect((await markScreeningSentAction('pro_1', {}, sentForm())).error).toBe(
      'The background check was already sent. Wait 1 minute before trying again.'
    )
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('refuses to mark as sent for a cleaner who has not paid', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    const updates = adminWithCheck(notStarted)
    expect((await markScreeningSentAction('pro_1', {}, sentForm())).error).toMatch('not_started')
    expect(updates).toHaveLength(0)
  })

  it('needs a decision on both parts', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    const updates = adminWithCheck(linkSent)
    const onlyOne = new FormData()
    onlyOne.set('backgroundCheck', 'approve')
    expect((await decide(onlyOne)).error).toMatch('both')
    expect(updates).toHaveLength(0)
  })

  it('approving both approves the cleaner and emails both the admin and the cleaner', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    const updates = adminWithCheck(linkSent)
    expect(await decide(approveBoth())).toEqual({ message: 'Approved.' })
    expect(updates.find((u) => u.values.status)?.values).toMatchObject({ status: 'passed' })
    expect(updates.find((u) => u.table === 'tidypro_profiles')?.values).toMatchObject({ cleaner_status: 'approved', active_for_booking: true })
    expect(emailRecipients()).toEqual(['admin@example.com', 'Pro@Example.com'])
    expect(vi.mocked(sendEmail).mock.calls[0][0].subject).toContain('cleared')
  })

  it('denying either part denies the cleaner, with the failed part leading the reason', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    for (const [bc, id, label] of [
      ['approve', 'deny', 'ID verification not passed'],
      ['deny', 'approve', 'Background check not passed'],
      ['deny', 'deny', 'Background check and ID verification not passed'],
    ]) {
      const updates = adminWithCheck(linkSent)
      expect(await decide(decisionForm(bc, id))).toEqual({ message: 'Denied.' })
      expect(updates.find((u) => u.values.denial_reason)?.values.denial_reason).toBe(`${label}: Reviewed report`)
    }
  })

  it('refuses to deny without a reason', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    const updates = adminWithCheck(linkSent)
    expect((await decide(denyBoth({ reason: '  ' }))).error).toMatch('reason')
    expect(updates).toHaveLength(0)
  })

  it('refuses to deny without the adverse action confirmation', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    const updates = adminWithCheck(linkSent)
    expect((await decide(denyBoth({ confirmed: false }))).error).toMatch('adverse action')
    expect(updates).toHaveLength(0)
  })

  it('refuses a decision on a cleaner who has not paid', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    const updates = adminWithCheck(notStarted) as any
    expect((await decide(approveBoth())).error).toMatch('not_started')
    expect((await decide(denyBoth())).error).toMatch('not_started')
    expect(updates.bans).toEqual([])
    expect(updates.deleted).toEqual([])
  })

  it('denying leaves the cleaner unapproved with an appeal window, and bans or deletes nothing yet', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    const updates = adminWithCheck(linkSent) as any
    await decide(denyBoth())
    expect(updates.find((u: any) => u.table === 'background_checks').values).toMatchObject({
      status: 'failed',
      denied_at: expect.any(String),
      appeal_token: expect.stringMatching(/^[0-9a-f]{64}$/),
    })
    expect(updates.find((u: any) => u.table === 'tidypro_profiles').values).toMatchObject({
      cleaner_status: 'paused',
      active_for_booking: false,
    })
    expect(updates.bans).toEqual([])
    expect(updates.deleted).toEqual([])
  })

  it('denying emails the cleaner the reason and an appeal link, and tells the admin', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    const updates = adminWithCheck(linkSent) as any
    vi.mocked(emailShell).mockImplementation((body: string) => body)
    await decide(denyBoth())
    expect(emailRecipients()).toEqual(['Pro@Example.com', 'admin@example.com'])
    const token = updates.find((u: any) => u.table === 'background_checks').values.appeal_token
    const toCleaner = vi.mocked(sendEmail).mock.calls[0][0]
    expect(toCleaner.htmlContent).toContain('Reviewed report')
    expect(toCleaner.htmlContent).toContain(`/appeal?token=${token}`)
    expect(vi.mocked(sendEmail).mock.calls[1][0].subject).toContain('denied')
  })

  it('refuses to deny a cleaner with open bookings', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    const updates = adminWithCheck(submitted, [{ id: 'booking_1' }]) as any
    expect((await decide(denyBoth())).error).toMatch('open bookings')
    expect(updates.bans).toEqual([])
    expect(updates.deleted).toEqual([])
    expect(sendEmail).not.toHaveBeenCalled()
  })

  function followUpForm(kind: string): FormData {
    const formData = new FormData()
    formData.set('kind', kind)
    return formData
  }
  const followUp = (kind: string) => sendBackgroundCheckFollowUpAction('pro_1', {}, followUpForm(kind))

  it('reminds a cleaner who has not paid, with a link to pay', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    vi.mocked(emailShell).mockImplementation((body: string) => body)
    const updates = adminWithCheck(null) as any
    expect(await followUp('not_paid')).toEqual({ message: 'Follow-up email sent.' })
    const email = vi.mocked(sendEmail).mock.calls[0][0]
    expect(email.to[0].email).toBe('Pro@Example.com')
    expect(email.subject).toBe('Finish your Tydio background check')
    expect(email.htmlContent).toContain('/pro/onboarding/setup/background-check')
    expect(updates.rateEvents).toEqual([{ key: 'background-check-follow-up:pro_1' }])
    expect(updates).toHaveLength(0)
  })

  it('reminds a cleaner who was sent their check but has not started it', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    vi.mocked(emailShell).mockImplementation((body: string) => body)
    adminWithCheck(linkSent)
    expect(await followUp('not_started')).toEqual({ message: 'Follow-up email sent.' })
    const email = vi.mocked(sendEmail).mock.calls[0][0]
    expect(email.subject).toBe('Reminder: complete your Tydio background check')
    expect(email.htmlContent).toContain('email from Checkr')
  })

  it("won't send a reminder that doesn't fit the cleaner's stage", async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    adminWithCheck(paid)
    expect((await followUp('not_paid')).error).toMatch('already paid')
    expect((await followUp('not_started')).error).toMatch('needs_link')
    adminWithCheck(null)
    expect((await followUp('not_started')).error).toMatch('not_started')
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('sends at most one follow-up a minute to the same cleaner', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    adminWithCheck(linkSent, [], { recentFollowUp: true })
    expect((await followUp('not_started')).error).toBe('A follow-up email was already sent to this cleaner. Wait 1 minute before sending another.')
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('needs admin auth and a known reminder', async () => {
    mockedIsAdminAuthed.mockResolvedValue(false)
    adminWithCheck(linkSent)
    expect(await followUp('not_started')).toEqual({ error: 'Unauthorized' })
    mockedIsAdminAuthed.mockResolvedValue(true)
    expect((await followUp('something_else')).error).toMatch('Choose')
    expect(sendEmail).not.toHaveBeenCalled()
  })
})

describe('approveInsuranceAction', () => {
  function adminRecordingUpdates() {
    const updates: any[] = []
    const chain: any = {
      update: (values: any) => {
        updates.push(values)
        return chain
      },
      eq: () => chain,
      then: (resolve: any) => resolve({ error: null }),
    }
    mockedCreateAdminClient.mockReturnValue({ from: () => chain } as any)
    return updates
  }

  function formWithDate(date: string): FormData {
    const formData = new FormData()
    formData.set('expirationDate', date)
    return formData
  }

  it('does nothing without admin auth', async () => {
    mockedIsAdminAuthed.mockResolvedValue(false)
    const updates = adminRecordingUpdates()
    await approveInsuranceAction('pro_1', formWithDate('2099-01-01'))
    expect(updates).toEqual([])
  })

  it('refuses to approve without an expiration date', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    const updates = adminRecordingUpdates()
    await expect(approveInsuranceAction('pro_1', new FormData())).rejects.toThrow('expiration date')
    expect(updates).toEqual([])
  })

  it('refuses a date already passed', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    const updates = adminRecordingUpdates()
    await expect(approveInsuranceAction('pro_1', formWithDate('2020-01-01'))).rejects.toThrow('future')
    expect(updates).toEqual([])
  })

  it('approves and saves the date', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    const updates = adminRecordingUpdates()
    await approveInsuranceAction('pro_1', formWithDate('2099-01-01'))
    expect(updates[0]).toMatchObject({ insurance_status: 'approved', is_insured: true, insurance_policy_expiration_date: '2099-01-01' })
  })
})
