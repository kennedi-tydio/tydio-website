// When charging a customer's saved card fails because of the card itself (declined,
// expired, insufficient funds, needs bank approval, no longer on file), the fix is
// for them to use a different payment method. This tells those failures apart from
// our own errors and returns what to show the customer, or null when it isn't the card.

const AUTHENTICATION_REQUIRED_MESSAGE =
  'Your bank needs to approve this charge, which we can’t do here. Please use a different payment method.'
const CARD_UNAVAILABLE_MESSAGE = 'This card can no longer be charged. Please use a different payment method.'

type StripeLikeError = { type?: unknown; code?: unknown; param?: unknown; message?: unknown }

export function cardFailureMessage(err: unknown): string | null {
  if (typeof err !== 'object' || err === null) return null
  const e = err as StripeLikeError

  if (e.type === 'StripeCardError') {
    // Off-session charges can't show the bank's 3D Secure prompt.
    if (e.code === 'authentication_required') return AUTHENTICATION_REQUIRED_MESSAGE
    // Stripe writes card error messages for the cardholder ("Your card was declined.").
    return typeof e.message === 'string' && e.message ? e.message : 'Your card was declined.'
  }

  // The saved card was detached or deleted in Stripe.
  if (e.type === 'StripeInvalidRequestError' && e.param === 'payment_method') return CARD_UNAVAILABLE_MESSAGE

  return null
}
