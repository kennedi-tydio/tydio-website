import type Stripe from 'stripe'
import type { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import {
  ADMIN_CANCELLED_REASON,
  ALL_DECLINED_REASON,
  CLEANER_CANCELLED_REASON,
  CLEANER_NO_SHOW_REASON,
  LATE_CANCEL_REASON,
  NO_ACCESS_REASON,
  NO_RESPONSE_REASON,
  REQUEST_FILLED_REASON,
} from '@/lib/bookingRequestGroups'
import { BACKGROUND_CHECK_FEE_KIND, feeRefundReasonLabel } from '@/lib/backgroundCheckFee'

type Admin = ReturnType<typeof createAdminClient>

// Every refund comes from Stripe itself, not from what the app recorded, so the list also
// has the automatic ones nothing in the database points at (a card charged for a booking
// that then failed to save, a duplicate fee payment) and anything refunded in Stripe's
// dashboard. Each is then matched to the booking, upcharge or fee it belongs to.

export type RefundTrigger = 'Customer' | 'Tidy Pro' | 'Admin' | 'Automatic' | 'Unknown'

export type RefundCharge = 'Booking' | 'Upcharge' | 'Recurring visit' | 'Tip' | 'Background check fee' | 'Unknown'

export type MatchedBooking = {
  id: string
  status: string | null
  cancelled_reason: string | null
  incident_refund_level: string | null
}

export type RefundSource =
  | { type: 'booking'; booking: MatchedBooking }
  | { type: 'upcharge'; booking: MatchedBooking | null }
  | { type: 'background_check'; feeRefundReason: string | null; isCurrentPayment: boolean }
  | { type: 'none'; metadataKind: string | null; hasBookingMetadata: boolean; hasProfileMetadata: boolean }

export type RefundExplanation = { charge: RefundCharge; trigger: RefundTrigger; reason: string }

const INCIDENT_LEVELS: Record<string, string> = {
  full: 'full refund',
  half: 'half refund',
  minus_fee: 'refund less the card fee',
}

function bookingReason(booking: MatchedBooking): { trigger: RefundTrigger; reason: string } {
  if (booking.cancelled_reason === CLEANER_NO_SHOW_REASON) {
    return { trigger: 'Automatic', reason: 'Customer reported the Tidy Pro never arrived' }
  }
  if (booking.cancelled_reason === NO_ACCESS_REASON) {
    const level = booking.incident_refund_level ? INCIDENT_LEVELS[booking.incident_refund_level] : null
    return { trigger: 'Admin', reason: `Tidy Pro couldn't get in; settled as ${level ?? 'a refund'}` }
  }
  if (booking.incident_refund_level && INCIDENT_LEVELS[booking.incident_refund_level]) {
    return { trigger: 'Admin', reason: `Incident settled as ${INCIDENT_LEVELS[booking.incident_refund_level]}` }
  }
  switch (booking.cancelled_reason) {
    case LATE_CANCEL_REASON:
      return { trigger: 'Customer', reason: 'Customer canceled less than 2 hours before (50%)' }
    case CLEANER_CANCELLED_REASON:
      return { trigger: 'Tidy Pro', reason: 'Tidy Pro canceled' }
    case ADMIN_CANCELLED_REASON:
      return { trigger: 'Admin', reason: 'Admin canceled the booking' }
    case NO_RESPONSE_REASON:
      return { trigger: 'Automatic', reason: 'No Tidy Pro responded in time' }
    case ALL_DECLINED_REASON:
      return { trigger: 'Automatic', reason: 'Every Tidy Pro declined' }
    case REQUEST_FILLED_REASON:
      return { trigger: 'Automatic', reason: 'Another Tidy Pro took the request' }
  }
  if (booking.status === 'cancelled') return { trigger: 'Customer', reason: 'Customer canceled' }
  return { trigger: 'Unknown', reason: 'Booking wasn’t canceled. Probably refunded in Stripe' }
}

export function explainRefund(source: RefundSource): RefundExplanation {
  switch (source.type) {
    case 'booking':
      return { charge: 'Booking', ...bookingReason(source.booking) }
    case 'upcharge':
      if (!source.booking) return { charge: 'Upcharge', trigger: 'Unknown', reason: 'Upcharge refunded' }
      if (source.booking.status !== 'cancelled') {
        return { charge: 'Upcharge', trigger: 'Tidy Pro', reason: 'Tidy Pro canceled; upcharge refunded before the customer picked someone else' }
      }
      return { charge: 'Upcharge', ...bookingReason(source.booking) }
    case 'background_check':
      return source.isCurrentPayment
        ? { charge: 'Background check fee', trigger: 'Admin', reason: feeRefundReasonLabel(source.feeRefundReason) }
        : { charge: 'Background check fee', trigger: 'Automatic', reason: 'Fee paid twice; the extra payment was refunded' }
    case 'none':
      switch (source.metadataKind) {
        case 'recurring_visit':
          return { charge: 'Recurring visit', trigger: 'Automatic', reason: 'Card charged while the visit changed; refunded right away' }
        case 'upcharge':
          return { charge: 'Upcharge', trigger: 'Automatic', reason: 'Paid after the upcharge changed; refunded right away' }
        case 'tip':
          return { charge: 'Tip', trigger: 'Unknown', reason: 'Tip refunded, probably in Stripe' }
        case BACKGROUND_CHECK_FEE_KIND:
          return { charge: 'Background check fee', trigger: 'Automatic', reason: 'Fee paid twice; the extra payment was refunded' }
      }
      if (source.hasBookingMetadata) {
        return { charge: 'Booking', trigger: 'Unknown', reason: 'Booking no longer in the database' }
      }
      if (source.hasProfileMetadata) {
        return { charge: 'Booking', trigger: 'Automatic', reason: 'Card was charged but the booking failed to save, so it was refunded' }
      }
      return { charge: 'Unknown', trigger: 'Unknown', reason: 'Not linked to anything in Tydio. Check Stripe' }
  }
}

export type AdminRefundRow = RefundExplanation & {
  id: string
  createdAt: string
  amount: number
  chargedAmount: number | null
  status: string
  failureReason: string | null
  bookingId: string | null
  profileId: string | null
  stripeUrl: string | null
}

function intentOf(refund: Stripe.Refund): Stripe.PaymentIntent | null {
  return typeof refund.payment_intent === 'object' ? refund.payment_intent : null
}

function paymentIntentId(refund: Stripe.Refund): string | null {
  return typeof refund.payment_intent === 'string' ? refund.payment_intent : refund.payment_intent?.id ?? null
}

function customerProfileId(intent: Stripe.PaymentIntent | null): string | null {
  const customer = intent?.customer
  if (customer && typeof customer === 'object' && !customer.deleted) return customer.metadata?.profile_id || null
  return null
}

export async function loadAdminRefunds(admin: Admin, limit = 300): Promise<AdminRefundRow[]> {
  const refunds = await stripe.refunds
    .list({ limit: 100, expand: ['data.payment_intent', 'data.payment_intent.customer'] })
    .autoPagingToArray({ limit })

  const refundIds = refunds.map((r) => r.id)
  const intentIds = [...new Set(refunds.map(paymentIntentId).filter((id): id is string => !!id))]
  if (refunds.length === 0) return []

  const byIds = <T extends { stripe_refund_id: string | null; stripe_payment_intent_id: string | null }>(rows: T[] | null) => ({
    refund: new Map((rows ?? []).filter((r) => r.stripe_refund_id).map((r) => [r.stripe_refund_id!, r])),
    intent: new Map((rows ?? []).filter((r) => r.stripe_payment_intent_id).map((r) => [r.stripe_payment_intent_id!, r])),
  })

  const bookingColumns = 'id, user_id, status, cancelled_reason, incident_refund_level, stripe_payment_intent_id, stripe_refund_id'
  const [bookingsByRefund, bookingsByIntent, { data: upcharges }, { data: checks }] = await Promise.all([
    admin.from('bookings').select(bookingColumns).in('stripe_refund_id', refundIds),
    intentIds.length ? admin.from('bookings').select(bookingColumns).in('stripe_payment_intent_id', intentIds) : Promise.resolve({ data: [] }),
    intentIds.length
      ? admin.from('booking_upcharges').select('booking_id, stripe_payment_intent_id, stripe_refund_id').in('stripe_payment_intent_id', intentIds)
      : Promise.resolve({ data: [] }),
    intentIds.length
      ? admin.from('background_checks').select('pro_id, fee_refund_reason, stripe_payment_intent_id').in('stripe_payment_intent_id', intentIds)
      : Promise.resolve({ data: [] }),
  ])

  // A request sent to several Tidy Pros shares one charge. The copy holding the refund
  // wins; otherwise one that was actually canceled rather than filled by someone else.
  const allBookings = [...(bookingsByRefund.data ?? []), ...(bookingsByIntent.data ?? [])]
  const bookings = byIds(allBookings)
  const bookingForIntent = new Map<string, (typeof allBookings)[number]>()
  for (const b of allBookings) {
    if (!b.stripe_payment_intent_id) continue
    const current = bookingForIntent.get(b.stripe_payment_intent_id)
    if (!current || (current.cancelled_reason === REQUEST_FILLED_REASON && b.cancelled_reason !== REQUEST_FILLED_REASON)) {
      bookingForIntent.set(b.stripe_payment_intent_id, b)
    }
  }
  const upchargeByIntent = byIds(upcharges as { booking_id: string; stripe_payment_intent_id: string | null; stripe_refund_id: string | null }[]).intent
  const checkByIntent = new Map((checks ?? []).map((c) => [c.stripe_payment_intent_id, c]))

  const upchargeBookingIds = [...new Set((upcharges ?? []).map((u) => u.booking_id))].filter((id) => !allBookings.some((b) => b.id === id))
  const { data: upchargeBookings } = upchargeBookingIds.length
    ? await admin.from('bookings').select(bookingColumns).in('id', upchargeBookingIds)
    : { data: [] }
  const bookingById = new Map([...allBookings, ...(upchargeBookings ?? [])].map((b) => [b.id, b]))

  const testMode = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test') ?? false

  return refunds.map((refund) => {
    const intent = intentOf(refund)
    const intentId = paymentIntentId(refund)
    const metadata = intent?.metadata ?? {}
    const upcharge = intentId ? upchargeByIntent.get(intentId) : undefined
    const booking = bookings.refund.get(refund.id) ?? (intentId ? bookingForIntent.get(intentId) : undefined)
    const check = intentId ? checkByIntent.get(intentId) : undefined

    let source: RefundSource
    let bookingId: string | null = null
    let profileId: string | null = metadata.profile_id || customerProfileId(intent)
    if (upcharge) {
      const parent = bookingById.get(upcharge.booking_id) ?? null
      source = { type: 'upcharge', booking: parent }
      bookingId = upcharge.booking_id
      profileId = parent?.user_id ?? profileId
    } else if (booking) {
      source = { type: 'booking', booking }
      bookingId = booking.id
      profileId = booking.user_id
    } else if (check) {
      source = { type: 'background_check', feeRefundReason: check.fee_refund_reason, isCurrentPayment: true }
      profileId = check.pro_id
    } else {
      source = {
        type: 'none',
        metadataKind: metadata.kind ?? null,
        hasBookingMetadata: !!metadata.booking_id,
        hasProfileMetadata: !!metadata.profile_id,
      }
      bookingId = metadata.booking_id || null
      profileId = profileId ?? (metadata.pro_id || null)
    }

    return {
      ...explainRefund(source),
      id: refund.id,
      createdAt: new Date(refund.created * 1000).toISOString(),
      amount: refund.amount / 100,
      chargedAmount: intent ? intent.amount_received / 100 : null,
      status: refund.status ?? 'unknown',
      failureReason: refund.failure_reason ?? null,
      bookingId,
      profileId,
      stripeUrl: intentId ? `https://dashboard.stripe.com/${testMode ? 'test/' : ''}payments/${intentId}` : null,
    }
  })
}

// Succeeded refunds in the last `days` days, for the page's summary tiles.
export function recentRefundSummary(rows: AdminRefundRow[], days = 30): { count: number; total: number } {
  const since = Date.now() - days * 24 * 60 * 60 * 1000
  const recent = rows.filter((r) => r.status === 'succeeded' && new Date(r.createdAt).getTime() >= since)
  return { count: recent.length, total: recent.reduce((sum, r) => sum + r.amount, 0) }
}
