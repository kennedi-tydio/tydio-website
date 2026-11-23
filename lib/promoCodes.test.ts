import { describe, expect, it } from 'vitest'
import {
  INVALID_PROMO_MESSAGE,
  describePromoDiscount,
  generatePromoCode,
  normalizePromoCode,
  parsePromoCodeForm,
  promoCodeFormatError,
  promoDiscountAmount,
  promoUnavailableReason,
  committedPromoShortfall,
  promoShortfall,
  summarizeUsesByCustomer,
  type PromoCode,
  type PromoUsage,
} from './promoCodes'
import { cleanerPayoutForServicePrice, grossUpForStripeFee } from './pricingRules'

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return fd
}

const promo = (overrides: Partial<PromoCode> = {}): PromoCode => ({
  id: 'p1',
  code: 'SAVE20',
  active: true,
  discount_type: 'percent',
  discount_value: 20,
  expires_at: null,
  max_redemptions: null,
  max_uses_per_customer: 1,
  recipients_only: false,
  ...overrides,
})

const unused: PromoUsage = { customerUses: 0, totalUses: 0, isRecipient: false }

describe('promoDiscountAmount', () => {
  it('takes a percent off the booking price', () => {
    expect(promoDiscountAmount(100, promo())).toBe(20)
    expect(promoDiscountAmount(87.45, promo({ discount_value: 15 }))).toBe(13.12)
  })

  it('takes dollars off', () => {
    expect(promoDiscountAmount(100, promo({ discount_type: 'amount', discount_value: 25 }))).toBe(25)
  })

  it('always leaves the customer paying at least $1', () => {
    expect(promoDiscountAmount(40, promo({ discount_type: 'amount', discount_value: 50 }))).toBe(39)
    expect(promoDiscountAmount(40, promo({ discount_value: 100 }))).toBe(39)
    expect(promoDiscountAmount(0.5, promo({ discount_value: 100 }))).toBe(0)
  })

  it('leaves the Tidy Pro’s pay on the full price', () => {
    const servicePrice = 120
    const discount = promoDiscountAmount(servicePrice, promo({ discount_value: 50 }))
    const charged = grossUpForStripeFee(servicePrice - discount)
    // The Tidy Pro still gets 80% of $120, more than the discounted charge leaves after Stripe's fee.
    expect(cleanerPayoutForServicePrice(servicePrice)).toBe(96)
    expect(charged).toBeLessThan(96)
  })
})

describe('promoUnavailableReason', () => {
  const now = new Date('2026-11-20T12:00:00Z')

  it('accepts a usable code', () => {
    expect(promoUnavailableReason(promo(), unused, now)).toBeNull()
  })

  it('rejects a missing or turned-off code', () => {
    expect(promoUnavailableReason(null, unused, now)).toBe(INVALID_PROMO_MESSAGE)
    expect(promoUnavailableReason(promo({ active: false }), unused, now)).toBe(INVALID_PROMO_MESSAGE)
  })

  it('only lets emailed customers use a recipients-only code', () => {
    expect(promoUnavailableReason(promo({ recipients_only: true }), unused, now)).toBe(INVALID_PROMO_MESSAGE)
    expect(promoUnavailableReason(promo({ recipients_only: true }), { ...unused, isRecipient: true }, now)).toBeNull()
  })

  it('rejects an expired code', () => {
    expect(promoUnavailableReason(promo({ expires_at: '2026-11-19T00:00:00Z' }), unused, now)).toMatch(/expired/)
    expect(promoUnavailableReason(promo({ expires_at: '2026-11-21T00:00:00Z' }), unused, now)).toBeNull()
  })

  it('allows one use per customer by default', () => {
    expect(promoUnavailableReason(promo(), { ...unused, customerUses: 1 }, now)).toMatch(/already used/)
  })

  it('allows as many uses per customer as the admin set', () => {
    const three = promo({ max_uses_per_customer: 3 })
    expect(promoUnavailableReason(three, { ...unused, customerUses: 2 }, now)).toBeNull()
    expect(promoUnavailableReason(three, { ...unused, customerUses: 3 }, now)).toMatch(/3 times/)
    expect(promoUnavailableReason(promo({ max_uses_per_customer: null }), { ...unused, customerUses: 40 }, now)).toBeNull()
  })

  it('stops at the total use limit', () => {
    expect(promoUnavailableReason(promo({ max_redemptions: 5 }), { ...unused, totalUses: 5 }, now)).toMatch(/limit/)
    expect(promoUnavailableReason(promo({ max_redemptions: 5 }), { ...unused, totalUses: 4 }, now)).toBeNull()
  })
})

describe('codes', () => {
  it('normalizes and checks the format', () => {
    expect(normalizePromoCode('  save20 ')).toBe('SAVE20')
    expect(promoCodeFormatError('SAVE-20')).toBeNull()
    expect(promoCodeFormatError('AB')).toMatch(/characters/)
    expect(promoCodeFormatError('SAVE 20')).toMatch(/letters/)
    expect(promoCodeFormatError('SAVE_20')).toMatch(/letters/)
  })

  it('generates readable codes', () => {
    const code = generatePromoCode()
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/)
    expect(promoCodeFormatError(code)).toBeNull()
  })

  it('describes the discount', () => {
    expect(describePromoDiscount(promo())).toBe('20% off')
    expect(describePromoDiscount(promo({ discount_type: 'amount', discount_value: 15 }))).toBe('$15 off')
    expect(describePromoDiscount(promo({ discount_type: 'amount', discount_value: 7.5 }))).toBe('$7.50 off')
  })
})

