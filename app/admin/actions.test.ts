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
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(), emailShell: vi.fn() }))
vi.mock('@/lib/marketPricing', () => ({ researchAreaMarketPrice: vi.fn() }))

import { isAdminAuthed } from '@/lib/auth/admin'
import { createAdminClient } from '@/lib/supabase/admin'
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
