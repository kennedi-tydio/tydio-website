import { describe, expect, it } from 'vitest'
import { customerBookingStats, tidyProBookingStats, type BookingStatsRow } from './adminUserBookingStats'

function row(overrides: Partial<BookingStatsRow>): BookingStatsRow {
  return {
    id: Math.random().toString(36).slice(2),
    user_id: 'c1',
    tidy_pro_id: 'p1',
    status: 'pending',
    decision_status: 'pending',
    request_group_id: null,
    stripe_payment_intent_id: null,
    stripe_refund_id: null,
    cancelled_reason: null,
    ...overrides,
  }
}

describe('customerBookingStats', () => {
  it('counts a request sent to several Tidy Pros once', () => {
    const stats = customerBookingStats([
      row({ tidy_pro_id: 'p1', request_group_id: 'g', stripe_payment_intent_id: 'pi_1' }),
      row({ tidy_pro_id: 'p2', request_group_id: 'g', stripe_payment_intent_id: 'pi_1' }),
    ])
    expect(stats.get('c1')).toEqual({ requests: 1, pending: 1, completed: 0, refunds: 0 })
  })

  it('a filled request is not pending, and completed beats the filled copies', () => {
    const stats = customerBookingStats([
      row({ stripe_payment_intent_id: 'pi_1', status: 'completed', decision_status: 'accepted' }),
      row({ stripe_payment_intent_id: 'pi_1', status: 'cancelled', cancelled_reason: 'filled_by_other' }),
      row({ stripe_payment_intent_id: 'pi_2', status: 'scheduled', decision_status: 'accepted' }),
      row({ stripe_payment_intent_id: 'pi_2', status: 'pending' }),
    ])
    expect(stats.get('c1')).toEqual({ requests: 2, pending: 0, completed: 1, refunds: 0 })
  })

  it('counts a refunded charge once, per customer', () => {
    const stats = customerBookingStats([
      row({ stripe_payment_intent_id: 'pi_1', status: 'cancelled', stripe_refund_id: 're_1' }),
      row({ stripe_payment_intent_id: 'pi_1', status: 'cancelled', stripe_refund_id: 're_1' }),
      row({ user_id: 'c2', stripe_payment_intent_id: 'pi_2', status: 'cancelled', stripe_refund_id: 're_2' }),
    ])
    expect(stats.get('c1')?.refunds).toBe(1)
    expect(stats.get('c2')?.refunds).toBe(1)
  })
})

describe('tidyProBookingStats', () => {
  it('counts each request a Pro received, and refunds only on jobs they took', () => {
    const stats = tidyProBookingStats([
      row({ status: 'pending' }),
      row({ status: 'completed', decision_status: 'accepted' }),
      row({ status: 'cancelled', decision_status: 'accepted', stripe_refund_id: 're_1' }),
      row({ status: 'cancelled', decision_status: 'pending', stripe_refund_id: 're_2' }),
      row({ tidy_pro_id: null }),
    ])
    expect(stats.get('p1')).toEqual({ requests: 4, pending: 1, completed: 1, refunds: 1 })
  })
})
