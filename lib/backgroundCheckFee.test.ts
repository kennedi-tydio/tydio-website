import { describe, expect, it } from 'vitest'
import {
  BACKGROUND_CHECK_FEE_KIND,
  STRIPE_DASHBOARD_REFUND,
  backgroundCheckChargeCents,
  feeAcceptanceError,
  feeRefundReasonLabel,
  feeStatusLabel,
  formatFeeCents,
  hasPaidFee,
  isDuplicateFeePayment,
  isFeeRefundReason,
  paidFeeProId,
} from './backgroundCheckFee'

describe('backgroundCheckChargeCents', () => {
  it('charges exactly the configured fee, with nothing added on top', () => {
    expect(backgroundCheckChargeCents('35')).toBe(3500)
    expect(backgroundCheckChargeCents('29.99')).toBe(2999)
  })

  it('is null when no valid fee is configured, rather than guessing', () => {
    expect(backgroundCheckChargeCents('')).toBeNull()
    expect(backgroundCheckChargeCents('abc')).toBeNull()
    expect(backgroundCheckChargeCents('0')).toBeNull()
    expect(backgroundCheckChargeCents('-5')).toBeNull()
  })
})

describe('hasPaidFee', () => {
  const paidAt = '2026-11-02T10:00:00Z'

  it('is false before paying', () => {
    expect(hasPaidFee(null)).toBe(false)
    expect(hasPaidFee({ fee_paid_at: null, fee_refunded_at: null })).toBe(false)
  })

  it('is true once paid', () => {
    expect(hasPaidFee({ fee_paid_at: paidAt, fee_refunded_at: null })).toBe(true)
  })

  it('is false after a refund', () => {
    expect(hasPaidFee({ fee_paid_at: paidAt, fee_refunded_at: '2026-11-03T10:00:00Z' })).toBe(false)
  })
})

describe('isDuplicateFeePayment', () => {
  const paid = { fee_paid_at: '2026-11-02T10:00:00Z', fee_refunded_at: null, stripe_payment_intent_id: 'pi_1' }

  it('flags a second, different payment', () => {
    expect(isDuplicateFeePayment(paid, 'pi_2')).toBe(true)
  })

  it('does not flag the same payment arriving twice', () => {
    expect(isDuplicateFeePayment(paid, 'pi_1')).toBe(false)
  })

  it('does not flag a first payment', () => {
    expect(isDuplicateFeePayment(null, 'pi_1')).toBe(false)
  })

  it('does not flag paying again after a refund', () => {
    expect(isDuplicateFeePayment({ ...paid, fee_refunded_at: '2026-11-03T10:00:00Z' }, 'pi_2')).toBe(false)
  })
})

describe('feeAcceptanceError', () => {
  it('requires the terms to be accepted', () => {
    expect(feeAcceptanceError({ acceptedFeeTerms: false, displayedFeeCents: 3120 }, 3120)).toContain('agree')
  })

  it('rejects an amount other than the one shown', () => {
    expect(feeAcceptanceError({ acceptedFeeTerms: true, displayedFeeCents: 3000 }, 3120)).toContain('changed')
    expect(feeAcceptanceError({ acceptedFeeTerms: true, displayedFeeCents: null }, 3120)).toContain('changed')
  })

  it('passes when accepted at the amount shown', () => {
    expect(feeAcceptanceError({ acceptedFeeTerms: true, displayedFeeCents: 3120 }, 3120)).toBeNull()
  })
})

describe('feeStatusLabel', () => {
  const unpaid = { fee_paid_at: null, fee_amount_cents: null, fee_refunded_at: null, fee_refund_reason: null }
  const paid = { ...unpaid, fee_paid_at: '2026-11-02T10:00:00Z', fee_amount_cents: 3120 }

  it('reads as not paid before payment', () => {
    expect(feeStatusLabel(unpaid)).toBe('Not paid')
    expect(feeStatusLabel(null)).toBe('Not paid')
  })

  it('shows a payment or refund', () => {
    expect(feeStatusLabel(paid)).toBe('Paid $31.20')
    expect(feeStatusLabel({ ...paid, fee_refunded_at: '2026-11-03T10:00:00Z', fee_refund_reason: 'duplicate_charge' })).toBe(
      'Refunded $31.20 (Duplicate charge)'
    )
  })
})

describe('feeRefundReasonLabel', () => {
  it('labels the policy reasons, and anything else as refunded in Stripe', () => {
    expect(feeRefundReasonLabel('duplicate_charge')).toBe('Duplicate charge')
    expect(feeRefundReasonLabel(STRIPE_DASHBOARD_REFUND)).toBe('Refunded in Stripe')
    expect(isFeeRefundReason('screening_result')).toBe(false)
  })
})

describe('formatFeeCents', () => {
  it('formats as dollars', () => {
    expect(formatFeeCents(3120)).toBe('$31.20')
    expect(formatFeeCents(3500)).toBe('$35')
  })
})

describe('paidFeeProId', () => {
  const metadata = { kind: BACKGROUND_CHECK_FEE_KIND, pro_id: 'pro_1' }

  it('returns the cleaner for a paid fee session', () => {
    expect(paidFeeProId({ payment_status: 'paid', metadata })).toBe('pro_1')
  })

  it('ignores a session that has not been paid', () => {
    expect(paidFeeProId({ payment_status: 'unpaid', metadata })).toBeNull()
  })

  it('ignores other kinds of checkout session', () => {
    expect(paidFeeProId({ payment_status: 'paid', metadata: { kind: 'other', pro_id: 'pro_1' } })).toBeNull()
    expect(paidFeeProId({ payment_status: 'paid', metadata: null })).toBeNull()
  })
})
