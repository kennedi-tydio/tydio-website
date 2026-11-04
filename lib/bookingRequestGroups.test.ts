/* eslint-disable @typescript-eslint/no-explicit-any -- test-only chainable Supabase query mock */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/stripe', () => ({
  stripe: {
    refunds: { create: vi.fn() },
    paymentIntents: { retrieve: vi.fn().mockResolvedValue({ amount_received: 3774 }) },
  },
}))
vi.mock('@/lib/sms', () => ({ canSendSms: () => false, sendSmsForPayload: vi.fn() }))
vi.mock('@/lib/push', () => ({ sendPushForPayload: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn().mockResolvedValue(undefined), emailShell: (b: string) => b, escapeHtml: (v: string) => v, TYDIO_ADMIN_EMAIL: 'a@example.com' }))

import { stripe } from '@/lib/stripe'
import { sendPushForPayload } from '@/lib/push'
import {
  ALL_DECLINED_REASON,
  NO_RESPONSE_REASON,
  canRequestReplacements,
  cancelGroupForCustomer,
  cancelOtherRequests,
  cleanerCancelledNote,
  closeGroupIfNoRequestsLeft,
  customerCancelledNote,
  expireBooking,
  expireUnacceptedBookings,
  isHiddenGroupRequest,
  restoreBookingTasks,
  validateReplacementSelection,
} from './bookingRequestGroups'

const refundCreate = vi.mocked(stripe.refunds.create)
const push = vi.mocked(sendPushForPayload)

// `results` gives what each awaited query on a table resolves to, in order.
function fakeAdmin(results: Record<string, any[]>, single: Record<string, any> = {}) {
  const updates: { table: string; values: any }[] = []
  const inserts: { table: string; values: any }[] = []
  const admin = {
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        update: (values: any) => {
          updates.push({ table, values })
          return chain
        },
        insert: async (values: any) => {
          inserts.push({ table, values })
          return {}
        },
        eq: () => chain,
        neq: () => chain,
        in: () => chain,
        is: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: single[table] ?? null }),
        then: (resolve: any) => resolve(results[table]?.shift() ?? { data: [] }),
      }
      return chain
    },
  } as any
  return { admin, updates, inserts }
}

beforeEach(() => {
  refundCreate.mockReset()
  refundCreate.mockResolvedValue({ id: 're_1' } as any)
  push.mockClear()
})

const task = (id: string, completed = true) => ({ id, name: id, notes: '', room: 'Kitchen', dirtLevel: null, unusual: [], completed })

describe('validateReplacementSelection', () => {
  const available = ['a', 'b', 'c', 'd']

  it('accepts 1 to 3 available cleaners', () => {
    expect(validateReplacementSelection(['a'], available)).toBeNull()
    expect(validateReplacementSelection(['a', 'b', 'c'], available)).toBeNull()
  })

  it('rejects none, more than 3, duplicates, and unavailable cleaners', () => {
    expect(validateReplacementSelection([], available)).toContain('at least one')
    expect(validateReplacementSelection(['a', 'b', 'c', 'd'], available)).toContain('up to 3')
    expect(validateReplacementSelection(['a', 'a'], available)).toContain('only once')
    expect(validateReplacementSelection(['z'], available)).toContain('no longer available')
  })
})

describe('expiry cutoff', () => {
  it('expires a pending booking inside the last hour, but not one further out', async () => {
    const row = { user_id: 'c', tidy_pro_id: 'p', status: 'pending', stripe_payment_intent_id: 'pi_9', stripe_refund_id: null, task_list: [], request_group_id: null, scheduled_date: '2026-11-03', time_zone: 'America/New_York' }
    const at9 = new Date('2026-11-03T14:00:00Z')
    const inside = fakeAdmin({ bookings: [{ data: [{ ...row, id: 'b1', scheduled_time: '10:00' }] }, { data: [{ id: 'b1' }] }] })
    expect(await expireUnacceptedBookings(inside.admin, at9)).toEqual({ expired: 1, failed: 0 })
    const outside = fakeAdmin({ bookings: [{ data: [{ ...row, id: 'b2', scheduled_time: '10:01' }] }] })
    expect(await expireUnacceptedBookings(outside.admin, at9)).toEqual({ expired: 0, failed: 0 })
  })
})

