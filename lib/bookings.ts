import type { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import { excludeHiddenReviews } from '@/lib/cleanerReviewWindow'
import { getHiddenReviews } from '@/lib/cleanerReviews'
import { LATE_CANCEL_REASON } from '@/lib/bookingRequestGroups'
import { userFacingError } from '@/lib/userFacingError'
import { CONTACT_INFO_BLOCKED_MESSAGE, detectContactInfo } from '@/lib/contactInfoFilter'
import { emailAdminContactInfoAttempt } from '@/lib/contactInfoAttemptEmail'
import { payOutTip } from '@/lib/tipPayout'
import { isPayoutHeld } from '@/lib/payoutHold'
import { BLOCKED_MESSAGE, isBlockedBetween } from '@/lib/userBlocks'

// Bookings that pay the cleaner something: completed, canceled late by the customer, an
// incident the admin settled, or one where the admin set the payout while refunding it.
export const OWES_CLEANER_FILTER = `status.eq.completed,cancelled_reason.eq.${LATE_CANCEL_REASON},incident_resolved_at.not.is.null,payout_adjusted_at.not.is.null`

// Shared by both sides' "send message" actions — inserts the chat message
// and flips the *other* side's unread dot on the Messages list. Doesn't
// check booking ownership; callers must verify the sender actually owns
// this booking before calling.
export async function sendBookingMessage(
  admin: ReturnType<typeof createAdminClient>,
  bookingId: string,
  senderRole: 'USER' | 'TIDYPRO',
  body: string
): Promise<{ success: true } | { error: string }> {
  const trimmed = body.trim()
  if (!trimmed) return { error: 'Message cannot be empty.' }
  if (trimmed.length > 2000) return { error: 'Message is too long.' }

  // Nothing goes through once either side has blocked the other (lib/userBlocks).
  const { data: parties } = await admin.from('bookings').select('user_id, tidy_pro_id').eq('id', bookingId).maybeSingle()
  if (await isBlockedBetween(admin, parties?.user_id ?? null, parties?.tidy_pro_id ?? null)) return { error: BLOCKED_MESSAGE }

  const contactInfo = detectContactInfo(trimmed)
  if (contactInfo) {
    await emailAdminContactInfoAttempt(admin, { bookingId, senderRole, body: trimmed, kind: contactInfo })
    return { error: CONTACT_INFO_BLOCKED_MESSAGE }
  }

  const { error } = await admin.from('booking_messages').insert({
    booking_id: bookingId,
    sender_role: senderRole,
    body: trimmed,
  })
  if (error) return { error: userFacingError(error) }

  const unreadColumn = senderRole === 'USER' ? 'tidy_pro_unread' : 'user_unread'
  await admin
    .from('bookings')
    .update({ [unreadColumn]: true } as never)
    .eq('id', bookingId)

  return { success: true }
}

// Bookings carrying an unread update for the Tidy Pro — a new request, a
// cancellation, or a customer's chat message — shown as the teal number
// badge on the Messages nav icon.
export async function getUnreadMessageCountForTidyPro(
  admin: ReturnType<typeof createAdminClient>,
  tidyProId: string
): Promise<number> {
  // Quote requests (lib/quoteRequests.ts) are listed in Messages too.
  const [{ count }, { count: quotes }] = await Promise.all([
    admin.from('bookings').select('id', { count: 'exact', head: true }).eq('tidy_pro_id', tidyProId).eq('tidy_pro_unread', true),
    admin.from('booking_quote_requests').select('id', { count: 'exact', head: true }).eq('tidy_pro_id', tidyProId).eq('tidy_pro_unread', true),
  ])

  return (count ?? 0) + (quotes ?? 0)
}

// Same as above, for the customer side of the thread.
export async function getUnreadMessageCountForUser(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<number> {
  const [{ count }, { count: quotes }] = await Promise.all([
    admin.from('bookings').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('user_unread', true),
    admin.from('booking_quote_requests').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('user_unread', true),
  ])

  return (count ?? 0) + (quotes ?? 0)
}

// The rating a Tidy Pro may see on their own screens — their stored rating
// minus any customer reviews still hidden from them (see cleanerReviewWindow).
// Customers always see the stored rating.
export async function getRatingVisibleToTidyPro(
  admin: ReturnType<typeof createAdminClient>,
  tidyProId: string,
  rating: number,
  reviewCount: number
): Promise<{ rating: number; reviewCount: number }> {
  const hidden = await getHiddenReviews(admin, tidyProId)
  return excludeHiddenReviews(rating, reviewCount, hidden.map((r) => r.rating))
}

// The single source of truth for "a booking finished" — pays the Tidy Pro
// their 80% share and closes out the booking. `progress_status: 'done'` is
// the real signal (there's no separate cleaner-side "mark complete" UI yet —
// that's later work), so this is written to be safe to call from anywhere
// that observes a booking sitting in that state without a matching payout:
// the (future) cleaner action that sets progress_status, and a lazy
// self-heal check on read for any other path that set it (admin tooling,
// direct edits, etc.) — not just the one call site that happened to set it.
//
// Also retries the transfer on an already-completed booking that still has
// no stripe_transfer_id — the transfer is tied to the customer's charge, so
// a still-pending balance doesn't block it, but any other Stripe failure
// does. Since completion itself must not roll back once the service has
// happened, that failure leaves the booking correctly completed but unpaid;
// calling this again (another page load, a cron, whatever) is how it catches up.
//
// A booking whose payout the admin has put on hold (lib/payoutHold) isn't paid: calling
// this does nothing until the hold is released (lib/adminPayout) or the admin settles it
// with a refund that sets the payout (lib/bookingPayoutAdjustment).
//
// A booking the customer canceled late is paid the same way, through the retry path:
// its cleaner_pay is set to their share of what Tydio kept when it's canceled. So is an
// incident (no access, no-show) once the admin settles it (see lib/bookingIncidents).
//
// Idempotent and race-safe: the status flip from 'scheduled' to 'completed'
// is a single conditional UPDATE that only one caller can ever win, so two
// concurrent callers can't both transfer on that path. The retry path is
// guarded by stripe_transfer_id still being null, which is set in the same
// request right after a transfer succeeds, keeping the race window tiny; a
// true double-click race could in principle double-transfer; acceptable for
// now given there's no concurrent-access pattern that would trigger it yet.
export async function completeBookingPayout(
  admin: ReturnType<typeof createAdminClient>,
  bookingId: string
): Promise<{ success: true } | { error: string }> {
  const { data: claimed, error: claimError } = await admin
    .from('bookings')
    .update({ status: 'completed', cleaner_marked_complete_at: new Date().toISOString() })
    .eq('id', bookingId)
    .eq('status', 'scheduled')
    .eq('progress_status', 'done')
    // A booking on hold for an unpaid upcharge can't finish (see lib/bookingUpcharges).
    .is('suspended_for_upcharge_at', null)
    .select('id, status, tidy_pro_id, cleaner_pay, stripe_transfer_id, stripe_payment_intent_id, payout_held_at')
    .maybeSingle()

  if (claimError) return { error: userFacingError(claimError) }

  let booking = claimed
  if (!booking) {
    // Not claimable here — either not in a 'done'-but-unpaid state at all,
    // or already completed. Check the latter case for a missing transfer.
    const { data: existing } = await admin
      .from('bookings')
      .select('id, status, cancelled_reason, incident_resolved_at, tidy_pro_id, cleaner_pay, stripe_transfer_id, stripe_payment_intent_id, payout_adjusted_at, payout_held_at')
      .eq('id', bookingId)
      .maybeSingle()
    const owesCleaner =
      existing?.status === 'completed' ||
      existing?.cancelled_reason === LATE_CANCEL_REASON ||
      existing?.incident_resolved_at != null ||
      existing?.payout_adjusted_at != null
    if (!existing || !owesCleaner || existing.stripe_transfer_id) {
      return { success: true }
    }
    booking = existing
  }

  if (booking.stripe_transfer_id || !booking.tidy_pro_id || !booking.cleaner_pay) return { success: true }
  // On hold while the admin looks into it.
  if (isPayoutHeld(booking)) return { success: true }

  const { data: tidyPro } = await admin
    .from('tidypro_profiles')
    .select('stripe_account_id, stripe_onboarding_completed')
    .eq('id', booking.tidy_pro_id)
    .maybeSingle()

  // If the Tidy Pro hasn't finished payouts onboarding, the booking still
  // completes — the transfer is skipped and retried the next time this runs.
  // The account exists as soon as they start onboarding, so its id alone
  // doesn't mean Stripe will accept a transfer to it yet.
  if (!tidyPro?.stripe_account_id || !tidyPro.stripe_onboarding_completed) return { success: true }

  // cleaner_pay includes their share of any upcharge, which is part of the booking
  // (see lib/bookingUpcharges), so this one transfer covers it.
  const payCents = Math.round(booking.cleaner_pay * 100)
  try {
    // A transfer that went out without being recorded (two callers at once, or the save
    // after it failed) is recorded now rather than sent again.
    const sent = await stripe.transfers.list({ transfer_group: bookingId, limit: 1 })
    if (sent.data[0]) {
      await admin.from('bookings').update({ stripe_transfer_id: sent.data[0].id }).eq('id', bookingId)
      return { success: true }
    }

    // Tied to the customer's charge, so the transfer goes through even while that
    // charge is still pending in our balance; Stripe releases it once the charge settles.
    // Stripe won't tie a transfer to a charge smaller than it, which a large upcharge
    // can cause; then it's paid from the balance.
    let sourceCharge: string | undefined
    if (booking.stripe_payment_intent_id) {
      const paymentIntent = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id)
      const latestCharge = paymentIntent.latest_charge
      if (paymentIntent.amount_received >= payCents) sourceCharge = typeof latestCharge === 'string' ? latestCharge : latestCharge?.id
    }

    const transfer = await stripe.transfers.create({
      amount: payCents,
      currency: 'usd',
      destination: tidyPro.stripe_account_id,
      transfer_group: bookingId,
      ...(sourceCharge ? { source_transaction: sourceCharge } : {}),
    })
    await admin.from('bookings').update({ stripe_transfer_id: transfer.id }).eq('id', bookingId)
  } catch (err) {
    // The booking is already marked completed at this point (correctly —
    // the service did happen) — a failed transfer needs a retry, not a
    // rollback of completion. The next call to this function will retry it.
    return { error: userFacingError(err, 'Completed, but the payout transfer failed.') }
  }

  return { success: true }
}

// Pays out everything a Tidy Pro was owed while they had no finished payout
// account — called the moment their onboarding completes, since nothing else
// would revisit those bookings.
export async function retryPayoutsForTidyPro(
  admin: ReturnType<typeof createAdminClient>,
  tidyProId: string
): Promise<void> {
  const { data: unpaid } = await admin
    .from('bookings')
    .select('id')
    .eq('tidy_pro_id', tidyProId)
    .or(OWES_CLEANER_FILTER)
    .is('stripe_transfer_id', null)
    .gt('cleaner_pay', 0)

  // Any the admin has on hold are skipped inside.
  for (const booking of unpaid ?? []) {
    const result = await completeBookingPayout(admin, booking.id).catch((err) => ({ error: String(err) }))
    if ('error' in result) console.error(`Payout for ${booking.id}:`, result.error)
  }

  // Tips held back the same way (no payout account yet, or a failed transfer).
  // payOutTip skips any that already went out.
  const { data: tipped } = await admin.from('bookings').select('id').eq('tidy_pro_id', tidyProId).gt('tip', 0)
  for (const booking of tipped ?? []) {
    await payOutTip(admin, booking.id).catch((err) => console.error(`Tip payout for ${booking.id}:`, err))
  }
}

// Payouts whose transfer failed: a completed booking, late cancellation, settled incident
// or admin-set payout with no transfer yet. Ones the admin has on hold are left alone. Only
// Tidy Pros who can be paid are tried, so one who hasn't finished payout setup isn't
// retried every run; they're paid when they finish it (retryPayoutsForTidyPro). Run by
// the scheduled job.
export async function retryDuePayouts(admin: ReturnType<typeof createAdminClient>): Promise<{ paid: number; failed: number }> {
  const { data: unpaid } = await admin
    .from('bookings')
    .select('id, tidy_pro_id')
    .or(OWES_CLEANER_FILTER)
    .is('stripe_transfer_id', null)
    .is('payout_held_at', null)
    .not('tidy_pro_id', 'is', null)
    .gt('cleaner_pay', 0)
    .limit(200)

  const proIds = [...new Set((unpaid ?? []).map((b) => b.tidy_pro_id!))]
  const { data: payable } = proIds.length
    ? await admin.from('tidypro_profiles').select('id').in('id', proIds).not('stripe_account_id', 'is', null).eq('stripe_onboarding_completed', true)
    : { data: [] }
  const canBePaid = new Set((payable ?? []).map((p) => p.id))

  let paid = 0
  let failed = 0
  for (const booking of (unpaid ?? []).filter((b) => canBePaid.has(b.tidy_pro_id!))) {
    const result = await completeBookingPayout(admin, booking.id).catch((err) => ({ error: String(err) }))
    if ('error' in result) {
      console.error(`Payout for ${booking.id}:`, result.error)
      failed++
    } else {
      paid++
    }
  }
  return { paid, failed }
}
