import { describe, expect, it } from 'vitest'
import { replacesOneAtATime, settleDifference } from './replacementChain'
import { notifyAllRequestsDeclined, notifyBookingDeclined, notifyCleanerCancelled, notifyReplacementDeclined } from './notifications'
import { textBody } from './manualTextEmail'

// $100 for the service, $103.30 charged on a US card.
const holding = { held: 100, heldTotal: 103.3, cardFeePercentage: 0.029 }

describe('settleDifference', () => {
  it('charges a pricier replacement the difference plus the card fee', () => {
    const result = settleDifference(120, holding)
    expect(result.difference).toBe(20)
    expect(result.extraCharge).toBe(20.91) // (20 + 0.30) / (1 - 0.029)
    expect(result.refund).toBe(0)
    expect(result.newTotal).toBe(124.21)
  })

  it('refunds a cheaper replacement the difference', () => {
    const result = settleDifference(85.5, holding)
    expect(result.difference).toBe(-14.5)
    expect(result.extraCharge).toBe(0)
    expect(result.refund).toBe(14.5)
    expect(result.newTotal).toBe(88.8)
  })

  it('leaves the same price alone', () => {
    expect(settleDifference(100, holding)).toEqual({ difference: 0, extraCharge: 0, refund: 0, newTotal: 103.3 })
  })

  it('covers an extra too small for Stripe to charge', () => {
    // $0.10 more would be a $0.41 charge, under Stripe's $0.50 minimum.
    expect(settleDifference(100.1, holding)).toEqual({ difference: 0, extraCharge: 0, refund: 0, newTotal: 103.3 })
  })

  it('compares the next pick with what was paid after earlier differences', () => {
    // Paid $120 after an earlier, pricier pick who then declined.
    const after = { held: 120, heldTotal: 124.21, cardFeePercentage: 0.029 }
    expect(settleDifference(90, after)).toMatchObject({ refund: 30, newTotal: 94.21 })
  })
})

describe('replacesOneAtATime', () => {
  it('is only for Standard / Deep Cleaning bookings', () => {
    expect(replacesOneAtATime({ full_service: null })).toBe(false)
    expect(replacesOneAtATime({ full_service: { selection: {}, lines: [], customer_total: 100 } })).toBe(true)
  })
})

describe('decline texts', () => {
  it('tell the customer they can choose a replacement or cancel, ending with the link', () => {
    for (const payload of [
      notifyBookingDeclined('b1'),
      notifyBookingDeclined('b1', true),
      notifyAllRequestsDeclined('b1'),
      notifyAllRequestsDeclined('b1', true),
      notifyCleanerCancelled('Sam', 'b1'),
      notifyCleanerCancelled('Sam', 'b1', true),
      notifyReplacementDeclined('b1'),
    ]) {
      const text = textBody(payload)
      expect(text).toMatch(/cancel your booking for a refund\. Do either here: http\S+\/dashboard\/bookings\/b1\/replace$/)
    }
  })

  it('describe each kind of replacement', () => {
    expect(notifyBookingDeclined('b1').body).toContain('up to 3 other Tidy Pros with no new charge')
    expect(notifyBookingDeclined('b1', true).body).toContain('Choose another Tidy Pro')
    expect(notifyBookingDeclined('b1', true).body).not.toContain('up to 3')
  })
})
