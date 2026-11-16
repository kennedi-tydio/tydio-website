import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/stripe', () => ({ stripe: {} }))

import { explainRefund, type MatchedBooking } from './adminRefunds'

const booking = (overrides: Partial<MatchedBooking>): MatchedBooking => ({
  id: 'b1',
  status: 'cancelled',
  cancelled_reason: null,
  incident_refund_level: null,
  ...overrides,
})

describe('explainRefund', () => {
  it('reads a plain customer cancellation', () => {
    expect(explainRefund({ type: 'booking', booking: booking({}) })).toEqual({ charge: 'Booking', trigger: 'Customer', reason: 'Customer canceled' })
  })

  it.each([
    ['late_cancel', 'Customer'],
    ['cleaner_cancelled', 'Tidy Pro'],
    ['admin_cancelled', 'Admin'],
    ['no_response', 'Automatic'],
    ['all_declined', 'Automatic'],
    ['cleaner_no_show', 'Automatic'],
    ['no_access', 'Admin'],
  ])('credits a %s refund to %s', (reason, trigger) => {
    expect(explainRefund({ type: 'booking', booking: booking({ cancelled_reason: reason }) }).trigger).toBe(trigger)
  })

  it('treats an upcharge refunded on a booking still going ahead as a Tidy Pro canceling', () => {
    expect(explainRefund({ type: 'upcharge', booking: booking({ status: 'pending' }) })).toMatchObject({ charge: 'Upcharge', trigger: 'Tidy Pro' })
  })

  it('explains the automatic refunds nothing in the database points at', () => {
    const none = { type: 'none' as const, hasBookingMetadata: false, hasProfileMetadata: true }
    expect(explainRefund({ ...none, metadataKind: null })).toMatchObject({ trigger: 'Automatic', charge: 'Booking' })
    expect(explainRefund({ ...none, metadataKind: 'recurring_visit' })).toMatchObject({ trigger: 'Automatic', charge: 'Recurring visit' })
    expect(explainRefund({ ...none, metadataKind: 'upcharge' })).toMatchObject({ trigger: 'Automatic', charge: 'Upcharge' })
    expect(explainRefund({ type: 'none', metadataKind: null, hasBookingMetadata: false, hasProfileMetadata: false })).toMatchObject({
      trigger: 'Unknown',
      charge: 'Unknown',
    })
  })

  it('labels a background check fee refunded by the admin with its reason', () => {
    expect(explainRefund({ type: 'background_check', feeRefundReason: null, isCurrentPayment: true })).toMatchObject({
      trigger: 'Admin',
      reason: 'Refunded in Stripe',
    })
  })
})
