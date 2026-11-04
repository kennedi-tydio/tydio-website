export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.'

// Database and Stripe errors are written for developers ("duplicate key value
// violates unique constraint …"), so customers and Tidy Pros never see them.
// The real error is logged; the person gets `fallback`. Stripe card errors are
// the exception: Stripe writes those for the cardholder ("Your card was declined.").
export function userFacingError(err: unknown, fallback: string = GENERIC_ERROR_MESSAGE): string {
  if (!err) return fallback
  console.error('[Tydio]', err)
  if (isStripeCardError(err)) return err.message
  return fallback
}

function isStripeCardError(err: unknown): err is { message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { type?: unknown }).type === 'StripeCardError' &&
    typeof (err as { message?: unknown }).message === 'string'
  )
}
