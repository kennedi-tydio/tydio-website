// Promo codes take money off what the customer pays for a booking. The Tidy Pro is
// still paid 80% of the undiscounted price (cleaner_pay is worked out before the
// discount), and Tydio covers the difference: their transfer comes out of Tydio's
// Stripe balance when the discounted charge is smaller than it (see completeBookingPayout).
//
// The discount comes off the booking price, before Stripe's card fee is added on top,
// so the fee is worked out on what the customer actually pays.
//
// Pure and client-safe; the database side is lib/promoCodesData, and the check that
// Tydio's Stripe balance can cover the difference is lib/promoFunding.

import { netOfStripeFee } from '@/lib/pricingRules'

export const PROMO_DISCOUNT_TYPES = ['percent', 'amount'] as const
export type PromoDiscountType = (typeof PROMO_DISCOUNT_TYPES)[number]

export type PromoDiscount = { discount_type: PromoDiscountType; discount_value: number }

export type PromoCode = PromoDiscount & {
  id: string
  code: string
  active: boolean
  expires_at: string | null
  max_redemptions: number | null
  // How many bookings one customer can use it on; null for no limit.
  max_uses_per_customer: number | null
  recipients_only: boolean
}

export const PROMO_CODE_MIN_LENGTH = 3
export const PROMO_CODE_MAX_LENGTH = 30
export const PROMO_MAX_AMOUNT_OFF = 500
export const PROMO_MESSAGE_MAX = 500

// Stripe won't take a charge under $0.50, and a free booking would leave nothing to
// charge at all, so the customer always pays at least this much of the booking price.
export const MIN_BOOKING_PRICE_AFTER_PROMO = 1

// Letters and digits that can't be misread for one another (no 0/O, 1/I/L).
const GENERATED_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function normalizePromoCode(code: string): string {
  return code.trim().toUpperCase()
}

export function promoCodeFormatError(code: string): string | null {
  if (code.length < PROMO_CODE_MIN_LENGTH || code.length > PROMO_CODE_MAX_LENGTH) {
    return `Codes must be ${PROMO_CODE_MIN_LENGTH}–${PROMO_CODE_MAX_LENGTH} characters.`
  }
  if (!/^[A-Z0-9-]+$/.test(code)) return 'Codes can only use letters, numbers and dashes.'
  return null
}

export function generatePromoCode(length = 8): string {
  const bytes = new Uint32Array(length)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => GENERATED_ALPHABET[b % GENERATED_ALPHABET.length]).join('')
}

// Dollars off the booking price, capped so the customer still pays something.
export function promoDiscountAmount(servicePrice: number, promo: PromoDiscount): number {
  const value = Number(promo.discount_value)
  const raw = promo.discount_type === 'percent' ? servicePrice * (value / 100) : value
  const cap = Math.max(0, servicePrice - MIN_BOOKING_PRICE_AFTER_PROMO)
  return round2(Math.max(0, Math.min(raw, cap)))
}

export function describePromoDiscount(promo: PromoDiscount): string {
  const value = Number(promo.discount_value)
  if (promo.discount_type === 'percent') return `${value}% off`
  return `$${Number.isInteger(value) ? value : value.toFixed(2)} off`
}

export type PromoUsage = {
  // How many of the customer's bookings have used it (not counting ones canceled with a refund).
  customerUses: number
  // How many bookings have used it in all, the same way.
  totalUses: number
  // It was emailed to this customer.
  isRecipient: boolean
}

export const INVALID_PROMO_MESSAGE = 'Invalid promo code. Try again.'

// Why this customer can't use the code right now, or null if they can.
export function promoUnavailableReason(promo: PromoCode | null, usage: PromoUsage, now: Date = new Date()): string | null {
  if (!promo || !promo.active) return INVALID_PROMO_MESSAGE
  if (promo.recipients_only && !usage.isRecipient) return INVALID_PROMO_MESSAGE
  if (promo.expires_at && new Date(promo.expires_at).getTime() <= now.getTime()) return 'This promo code has expired.'
  if (promo.max_uses_per_customer != null && usage.customerUses >= promo.max_uses_per_customer) {
    return promo.max_uses_per_customer === 1
      ? 'You’ve already used this promo code.'
      : `You’ve already used this promo code ${promo.max_uses_per_customer} times, the most it allows.`
  }
  if (promo.max_redemptions != null && usage.totalUses >= promo.max_redemptions) {
    return 'This promo code has reached its limit.'
  }
  return null
}

export type PromoCodeInput = {
  code: string
  discount_type: PromoDiscountType
  discount_value: number
  expires_at: string | null
  max_redemptions: number | null
  max_uses_per_customer: number | null
  recipients_only: boolean
}

