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
  denyCleanerAction,
  passBackgroundCheckAction,
  refundBackgroundCheckFeeAction,
  sendBackgroundCheckLinkAction,
  setScreeningPartCompletedAction,
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

  function adminWithCheck(check: Check | null, openBookings: { id: string }[] = []) {
    const updates: Array<{ table: string; values: any }> = []
    const bans: any[] = []
    const deleted: string[] = []
    Object.assign(updates, { bans, deleted })
    const client = {
      from(table: string) {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          neq: () => chain,
          is: () => chain,
          in: () => chain,
          limit: async () => ({ data: table === 'bookings' ? openBookings : [] }),
          insert: async (values: any) => {
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

  function denyForm(confirmed: boolean): FormData {
    const formData = new FormData()
    formData.set('reason', 'Reviewed report')
    if (confirmed) formData.set('noticesConfirmed', 'on')
    return formData
  }

  function emailRecipients(): string[] {
    return vi.mocked(sendEmail).mock.calls.map(([options]) => options.to[0].email)
  }

  function approveForm(): FormData {
    const formData = new FormData()
    formData.set('backgroundCheckPassed', 'on')
    formData.set('idVerificationPassed', 'on')
    return formData
  }

  function linkForm(link: string): FormData {
    const formData = new FormData()
    formData.set('link', link)
    return formData
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
    await sendBackgroundCheckLinkAction('pro_1', {}, linkForm('https://apply.checkr.com/abc'))
    await setScreeningPartCompletedAction('pro_1', 'background_check', true, new FormData())
    await passBackgroundCheckAction('pro_1', approveForm())
    await denyCleanerAction('pro_1', denyForm(true))
    expect(updates).toHaveLength(0)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('sends the form to a cleaner who has paid, and emails them', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    const updates = adminWithCheck(paid)
    await sendBackgroundCheckLinkAction('pro_1', {}, linkForm('https://apply.checkr.com/abc'))
    expect(updates[0].values).toMatchObject({ background_check_link: 'https://apply.checkr.com/abc' })
    expect(updates[0].values.link_sent_at).toBeTruthy()
    expect(sendEmail).toHaveBeenCalledOnce()
  })

  it('refuses to resend within a minute of the last send', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    adminWithCheck({ ...paid, link_sent_at: new Date(Date.now() - 30_000).toISOString() })
    const result = await sendBackgroundCheckLinkAction('pro_1', {}, linkForm('https://apply.checkr.com/abc'))
    expect(result.error).toBe('The background check link was already sent. Wait 1 minute before sending it again.')
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('resends once a minute has passed', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    adminWithCheck({ ...paid, link_sent_at: new Date(Date.now() - 61_000).toISOString() })
    const result = await sendBackgroundCheckLinkAction('pro_1', {}, linkForm('https://apply.checkr.com/abc'))
    expect(result).toEqual({ message: 'Link sent.' })
    expect(sendEmail).toHaveBeenCalledOnce()
  })

  it('refuses to send a form to a cleaner who has not paid', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    const updates = adminWithCheck(notStarted)
    expect((await sendBackgroundCheckLinkAction('pro_1', {}, linkForm('https://apply.checkr.com/abc'))).error).toMatch('not_started')
    expect(updates).toHaveLength(0)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('refuses a link that is not https', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    const updates = adminWithCheck(paid)
    expect((await sendBackgroundCheckLinkAction('pro_1', {}, linkForm('javascript:alert(1)'))).error).toMatch('https')
    expect(updates).toHaveLength(0)
  })

  it('refuses to send without a link, since each cleaner has their own', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    const updates = adminWithCheck(paid)
    expect((await sendBackgroundCheckLinkAction('pro_1', {}, linkForm(' '))).error).toMatch('Paste')
    expect(updates).toHaveLength(0)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('ticking off one part records it without moving the check on', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    const updates = adminWithCheck(linkSent)
    await setScreeningPartCompletedAction('pro_1', 'id_verification', true, new FormData())
    expect(updates).toHaveLength(1)
    expect(updates[0].values.id_verification_completed_at).toBeTruthy()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('once both parts are completed, the check is recorded as submitted', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    const updates = adminWithCheck({ ...linkSent, background_check_completed_at: at, id_verification_completed_at: at })
    await setScreeningPartCompletedAction('pro_1', 'background_check', true, new FormData())
    expect(updates.map((u) => Object.keys(u.values))).toEqual([['background_check_completed_at'], ['submitted_at']])
  })

  it('can untick a part', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    const updates = adminWithCheck(linkSent)
    await setScreeningPartCompletedAction('pro_1', 'background_check', false, new FormData())
    expect(updates[0].values).toEqual({ background_check_completed_at: null })
  })

  it('only records progress once the link has been sent', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    const updates = adminWithCheck(paid)
    await expect(setScreeningPartCompletedAction('pro_1', 'background_check', true, new FormData())).rejects.toThrow('needs_link')
    expect(updates).toHaveLength(0)
  })

  it('refuses to approve unless both checks are confirmed as passed', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    const updates = adminWithCheck(submitted)
    const onlyOne = new FormData()
    onlyOne.set('backgroundCheckPassed', 'on')
    await expect(passBackgroundCheckAction('pro_1', onlyOne)).rejects.toThrow('both')
    expect(updates).toHaveLength(0)
  })

  it('records which check failed in the denial reason', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    const updates = adminWithCheck(submitted)
    const form = denyForm(true)
    form.set('failedCheck', 'id_verification')
    await denyCleanerAction('pro_1', form)
    expect(updates.find((u) => u.values.denial_reason)?.values.denial_reason).toBe('ID verification not passed: Reviewed report')
  })

  it('refuses to deny without a reason', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    const updates = adminWithCheck(paid)
    const form = denyForm(true)
    form.set('reason', '  ')
    await expect(denyCleanerAction('pro_1', form)).rejects.toThrow('reason')
    expect(updates).toHaveLength(0)
  })

  it('refuses to reject without the adverse action confirmation', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    const updates = adminWithCheck(submitted)
    await expect(denyCleanerAction('pro_1', denyForm(false))).rejects.toThrow('adverse action')
    expect(updates).toHaveLength(0)
  })

  it('refuses a decision on a cleaner who has not paid', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    const updates = adminWithCheck(notStarted) as any
    await expect(passBackgroundCheckAction('pro_1', approveForm())).rejects.toThrow('not_started')
    await expect(denyCleanerAction('pro_1', denyForm(true))).rejects.toThrow('not_started')
    expect(updates.bans).toEqual([])
    expect(updates.deleted).toEqual([])
  })

  it('denying leaves the cleaner unapproved with an appeal window, and bans or deletes nothing yet', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    const updates = adminWithCheck(paid) as any
    await denyCleanerAction('pro_1', denyForm(true))
    expect(updates.find((u: any) => u.table === 'background_checks').values).toMatchObject({
      status: 'failed',
      denial_reason: 'Reviewed report',
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
    const updates = adminWithCheck(paid) as any
    vi.mocked(emailShell).mockImplementation((body: string) => body)
    await denyCleanerAction('pro_1', denyForm(true))
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
    await expect(denyCleanerAction('pro_1', denyForm(true))).rejects.toThrow('open bookings')
    expect(updates.bans).toEqual([])
    expect(updates.deleted).toEqual([])
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('clearing a check approves the cleaner and emails both the admin and the cleaner', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    const updates = adminWithCheck(paid)
    await passBackgroundCheckAction('pro_1', approveForm())
    expect(updates.find((u) => u.values.status)?.values).toMatchObject({ status: 'passed' })
    expect(emailRecipients()).toEqual(['admin@example.com', 'Pro@Example.com'])
    expect(vi.mocked(sendEmail).mock.calls[0][0].subject).toContain('cleared')
  })

  it('passing approves the cleaner', async () => {
    mockedIsAdminAuthed.mockResolvedValue(true)
    const updates = adminWithCheck(submitted)
    await passBackgroundCheckAction('pro_1', approveForm())
    expect(updates.find((u) => u.values.status)?.values).toMatchObject({ status: 'passed' })
    expect(updates.find((u) => u.table === 'tidypro_profiles')?.values).toMatchObject({ cleaner_status: 'approved', active_for_booking: true })
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