describe('canRequestReplacements', () => {
  const declined = {
    status: 'declined',
    request_group_id: null,
    scheduled_date: '2026-12-01',
    scheduled_time: '09:00',
    stripe_payment_intent_id: 'pi_1',
    stripe_refund_id: null,
  }
  const before = new Date('2026-11-03T12:00:00Z')

  it('allows a declined booking whose payment is still held', () => {
    expect(canRequestReplacements(declined, false, before)).toBe(true)
  })

  it('allows only one replacement round', () => {
    expect(canRequestReplacements(declined, true, before)).toBe(false)
    expect(canRequestReplacements({ ...declined, request_group_id: 'g1' }, false, before)).toBe(false)
  })

  it('refuses once refunded, or with no payment to carry over', () => {
    expect(canRequestReplacements({ ...declined, stripe_refund_id: 're_1' }, false, before)).toBe(false)
    expect(canRequestReplacements({ ...declined, stripe_payment_intent_id: null }, false, before)).toBe(false)
  })

  it('refuses anything not declined, or after the start time', () => {
    expect(canRequestReplacements({ ...declined, status: 'pending' }, false, before)).toBe(false)
    expect(canRequestReplacements(declined, false, new Date('2026-12-01T13:00:00Z'))).toBe(false)
  })
})

describe('notes', () => {
  it('explains a cancellation that was not the other person’s doing', () => {
    expect(cleanerCancelledNote('filled_by_other')).toContain('accepted this booking first')
    expect(cleanerCancelledNote(null)).toBeNull()
    expect(customerCancelledNote(ALL_DECLINED_REASON)).toContain('declined')
    expect(customerCancelledNote(NO_RESPONSE_REASON)).toContain('refunded')
    expect(customerCancelledNote(null)).toBeNull()
  })
})

describe('isHiddenGroupRequest', () => {
  it('hides lost and declined requests in a group, but not a normal booking', () => {
    expect(isHiddenGroupRequest({ status: 'cancelled', request_group_id: 'g1' })).toBe(true)
    expect(isHiddenGroupRequest({ status: 'declined', request_group_id: 'g1' })).toBe(true)
    expect(isHiddenGroupRequest({ status: 'scheduled', request_group_id: 'g1' })).toBe(false)
    expect(isHiddenGroupRequest({ status: 'declined', request_group_id: null })).toBe(false)
  })
})

describe('cancelOtherRequests', () => {
  it('cancels the rest with the filled reason', async () => {
    const { admin, updates } = fakeAdmin({ bookings: [{ data: [{ id: 'b2', tidy_pro_id: 'p2' }] }] })
    await cancelOtherRequests(admin, 'g1', 'b1')
    expect(updates[0].values).toMatchObject({ status: 'cancelled', cancelled_reason: 'filled_by_other' })
    expect(refundCreate).not.toHaveBeenCalled()
  })
})

describe('closeGroupIfNoRequestsLeft', () => {
  const openGroup = { data: [{ user_id: 'customer_1', stripe_payment_intent_id: 'pi_1', original_booking_id: 'b0' }] }

  it('does nothing while another cleaner can still accept', async () => {
    const { admin } = fakeAdmin({ bookings: [{ count: 1 }] })
    await closeGroupIfNoRequestsLeft(admin, 'g1')
    expect(refundCreate).not.toHaveBeenCalled()
  })

  it('once everyone has declined: refunds, cancels, returns tasks, and tells the customer', async () => {
    const { admin, updates, inserts } = fakeAdmin(
      { bookings: [{ count: 0 }], booking_request_groups: [openGroup] },
      { bookings: { task_list: [task('t1')] } }
    )
    await closeGroupIfNoRequestsLeft(admin, 'g1')

    expect(refundCreate).toHaveBeenCalledWith({ payment_intent: 'pi_1', amount: 3635 }, { idempotencyKey: 'refund-booking-pi_1' })
    expect(updates.find((u) => u.values.stripe_refund_id)?.values).toMatchObject({ status: 'cancelled', cancelled_reason: ALL_DECLINED_REASON })
    expect(inserts[0].values.task_list[0]).toMatchObject({ id: 't1', completed: false })
    expect(push).toHaveBeenCalled()
  })

  it('reopens the group if the refund fails, so it can be retried', async () => {
    refundCreate.mockRejectedValue(new Error('stripe down'))
    const { admin, updates } = fakeAdmin({ bookings: [{ count: 0 }], booking_request_groups: [openGroup] })
    await closeGroupIfNoRequestsLeft(admin, 'g1')
    expect(updates.at(-1)?.values).toEqual({ status: 'open' })
    expect(updates.some((u) => u.table === 'bookings')).toBe(false)
  })
})

describe('cancelGroupForCustomer', () => {
  it('refunds and cancels every request', async () => {
    const { admin } = fakeAdmin(
      {
        booking_request_groups: [{ data: [{ user_id: 'customer_1', stripe_payment_intent_id: 'pi_1', original_booking_id: 'b0' }] }],
        bookings: [{ data: [{ id: 'b1', tidy_pro_id: 'p1' }, { id: 'b2', tidy_pro_id: 'p2' }] }],
      },
      { bookings: { task_list: [] } }
    )
    expect(await cancelGroupForCustomer(admin, 'g1')).toEqual({ tidyProIds: ['p1', 'p2'] })
    expect(refundCreate).toHaveBeenCalledOnce()
  })

  it('refuses if a cleaner has already accepted', async () => {
    const { admin } = fakeAdmin({ booking_request_groups: [{ data: [] }] })
    expect(await cancelGroupForCustomer(admin, 'g1')).toHaveProperty('error')
    expect(refundCreate).not.toHaveBeenCalled()
  })
})