// The admin's "New promo code" form. The expiry date is the last day it works, through
// the end of that day in Eastern time (Tydio's market).
export function parsePromoCodeForm(formData: FormData): PromoCodeInput | { error: string } {
  const code = normalizePromoCode(String(formData.get('code') ?? ''))
  const formatError = promoCodeFormatError(code)
  if (formatError) return { error: formatError }

  const discountType = String(formData.get('discount_type') ?? '') as PromoDiscountType
  if (!PROMO_DISCOUNT_TYPES.includes(discountType)) return { error: 'Choose a percent or dollar discount.' }

  const value = Number(String(formData.get('discount_value') ?? '').trim())
  if (!Number.isFinite(value) || value <= 0) return { error: 'Enter how much the code takes off.' }
  if (discountType === 'percent' && (value > 100 || !Number.isInteger(value))) {
    return { error: 'Percent off must be a whole number from 1 to 100.' }
  }
  if (discountType === 'amount' && (value > PROMO_MAX_AMOUNT_OFF || round2(value) !== value)) {
    return { error: `Dollars off must be up to $${PROMO_MAX_AMOUNT_OFF}, in dollars and cents.` }
  }

  const expiresRaw = String(formData.get('expires_on') ?? '').trim()
  let expiresAt: string | null = null
  if (expiresRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresRaw)) return { error: 'Enter a valid expiration date.' }
    // 23:59:59 Eastern, as UTC (EST is UTC-5; during daylight time it runs an hour later, which is fine).
    const end = new Date(`${expiresRaw}T23:59:59-05:00`)
    if (Number.isNaN(end.getTime())) return { error: 'Enter a valid expiration date.' }
    if (end.getTime() <= Date.now()) return { error: 'The expiration date has already passed.' }
    expiresAt = end.toISOString()
  }

  const maxRaw = String(formData.get('max_redemptions') ?? '').trim()
  let maxRedemptions: number | null = null
  if (maxRaw) {
    maxRedemptions = Number(maxRaw)
    if (!Number.isInteger(maxRedemptions) || maxRedemptions < 1) return { error: 'The use limit must be a whole number of at least 1.' }
  }

  // Blank means no limit; the form starts at 1.
  const perCustomerRaw = String(formData.get('max_uses_per_customer') ?? '').trim()
  let maxUsesPerCustomer: number | null = null
  if (perCustomerRaw) {
    maxUsesPerCustomer = Number(perCustomerRaw)
    if (!Number.isInteger(maxUsesPerCustomer) || maxUsesPerCustomer < 1) {
      return { error: 'Uses per customer must be a whole number of at least 1, or blank for no limit.' }
    }
    if (maxRedemptions != null && maxUsesPerCustomer > maxRedemptions) {
      return { error: 'Uses per customer can’t be more than the total uses.' }
    }
  }

  return {
    code,
    discount_type: discountType,
    discount_value: value,
    expires_at: expiresAt,
    max_redemptions: maxRedemptions,
    max_uses_per_customer: maxUsesPerCustomer,
    recipients_only: formData.get('recipients_only') === 'on',
  }
}

// Shown when Tydio's Stripe balance can't cover what a discount would cost it. Vague on
// purpose: the customer doesn't need to know why.
export const PROMO_UNFUNDED_MESSAGE = 'Promo code is no longer valid.'

// What Tydio has to add from its own balance to pay the Tidy Pro in full: their pay,
// less what the customer's discounted payment leaves after Stripe's fee.
export function promoShortfall(cleanerPay: number, customerNet: number): number {
  return round2(Math.max(0, cleanerPay - customerNet))
}

export type UnpaidPromoBooking = {
  id: string
  stripe_payment_intent_id: string | null
  cleaner_pay: number | null
  total_customer_charge: number | null
}

// What Tydio has already promised to cover on promo bookings whose Tidy Pro hasn't been
// paid yet. A request sent to several Tidy Pros shares one payment and only one is paid,
// so it counts once.
export function committedPromoShortfall(bookings: UnpaidPromoBooking[]): number {
  const perPayment = new Map<string, number>()
  for (const b of bookings) {
    const shortfall = promoShortfall(Number(b.cleaner_pay ?? 0), netOfStripeFee(Number(b.total_customer_charge ?? 0)))
    const key = b.stripe_payment_intent_id ?? b.id
    perPayment.set(key, Math.max(perPayment.get(key) ?? 0, shortfall))
  }
  return round2([...perPayment.values()].reduce((sum, n) => sum + n, 0))
}

export function describeUsesPerCustomer(limit: number | null): string {
  if (limit == null) return 'No limit per customer'
  return limit === 1 ? 'One use per customer' : `Up to ${limit} uses per customer`
}

export type PromoUseRow = {
  id: string
  user_id: string | null
  stripe_payment_intent_id: string | null
  promo_discount: number | null
  created_at: string
}

export type CustomerPromoUses = { customerId: string; uses: number; discount: number; lastUsedAt: string }

// One code's uses, per customer, most uses first. A request sent to several Tidy Pros
// is one payment, so it counts (and its discount is added) once.
export function summarizeUsesByCustomer(rows: PromoUseRow[]): CustomerPromoUses[] {
  const payments = new Map<string, PromoUseRow>()
  for (const r of rows) {
    if (!r.user_id) continue
    const key = r.stripe_payment_intent_id ?? r.id
    if (!payments.has(key)) payments.set(key, r)
  }
  const byCustomer = new Map<string, CustomerPromoUses>()
  for (const r of payments.values()) {
    const current = byCustomer.get(r.user_id!) ?? { customerId: r.user_id!, uses: 0, discount: 0, lastUsedAt: r.created_at }
    current.uses++
    current.discount = round2(current.discount + Number(r.promo_discount ?? 0))
    if (r.created_at > current.lastUsedAt) current.lastUsedAt = r.created_at
    byCustomer.set(r.user_id!, current)
  }
  return [...byCustomer.values()].sort((a, b) => b.uses - a.uses || b.lastUsedAt.localeCompare(a.lastUsedAt))
}
