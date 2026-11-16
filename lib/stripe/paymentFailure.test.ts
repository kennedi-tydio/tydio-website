import { describe, expect, it } from 'vitest'
import { cardFailureMessage } from './paymentFailure'

describe('cardFailureMessage', () => {
  it('passes through Stripe’s cardholder message for a decline', () => {
    expect(cardFailureMessage({ type: 'StripeCardError', code: 'card_declined', message: 'Your card has insufficient funds.' })).toBe(
      'Your card has insufficient funds.'
    )
  })

  it('falls back when a card error has no message', () => {
    expect(cardFailureMessage({ type: 'StripeCardError', code: 'card_declined' })).toBe('Your card was declined.')
  })

  it('explains a card that needs bank approval', () => {
    expect(cardFailureMessage({ type: 'StripeCardError', code: 'authentication_required', message: 'raw' })).toMatch(
      /bank needs to approve/
    )
  })

  it('treats a missing or detached payment method as a card failure', () => {
    expect(
      cardFailureMessage({ type: 'StripeInvalidRequestError', param: 'payment_method', message: 'No such PaymentMethod: pm_123' })
    ).toMatch(/can no longer be charged/)
  })

  it('ignores errors that aren’t about the card', () => {
    expect(cardFailureMessage({ type: 'StripeInvalidRequestError', param: 'amount', message: 'Invalid integer' })).toBeNull()
    expect(cardFailureMessage({ type: 'StripeAPIError', message: 'Server error' })).toBeNull()
    expect(cardFailureMessage(new Error('boom'))).toBeNull()
    expect(cardFailureMessage(null)).toBeNull()
  })
})
