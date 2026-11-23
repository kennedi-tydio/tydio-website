import type { createAdminClient } from '@/lib/supabase/admin'
import { REQUEST_FILLED_REASON } from '@/lib/bookingRequestGroups'

type Admin = ReturnType<typeof createAdminClient>

// Per-user booking counts for the admin Users table.
//
// Customers: one request is one charge. A request sent to several Tidy Pros (or re-sent
// after a decline) is several booking rows sharing a payment, so rows are grouped by
// payment, then request group, then booking id, and each group counts once.
// Tidy Pros: every booking row addressed to them is a request they received.
//
// Refunds are the ones the app recorded on the booking (stripe_refund_id). Refunds made
// only in Stripe's dashboard aren't on the booking; the Refunds page lists those.

export type UserBookingStats = { requests: number; pending: number; completed: number; refunds: number }

export const NO_BOOKING_STATS: UserBookingStats = { requests: 0, pending: 0, completed: 0, refunds: 0 }

export type BookingStatsRow = {
  id: string
  user_id: string
  tidy_pro_id: string | null
  status: string | null
  decision_status: string | null
  request_group_id: string | null
  stripe_payment_intent_id: string | null
  stripe_refund_id: string | null
  cancelled_reason: string | null
}

function requestKey(b: BookingStatsRow): string {
  return b.stripe_payment_intent_id ?? b.request_group_id ?? b.id
}

export function customerBookingStats(rows: BookingStatsRow[]): Map<string, UserBookingStats> {
  const groups = new Map<string, { userId: string; rows: BookingStatsRow[] }>()
  for (const b of rows) {
    const key = `${b.user_id}:${requestKey(b)}`
    const group = groups.get(key) ?? { userId: b.user_id, rows: [] }
    group.rows.push(b)
    groups.set(key, group)
  }

  const stats = new Map<string, UserBookingStats>()
  for (const { userId, rows: group } of groups.values()) {
    const s = stats.get(userId) ?? { ...NO_BOOKING_STATS }
    s.requests += 1
    if (group.some((b) => b.status === 'completed')) s.completed += 1
    // Still waiting on a Tidy Pro: some copy is pending and none has been taken.
    else if (group.some((b) => b.status === 'pending') && !group.some((b) => b.status === 'scheduled')) s.pending += 1
    if (group.some((b) => b.stripe_refund_id)) s.refunds += 1
    stats.set(userId, s)
  }
  return stats
}

export function tidyProBookingStats(rows: BookingStatsRow[]): Map<string, UserBookingStats> {
  const stats = new Map<string, UserBookingStats>()
  for (const b of rows) {
    if (!b.tidy_pro_id) continue
    const s = stats.get(b.tidy_pro_id) ?? { ...NO_BOOKING_STATS }
    s.requests += 1
    if (b.status === 'pending') s.pending += 1
    if (b.status === 'completed') s.completed += 1
    // Only jobs this Pro actually took; a request someone else filled isn't theirs.
    if (b.stripe_refund_id && b.decision_status === 'accepted' && b.cancelled_reason !== REQUEST_FILLED_REASON) s.refunds += 1
    stats.set(b.tidy_pro_id, s)
  }
  return stats
}

const COLUMNS = 'id, user_id, tidy_pro_id, status, decision_status, request_group_id, stripe_payment_intent_id, stripe_refund_id, cancelled_reason'
const PAGE = 1000

async function loadAll(admin: Admin, column: 'user_id' | 'tidy_pro_id', ids: string[]): Promise<BookingStatsRow[]> {
  if (ids.length === 0) return []
  const rows: BookingStatsRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin.from('bookings').select(COLUMNS).in(column, ids).order('id').range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as BookingStatsRow[]))
    if (!data || data.length < PAGE) return rows
  }
}

export async function loadUserBookingStats(
  admin: Admin,
  customerIds: string[],
  tidyProIds: string[]
): Promise<Map<string, UserBookingStats>> {
  const [customerRows, proRows] = await Promise.all([loadAll(admin, 'user_id', customerIds), loadAll(admin, 'tidy_pro_id', tidyProIds)])
  return new Map([...customerBookingStats(customerRows), ...tidyProBookingStats(proRows)])
}
