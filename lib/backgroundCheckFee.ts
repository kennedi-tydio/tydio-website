// Cleaners pay for their own background check, and that payment is what starts the
// process. BACKGROUND_CHECK_FEE_USD is the exact amount they're charged, with nothing
// added on top, so Stripe's processing fee comes out of it. It has no default: a
// guessed price would charge cleaners the wrong amount, so checks stay unavailable
// until it's set.
export function backgroundCheckChargeCents(fee: string | undefined = process.env.BACKGROUND_CHECK_FEE_USD): number | null {
  const feeUsd = Number(fee)
  if (!fee || !Number.isFinite(feeUsd) || feeUsd <= 0) return null
  return Math.round(feeUsd * 100)
}

export function formatFeeCents(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`
}

export const BACKGROUND_CHECK_FEE_KIND = 'background_check_fee'

// The only cases the fee is refunded for under the cleaner agreement. Screening
// results and cleaner conduct are deliberately not among them.
export const FEE_REFUND_REASONS = {
  duplicate_charge: 'Duplicate charge',
  tydio_ordering_error: 'Tydio ordering error',
  tydio_cancelled_onboarding: 'Tydio cancelled onboarding',
} as const
export type FeeRefundReason = keyof typeof FEE_REFUND_REASONS

// A refund made directly in the Stripe dashboard, where no reason was chosen.
export const STRIPE_DASHBOARD_REFUND = 'stripe_dashboard'

export function isFeeRefundReason(value: unknown): value is FeeRefundReason {
  return typeof value === 'string' && value in FEE_REFUND_REASONS
}

export function feeRefundReasonLabel(reason: string | null): string {
  return isFeeRefundReason(reason) ? FEE_REFUND_REASONS[reason] : 'Refunded in Stripe'
}

type FeePaymentState = {
  fee_paid_at: string | null
  fee_refunded_at: string | null
  stripe_payment_intent_id: string | null
}

// A refunded fee counts as unpaid, so that cleaner can't continue to Checkr
// without paying again.
export function hasPaidFee(check: Pick<FeePaymentState, 'fee_paid_at' | 'fee_refunded_at'> | null | undefined): boolean {
  return Boolean(check?.fee_paid_at) && !check?.fee_refunded_at
}

// The admin page's payment line.
export function feeStatusLabel(
  check: { fee_paid_at: string | null; fee_amount_cents: number | null; fee_refunded_at: string | null; fee_refund_reason: string | null } | null | undefined
): string {
  if (!check?.fee_paid_at) return 'Not paid'
  const amount = check.fee_amount_cents != null ? ` ${formatFeeCents(check.fee_amount_cents)}` : ''
  return check.fee_refunded_at ? `Refunded${amount} (${feeRefundReasonLabel(check.fee_refund_reason)})` : `Paid${amount}`
}

export function isDuplicateFeePayment(check: FeePaymentState | null | undefined, paymentIntentId: string | null): boolean {
  return hasPaidFee(check) && paymentIntentId != null && check?.stripe_payment_intent_id !== paymentIntentId
}

// Nobody gets charged without accepting the fee terms, or a figure other than
// the one they were shown (the configured cost could change while a page is open).
export function feeAcceptanceError(
  input: { acceptedFeeTerms: boolean; displayedFeeCents: number | null },
  chargeCents: number
): string | null {
  if (!input.acceptedFeeTerms) return 'Please agree to the background-screening fee and refund terms to continue.'
  if (input.displayedFeeCents !== chargeCents) return 'The fee has changed. Please refresh this page and review it before paying.'
  return null
}

type FeeCheckoutSession = {
  payment_status: string
  metadata: Record<string, string> | null
}

// Which cleaner a Checkout Session paid for, or null if it isn't a paid
// background check fee at all (Stripe's webhook sends every session).
export function paidFeeProId(session: FeeCheckoutSession): string | null {
  if (session.metadata?.kind !== BACKGROUND_CHECK_FEE_KIND) return null
  if (session.payment_status !== 'paid') return null
  return session.metadata.pro_id ?? null
}