describe('parsePromoCodeForm', () => {
  it('parses a full form', () => {
    expect(
      parsePromoCodeForm(
        form({ code: 'spring20', discount_type: 'percent', discount_value: '20', expires_on: '2099-03-31', max_redemptions: '50', max_uses_per_customer: '2', recipients_only: 'on' })
      )
    ).toEqual({
      code: 'SPRING20',
      discount_type: 'percent',
      discount_value: 20,
      expires_at: '2099-04-01T04:59:59.000Z',
      max_redemptions: 50,
      max_uses_per_customer: 2,
      recipients_only: true,
    })
  })

  it('leaves optional fields empty', () => {
    expect(parsePromoCodeForm(form({ code: 'TEN', discount_type: 'amount', discount_value: '10.50' }))).toEqual({
      code: 'TEN',
      discount_type: 'amount',
      discount_value: 10.5,
      expires_at: null,
      max_redemptions: null,
      max_uses_per_customer: null,
      recipients_only: false,
    })
  })

  it('rejects bad input', () => {
    expect(parsePromoCodeForm(form({ code: 'X', discount_type: 'percent', discount_value: '10' }))).toHaveProperty('error')
    expect(parsePromoCodeForm(form({ code: 'SAVE', discount_type: 'other', discount_value: '10' }))).toHaveProperty('error')
    expect(parsePromoCodeForm(form({ code: 'SAVE', discount_type: 'percent', discount_value: '0' }))).toHaveProperty('error')
    expect(parsePromoCodeForm(form({ code: 'SAVE', discount_type: 'percent', discount_value: '101' }))).toHaveProperty('error')
    expect(parsePromoCodeForm(form({ code: 'SAVE', discount_type: 'percent', discount_value: '12.5' }))).toHaveProperty('error')
    expect(parsePromoCodeForm(form({ code: 'SAVE', discount_type: 'amount', discount_value: '9.999' }))).toHaveProperty('error')
    expect(parsePromoCodeForm(form({ code: 'SAVE', discount_type: 'percent', discount_value: '10', expires_on: '2020-01-01' }))).toHaveProperty('error')
    expect(parsePromoCodeForm(form({ code: 'SAVE', discount_type: 'percent', discount_value: '10', max_redemptions: '0' }))).toHaveProperty('error')
    expect(parsePromoCodeForm(form({ code: 'SAVE', discount_type: 'percent', discount_value: '10', max_uses_per_customer: '0' }))).toHaveProperty('error')
    expect(
      parsePromoCodeForm(form({ code: 'SAVE', discount_type: 'percent', discount_value: '10', max_redemptions: '2', max_uses_per_customer: '3' }))
    ).toHaveProperty('error')
  })
})

describe('promoShortfall', () => {
  it('is what the Tidy Pro’s pay needs on top of the customer’s payment', () => {
    // $100 booking, 50% off: the Pro gets $80, the customer's payment nets $50.
    expect(promoShortfall(80, 50)).toBe(30)
  })

  it('is zero when the discounted payment still covers the Pro', () => {
    expect(promoShortfall(80, 90)).toBe(0)
  })
})

describe('committedPromoShortfall', () => {
  it('adds up what unpaid promo bookings still need, once per payment', () => {
    const charge = grossUpForStripeFee(50)
    expect(
      committedPromoShortfall([
        { id: 'a', stripe_payment_intent_id: 'pi_1', cleaner_pay: 80, total_customer_charge: charge },
        // Another Tidy Pro asked in the same request: the same payment.
        { id: 'b', stripe_payment_intent_id: 'pi_1', cleaner_pay: 80, total_customer_charge: charge },
        { id: 'c', stripe_payment_intent_id: 'pi_2', cleaner_pay: 40, total_customer_charge: grossUpForStripeFee(45) },
      ])
    ).toBe(30)
  })
})

describe('summarizeUsesByCustomer', () => {
  const row = (id: string, user: string | null, pi: string | null, discount: number, at: string) => ({
    id,
    user_id: user,
    stripe_payment_intent_id: pi,
    promo_discount: discount,
    created_at: at,
  })

  it('counts each customer’s uses and discount, once per payment, most uses first', () => {
    expect(
      summarizeUsesByCustomer([
        row('a', 'ana', 'pi_1', 10, '2026-11-01T00:00:00Z'),
        // The same request sent to a second Tidy Pro.
        row('b', 'ana', 'pi_1', 10, '2026-11-01T00:00:00Z'),
        row('c', 'ana', 'pi_2', 12.5, '2026-11-10T00:00:00Z'),
        row('d', 'ben', 'pi_3', 8, '2026-11-05T00:00:00Z'),
        row('e', null, 'pi_4', 8, '2026-11-06T00:00:00Z'),
      ])
    ).toEqual([
      { customerId: 'ana', uses: 2, discount: 22.5, lastUsedAt: '2026-11-10T00:00:00Z' },
      { customerId: 'ben', uses: 1, discount: 8, lastUsedAt: '2026-11-05T00:00:00Z' },
    ])
  })
})
