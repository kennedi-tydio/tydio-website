import { describe, it, expect } from 'vitest'
import { admin, assertTestMode, readState } from './shared'

// Removes every booking-related row the test accounts created. With FULL=1 it also
// deletes the test accounts themselves.
describe('cleanup', () => {
  it('removes test bookings and related rows', async () => {
    assertTestMode()
    const s = readState()
    const db = admin()
    const people = [s.customerId, s.proId, s.pro2Id]

    const { data: bookings } = await db.from('bookings').select('id').or(`user_id.eq.${s.customerId},tidy_pro_id.in.(${s.proId},${s.pro2Id})`)
    const ids = (bookings ?? []).map((b) => b.id)
    const problems: string[] = []
    const del = async (table: string, column: string, values: string[]) => {
      if (values.length === 0) return
      const { error } = await db.from(table as never).delete().in(column, values)
      if (error && !/does not exist|schema cache/.test(error.message)) problems.push(`${table}.${column}: ${error.message}`)
    }

    for (const t of ['booking_tasks', 'booking_upcharges', 'booking_messages', 'job_notifications', 'completion_events', 'reports', 'booking_calls', 'customer_reviews_of_cleaners', 'cleaner_reviews_of_customers', 'reviews', 'payments', 'risk_events', 'messages']) {
      await del(t, 'booking_id', ids)
    }
    await db.from('bookings').update({ request_group_id: null }).in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
    await del('booking_request_groups', 'user_id', [s.customerId])
    await del('bookings', 'id', ids)
    for (const t of ['payment_methods', 'booking_drafts', 'notification_batches', 'push_subscriptions', 'push_tokens', 'user_addresses', 'customer_pets', 'tasks']) {
      await del(t, 'user_id', people)
    }

    if (process.env.FULL === '1') {
      await del('tidypro_profiles', 'id', [s.proId, s.pro2Id])
      await del('profiles', 'id', people)
    }

    const { data: left } = await db.from('bookings').select('id').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
    console.log(JSON.stringify({ deletedBookings: ids.length, problems }))
    expect(left ?? []).toHaveLength(0)
    expect(problems).toEqual([])
  })
})
