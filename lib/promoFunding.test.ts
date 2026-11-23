import { beforeEach, describe, expect, it, vi } from 'vitest'

// A plain function rather than vi.fn: vitest's mock tracking re-wraps a rejected
// promise, and that copy goes unhandled even when the code catches the original.
const stripeState = vi.hoisted(() => ({ retrieve: null as null | (() => Promise<unknown>), calls: 0 }))
vi.mock('@/lib/stripe', () => ({
  stripe: {
    balance: {
      retrieve: () => {
        stripeState.calls++
        return stripeState.retrieve!()
      },
    },
  },
}))
const balanceIs = (b: unknown) => {
  stripeState.retrieve = async () => b
}

import { checkPromoFunding, type PromoBookingDetails } from './promoFunding'
import { grossUpForStripeFee } from './pricingRules'
import type { PromoCode } from './promoCodes'

// Answers the unpaid-promo-bookings query with `rows`, whatever filters are chained on.
function adminWith(rows: unknown[]) {
  const result = Promise.resolve({ data: rows, error: null })
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'not', 'is', 'gt', 'or']) chain[m] = () => chain
  chain.then = result.then.bind(result)
  return { from: () => chain } as never
}

const promo = (overrides: Partial<PromoCode> = {}): PromoCode => ({
  id: 'p1',
  code: 'HALF',
  active: true,
  discount_type: 'percent',
  discount_value: 50,
  expires_at: null,
  max_redemptions: null,
  max_uses_per_customer: 1,
  recipients_only: false,
  ...overrides,
})

const details = (overrides: Partial<PromoBookingDetails> = {}): PromoBookingDetails => ({
  promo: promo(),
  customerId: 'c1',
  tidyProId: 't1',
  date: '2026-12-01',
  time: '10:00',
  tasks: [],
  servicePrice: 100,
  ...overrides,
})

const usd = (dollars: number) => ({ available: [{ currency: 'usd', amount: Math.round(dollars * 100) }], pending: [] })

describe('checkPromoFunding', () => {
  beforeEach(() => {
    stripeState.retrieve = null
    stripeState.calls = 0
  })

  it('needs no balance when the discounted payment still covers the Tidy Pro', async () => {
    // 10% off $100: the customer's $90 covers the Pro's $80.
    expect(await checkPromoFunding(adminWith([]), details({ promo: promo({ discount_value: 10 }) }))).toEqual({ ok: true })
    expect(stripeState.calls).toBe(0)
  })

  it('accepts the code when the balance covers the difference', async () => {
    balanceIs(usd(30))
    expect(await checkPromoFunding(adminWith([]), details())).toEqual({ ok: true })
  })

  it('refuses it when the balance is short', async () => {
    balanceIs(usd(29.99))
    expect(await checkPromoFunding(adminWith([]), details())).toEqual({
      ok: false,
      discount: 50,
      cleanerPay: 80,
      customerPays: 50,
      shortfall: 30,
      available: 29.99,
      committed: 0,
    })
  })

  it('sets aside what earlier promo bookings still need', async () => {
    balanceIs(usd(50))
    // An unpaid booking already needs $30 of the $50.
    const earlier = [{ id: 'b1', stripe_payment_intent_id: 'pi_1', cleaner_pay: 80, total_customer_charge: grossUpForStripeFee(50) }]
    const result = await checkPromoFunding(adminWith(earlier), details())
    expect(result).toMatchObject({ ok: false, committed: 30, available: 50 })
  })

  it('refuses it when Stripe can’t be checked', async () => {
    stripeState.retrieve = async () => {
      throw new Error('Stripe down')
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await checkPromoFunding(adminWith([]), details())).toMatchObject({ ok: false, available: null })
  })
})
