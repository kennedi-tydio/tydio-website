import { describe, expect, it, vi } from 'vitest'
import { GENERIC_ERROR_MESSAGE, userFacingError } from './userFacingError'

describe('userFacingError', () => {
  it('hides database errors behind the fallback and logs them', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const dbError = { code: '23505', message: 'duplicate key value violates unique constraint "profiles_phone_unique"' }
    expect(userFacingError(dbError)).toBe(GENERIC_ERROR_MESSAGE)
    expect(userFacingError(dbError, 'Failed to save address.')).toBe('Failed to save address.')
    expect(log).toHaveBeenCalledWith('[Tydio]', dbError)
    log.mockRestore()
  })

  it("passes Stripe's cardholder messages through", () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(userFacingError({ type: 'StripeCardError', message: 'Your card was declined.' })).toBe('Your card was declined.')
    log.mockRestore()
  })

  it('returns the fallback without logging when there is no error', () => {
    expect(userFacingError(null, 'Failed to create booking.')).toBe('Failed to create booking.')
  })
})
