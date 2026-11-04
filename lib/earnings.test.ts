import { describe, expect, it } from 'vitest'
import { summarizeEarnings, unpaidStripeBalance } from './earnings'

describe('summarizeEarnings', () => {
  it('counts pay and tips from every booking towards overall earnings', () => {
    const result = summarizeEarnings(
      [
        { cleaner_pay: 100, tip: 20, stripe_transfer_id: 'tr_1' },
        { cleaner_pay: 50, tip: 0, stripe_transfer_id: 'tr_2' },
      ],
      true
    )
    expect(result).toEqual({ overall: 170, heldByTydio: 0 })
  })

  it('holds booking pay until its transfer goes through, but not tips', () => {
    const result = summarizeEarnings(
      [
        { cleaner_pay: 100, tip: 20, stripe_transfer_id: null },
        { cleaner_pay: 50, tip: 5, stripe_transfer_id: 'tr_2' },
      ],
      true
    )
    expect(result).toEqual({ overall: 175, heldByTydio: 100 })
  })

  it('holds everything when there is no payout account to send it to', () => {
    const result = summarizeEarnings([{ cleaner_pay: 100, tip: 20, stripe_transfer_id: null }], false)
    expect(result).toEqual({ overall: 120, heldByTydio: 120 })
  })

  it('handles missing amounts', () => {
    const result = summarizeEarnings([{ cleaner_pay: null, tip: null, stripe_transfer_id: null }], true)
    expect(result).toEqual({ overall: 0, heldByTydio: 0 })
  })

  it('is zero with no bookings', () => {
    expect(summarizeEarnings([], true)).toEqual({ overall: 0, heldByTydio: 0 })
  })
})

describe('unpaidStripeBalance', () => {
  it('adds available and pending funds, in dollars', () => {
    const balance = {
      available: [{ amount: 1250, currency: 'usd' }],
      pending: [{ amount: 500, currency: 'usd' }],
    }
    expect(unpaidStripeBalance(balance)).toBe(17.5)
  })

  it('ignores other currencies', () => {
    expect(unpaidStripeBalance({ available: [{ amount: 900, currency: 'cad' }], pending: [] })).toBe(0)
  })

  it('never goes below zero', () => {
    const balance = {
      available: [{ amount: -700, currency: 'usd' }],
      pending: [{ amount: 200, currency: 'usd' }],
    }
    expect(unpaidStripeBalance(balance)).toBe(0)
  })
})
