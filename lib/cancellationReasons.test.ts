import { describe, expect, it } from 'vitest'
import { CLEANER_CANCEL_REASONS, CUSTOMER_CANCEL_REASONS, cancelReasonLabel, parseCancellation } from './cancellationReasons'

describe('parseCancellation', () => {
  it('accepts a reason from the list and trims the note', () => {
    expect(parseCancellation(CUSTOMER_CANCEL_REASONS, { reason: 'plans_changed', note: '  out of town  ' })).toEqual({ reason: 'plans_changed', note: 'out of town' })
  })

  it('saves a blank note as null', () => {
    expect(parseCancellation(CLEANER_CANCEL_REASONS, { reason: 'transportation', note: '   ' })).toEqual({ reason: 'transportation', note: null })
  })

  it('rejects a missing reason or one from the other list', () => {
    expect(parseCancellation(CUSTOMER_CANCEL_REASONS, null)).toHaveProperty('error')
    expect(parseCancellation(CUSTOMER_CANCEL_REASONS, { reason: 'transportation' })).toHaveProperty('error')
  })

  it('rejects a note over the limit', () => {
    expect(parseCancellation(CUSTOMER_CANCEL_REASONS, { reason: 'other', note: 'x'.repeat(501) })).toHaveProperty('error')
  })
})

describe('cancelReasonLabel', () => {
  it('shows the label for either list', () => {
    expect(cancelReasonLabel('unsafe')).toBe('I can’t safely complete the job')
    expect(cancelReasonLabel(null)).toBeNull()
  })
})
