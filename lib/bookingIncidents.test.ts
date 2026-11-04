import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/stripe', () => ({ stripe: {} }))

import { incidentCleanerPay, incidentRefundAmount, isRefundLevel } from './bookingIncidents'

describe('incident settlement', () => {
  it('refunds the customer in full and pays the cleaner nothing', () => {
    expect(incidentRefundAmount('full', 100)).toBe(100)
    expect(incidentCleanerPay('full', 80)).toBe(0)
  })

  it('splits a half refund like a late cancellation', () => {
    expect(incidentRefundAmount('half', 100)).toBe(50)
    expect(incidentCleanerPay('half', 80)).toBe(40)
  })

  it('pays the cleaner in full when nothing is refunded', () => {
    expect(incidentRefundAmount('none', 100)).toBe(0)
    expect(incidentCleanerPay('none', 80)).toBe(80)
  })

  it('only accepts the three refund levels', () => {
    expect(['full', 'half', 'none'].every(isRefundLevel)).toBe(true)
    expect(isRefundLevel('partial')).toBe(false)
  })
})
