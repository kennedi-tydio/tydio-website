import { describe, expect, it } from 'vitest'
import { CONNECTION_DROPPED_MESSAGE, actionErrorMessage, isNetworkError } from './networkError'

describe('isNetworkError', () => {
  it('recognises each browser’s dropped-request error', () => {
    for (const message of ['Load failed', 'Failed to fetch', 'NetworkError when attempting to fetch resource.', 'The network connection was lost.']) {
      expect(isNetworkError(new TypeError(message))).toBe(true)
    }
  })

  it('leaves other errors alone', () => {
    expect(isNetworkError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false)
    expect(isNetworkError(new Error('Load failed'))).toBe(false)
    expect(isNetworkError('Load failed')).toBe(false)
    expect(isNetworkError(null)).toBe(false)
  })
})

describe('actionErrorMessage', () => {
  it('asks them to tap again when the connection dropped', () => {
    expect(actionErrorMessage(new TypeError('Load failed'))).toBe(CONNECTION_DROPPED_MESSAGE)
    expect(actionErrorMessage(new Error('boom'))).toBe('Something went wrong. Please try again.')
  })
})