describe('restoreBookingTasks', () => {
  it('adds tasks back unselected, without duplicating ones still on the list', async () => {
    const { admin, updates } = fakeAdmin({}, { booking_drafts: { id: 'd1', task_list: [task('t1', false)] } })
    await restoreBookingTasks(admin, 'customer_1', [task('t1'), task('t2')])
    expect(updates[0].values.task_list.map((t: any) => [t.id, t.completed])).toEqual([
      ['t1', false],
      ['t2', false],
    ])
  })

  it('starts a new list if the customer no longer has one', async () => {
    const { admin, inserts } = fakeAdmin({})
    await restoreBookingTasks(admin, 'customer_1', [task('t1')])
    expect(inserts[0].table).toBe('booking_drafts')
    expect(inserts[0].values.task_list[0].completed).toBe(false)
  })
})

describe('expireBooking', () => {
  const booking = { id: 'b1', user_id: 'customer_1', tidy_pro_id: 'p1', status: 'pending', stripe_payment_intent_id: 'pi_1', task_list: [task('t1')] }

  it('refunds, cancels, and returns the tasks', async () => {
    const { admin, updates, inserts } = fakeAdmin({ bookings: [{ data: [{ id: 'b1' }] }] })
    await expireBooking(admin, booking)
    expect(refundCreate).toHaveBeenCalledOnce()
    expect(updates[0].values).toMatchObject({ status: 'cancelled', cancelled_reason: NO_RESPONSE_REASON, stripe_refund_id: 're_1' })
    expect(inserts[0].table).toBe('booking_drafts')
  })

  it('leaves tasks and notifications alone if the booking changed first', async () => {
    const { admin, inserts } = fakeAdmin({ bookings: [{ data: [] }] })
    await expireBooking(admin, booking)
    expect(inserts).toEqual([])
    expect(push).not.toHaveBeenCalled()
  })
})

describe('expireUnacceptedBookings', () => {
  const now = new Date('2026-12-01T15:00:00Z')
  const base = { user_id: 'customer_1', tidy_pro_id: 'p1', scheduled_date: '2026-12-01', scheduled_time: '09:00', stripe_refund_id: null, task_list: [], request_group_id: null }

  it('leaves anything that has not started yet', async () => {
    const { admin } = fakeAdmin({
      bookings: [{ data: [{ ...base, id: 'b1', status: 'pending', stripe_payment_intent_id: 'pi_1', scheduled_time: '12:00' }] }],
    })
    expect(await expireUnacceptedBookings(admin, now)).toEqual({ expired: 0, failed: 0 })
    expect(refundCreate).not.toHaveBeenCalled()
  })

  it('expires a started request nobody answered', async () => {
    const { admin } = fakeAdmin({
      bookings: [{ data: [{ ...base, id: 'b1', status: 'pending', stripe_payment_intent_id: 'pi_1' }] }, { data: [{ id: 'b1' }] }],
    })
    expect(await expireUnacceptedBookings(admin, now)).toEqual({ expired: 1, failed: 0 })
    expect(refundCreate).toHaveBeenCalledOnce()
  })

  it('does not refund a declined booking whose replacement was already accepted', async () => {
    const { admin } = fakeAdmin({
      bookings: [{ data: [{ ...base, id: 'b0', status: 'declined', stripe_payment_intent_id: 'pi_1' }] }],
      booking_request_groups: [{ data: [{ id: 'g1', original_booking_id: 'b0', status: 'filled' }] }],
    })
    expect(await expireUnacceptedBookings(admin, now)).toEqual({ expired: 0, failed: 0 })
    expect(refundCreate).not.toHaveBeenCalled()
  })

  it('counts a failed refund and carries on', async () => {
    refundCreate.mockRejectedValueOnce(new Error('stripe down'))
    const { admin } = fakeAdmin({
      bookings: [
        { data: [{ ...base, id: 'b1', status: 'pending', stripe_payment_intent_id: 'pi_1' }, { ...base, id: 'b2', status: 'pending', stripe_payment_intent_id: 'pi_2' }] },
        { data: [{ id: 'b2' }] },
      ],
    })
    expect(await expireUnacceptedBookings(admin, now)).toEqual({ expired: 1, failed: 1 })
  })
})
