import type { createAdminClient } from '@/lib/supabase/admin'
import { cancelBookingAsAdmin, isAwaitingReplacements } from '@/lib/bookingRequestGroups'
import { dropSeriesForTidyPro } from '@/lib/recurringBookings'
import { cancelBookingForTidyPro, declineRequestForTidyPro } from '@/lib/tidyProCancellation'

type Admin = ReturnType<typeof createAdminClient>

export type AccountCancellationResult = {
  // A customer's bookings and requests canceled, each with a full refund.
  cancelled: number
  // A Tidy Pro's bookings and requests, handled as if they had canceled or declined.
  released: number
  // Jobs already under way, left for an admin to settle.
  inProgress: number
  // Ones that should have ended but couldn't (e.g. a failed refund).
  failed: number
}

type Cause = 'suspend' | 'ban'
type Outcome = { success: true } | { error: string }

const CUSTOMER_REASON: Record<Cause, string> = {
  suspend: 'Your Tydio account was suspended, so your upcoming bookings were canceled.',
  ban: 'Your Tydio account was banned, so your upcoming bookings were canceled.',
}

function notStarted(b: { progress_status: string | null }): boolean {
  return b.progress_status == null || b.progress_status === 'on_the_way'
}

// When someone is suspended or banned, everything still ahead of them ends.
//
// A customer's bookings and requests are canceled. The usual customer cancellation rules
// (late cancel) don't apply: they always get a full refund, Stripe fee included, through
// cancelBookingAsAdmin, which also emails them and tells the Tidy Pro. Their recurring
// series are canceled.
//
// A Tidy Pro is handled as if they'd backed out themselves: each request they haven't
// answered is declined and each accepted booking is canceled under the usual Tidy Pro
// rules (lib/tidyProCancellation). So the customer can choose someone else, other Tidy
// Pros asked alongside them can still accept, and if it's too late for that the customer
// is refunded in full. They're also dropped from their recurring series. Suspension has
// already paused them, so no new requests reach them.
//
// Jobs already started are left alone and counted, for an admin to settle.
// Admin accounts are skipped. Safe to run twice.
export async function cancelBookingsForAccounts(admin: Admin, profileIds: string[], cause: Cause): Promise<AccountCancellationResult> {
  const total: AccountCancellationResult = { cancelled: 0, released: 0, inProgress: 0, failed: 0 }
  if (profileIds.length === 0) return total

  const { data: profiles, error } = await admin.from('profiles').select('id, role').in('id', profileIds).neq('role', 'ADMIN')
  if (error) throw new Error(error.message)

  for (const profile of profiles ?? []) {
    const result = profile.role === 'TIDYPRO'
      ? await endForTidyPro(admin, profile.id, cause)
      : await cancelForCustomer(admin, profile.id, cause)
    total.cancelled += result.cancelled
    total.released += result.released
    total.inProgress += result.inProgress
    total.failed += result.failed
  }
  return total
}

type OpenBooking = {
  id: string
  status: string | null
  progress_status: string | null
  request_group_id: string | null
  cancelled_reason: string | null
  stripe_payment_intent_id: string | null
  stripe_refund_id: string | null
  cleaner_marked_complete_at: string | null
}

const OPEN_BOOKING_COLUMNS = 'id, status, progress_status, request_group_id, cancelled_reason, stripe_payment_intent_id, stripe_refund_id, cleaner_marked_complete_at'

