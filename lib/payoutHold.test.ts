import { describe, expect, it } from 'vitest'
import { adminCleanerPay, isPayoutHeld } from './payoutHold'

describe('isPayoutHeld', () => {
  it('is held only when the admin put it on hold', () => {
    expect(isPayoutHeld({ payout_held_at: '2026-11-22T15:00:00.000Z' })).toBe(true)
    expect(isPayoutHeld({ payout_held_at: null })).toBe(false)
  })
})

describe('adminCleanerPay', () => {
  it('works out full, half, none and custom', () => {
    expect(adminCleanerPay('full', 80.01)).toEqual({ pay: 80.01 })
    expect(adminCleanerPay('half', 80.01)).toEqual({ pay: 40.01 })
    expect(adminCleanerPay('none', 80)).toEqual({ pay: 0 })
    expect(adminCleanerPay('custom', 80, 25.5)).toEqual({ pay: 25.5 })
    expect(adminCleanerPay('custom', 80, 0)).toEqual({ pay: 0 })
  })

  it('refuses a custom payout above their pay or missing', () => {
    expect(adminCleanerPay('custom', 80, 80.01)).toHaveProperty('error')
    expect(adminCleanerPay('custom', 80, null)).toHaveProperty('error')
    expect(adminCleanerPay('custom', 80, -1)).toHaveProperty('error')
  })
})