async function cancelForCustomer(admin: Admin, customerId: string, cause: Cause): Promise<AccountCancellationResult> {
  // Stop the series first, so the scheduled job doesn't book a new visit meanwhile.
  const now = new Date().toISOString()
  await admin
    .from('recurring_bookings')
    .update({ status: 'cancelled', cancelled_at: now, updated_at: now })
    .eq('user_id', customerId)
    .eq('status', 'active')

  const { data } = await admin
    .from('bookings')
    .select(OPEN_BOOKING_COLUMNS)
    .eq('user_id', customerId)
    .in('status', ['pending', 'declined', 'scheduled'])
  // A declined request inside a group is settled by its group; only one still holding
  // the payment for replacements is a booking of its own.
  const open = ((data ?? []) as OpenBooking[]).filter((b) => b.status !== 'declined' || (isAwaitingReplacements(b) && !b.stripe_refund_id))

  // Every request in a group shares one payment, so canceling one cancels them all.
  const handledGroups = new Set<string>()
  const oncePerGroup = open.filter((b) => {
    if (b.status !== 'pending' || !b.request_group_id) return true
    if (handledGroups.has(b.request_group_id)) return false
    handledGroups.add(b.request_group_id)
    return true
  })

  return endAll(admin, oncePerGroup, 'cancelled', (booking) =>
    // An unpaid recurring visit has nothing to refund.
    cancelBookingAsAdmin(admin, booking.id, booking.stripe_payment_intent_id ? 'full' : 'none', CUSTOMER_REASON[cause])
  )
}

async function endForTidyPro(admin: Admin, tidyProId: string, cause: Cause): Promise<AccountCancellationResult> {
  const { data: series } = await admin.from('recurring_bookings').select('id').eq('tidy_pro_id', tidyProId).eq('status', 'active')
  for (const s of series ?? []) await dropSeriesForTidyPro(admin, s.id, tidyProId)

  const { data } = await admin
    .from('bookings')
    .select(OPEN_BOOKING_COLUMNS)
    .eq('tidy_pro_id', tidyProId)
    .in('status', ['pending', 'scheduled'])

  // The customer sees the usual "no longer available"; the note is for admins only.
  const reason = { cancellation_reason: 'no_longer_available', cancellation_note: cause === 'ban' ? 'Account banned' : 'Account suspended' }
  return endAll(admin, (data ?? []) as OpenBooking[], 'released', (booking) =>
    booking.status === 'pending'
      ? declineRequestForTidyPro(admin, { bookingId: booking.id, tidyProId })
      : cancelBookingForTidyPro(admin, { bookingId: booking.id, tidyProId, reason })
  )
}

async function endAll(
  admin: Admin,
  bookings: OpenBooking[],
  counter: 'cancelled' | 'released',
  end: (booking: OpenBooking) => Promise<Outcome>
): Promise<AccountCancellationResult> {
  const result: AccountCancellationResult = { cancelled: 0, released: 0, inProgress: 0, failed: 0 }

  for (const booking of bookings) {
    if (booking.status === 'scheduled' && (booking.cleaner_marked_complete_at || !notStarted(booking))) {
      if (!booking.cleaner_marked_complete_at) result.inProgress++
      continue
    }

    const outcome = await end(booking).catch((err: unknown): Outcome => ({ error: err instanceof Error ? err.message : 'Cancel failed' }))
    if ('success' in outcome) {
      result[counter]++
      continue
    }

    // Already ended some other way, e.g. along with another booking in its group.
    const { data: now } = await admin.from('bookings').select('status').eq('id', booking.id).maybeSingle()
    if (now?.status === 'cancelled' || (counter === 'released' && now?.status === 'declined')) continue
    console.error('[Tydio] Ending booking for suspended account failed', booking.id, outcome.error)
    result.failed++
  }
  return result
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

// For the admin's confirmation message.
export function describeAccountCancellations(result: AccountCancellationResult): string {
  const parts: string[] = []
  if (result.cancelled > 0) {
    parts.push(`Canceled ${plural(result.cancelled, 'upcoming booking')} or requests, each with a full refund.`)
  }
  if (result.released > 0) {
    parts.push(
      `Took the Tidy Pro off ${plural(result.released, 'upcoming booking')} or requests, as if they'd canceled: customers can choose someone else, or are refunded in full if it's too late.`
    )
  }
  if (result.inProgress > 0) {
    parts.push(`${plural(result.inProgress, 'job')} already under way ${result.inProgress === 1 ? 'was' : 'were'} left for you to settle.`)
  }
  if (result.failed > 0) {
    parts.push(`${plural(result.failed, 'booking')} couldn't be ended; check /admin/bookings.`)
  }
  return parts.length ? ` ${parts.join(' ')}` : ''
}
