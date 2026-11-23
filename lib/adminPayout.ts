// The admin's manual control over a Tidy Pro's payout for a booking (lib/payoutHold):
// put it on hold before it goes out, e.g. while looking into a customer's complaint, and
// release it with Pay Tidy Pro. It's the same transfer completion would have made
// (completeBookingPayout). To pay less or nothing instead, the admin refunds the booking
// and sets the payout (lib/bookingPayoutAdjustment), which also takes back a payout that
// already went out.
import type { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import { completeBookingPayout } from '@/lib/bookings'
import { userFacingError } from '@/lib/userFacingError'

type Admin = ReturnType<typeof createAdminClient>

// A completed booking whose Tidy Pro hasn't been paid yet: on hold, or a transfer that
// didn't go through.
export function canAdminPayNow(b: { status: string | null; tidy_pro_id: string | null; cleaner_pay: number | null; stripe_transfer_id: string | null }): boolean {
  return b.status === 'completed' && b.tidy_pro_id != null && Number(b.cleaner_pay ?? 0) > 0 && !b.stripe_transfer_id
}

// An accepted or completed booking whose payout hasn't gone out and isn't held already.
// Once the admin has set the payout with a refund, that's the decision, so there's
// nothing left to hold.
export function canHoldPayout(b: {
  status: string | null
  tidy_pro_id: string | null
  stripe_transfer_id: string | null
  payout_held_at: string | null
  payout_adjusted_at: string | null
}): boolean {
  return (
    (b.status === 'scheduled' || b.status === 'completed') &&
    b.tidy_pro_id != null &&
    !b.stripe_transfer_id &&
    !b.payout_held_at &&
    !b.payout_adjusted_at
  )
}

const HOLD_NOTE_MAX = 500

export async function holdPayout(admin: Admin, bookingId: string, note: string | null): Promise<{ success: true } | { error: string }> {
  const { data: booking, error } = await admin
    .from('bookings')
    .select('id, status, tidy_pro_id, stripe_transfer_id, payout_held_at, payout_adjusted_at')
    .eq('id', bookingId)
    .maybeSingle()
  if (error) return { error: userFacingError(error) }
  if (!booking) return { error: 'Booking not found.' }
  if (booking.stripe_transfer_id) return { error: 'The payout has already been sent. To take it back, refund the booking and set the payout.' }
  if (booking.payout_held_at) return { error: 'This payout is already on hold.' }
  if (!canHoldPayout(booking)) return { error: 'Only an accepted or completed booking whose payout hasn’t been sent or set can be held.' }

  const { data: held, error: holdError } = await admin
    .from('bookings')
    .update({ payout_held_at: new Date().toISOString(), payout_hold_note: note?.trim().slice(0, HOLD_NOTE_MAX) || null })
    .eq('id', bookingId)
    .is('stripe_transfer_id', null)
    .is('payout_held_at', null)
    .select('id')
  if (holdError) return { error: userFacingError(holdError) }
  if (!held?.length) return { error: 'This booking just changed. Refresh and try again.' }

  // A transfer already under way when the hold landed can't be stopped: record it and say so.
  try {
    const sent = (await stripe.transfers.list({ transfer_group: bookingId, limit: 1 })).data[0]
    if (sent) {
      await admin.from('bookings').update({ stripe_transfer_id: sent.id, payout_held_at: null, payout_hold_note: null }).eq('id', bookingId)
      return { error: 'The payout had just been sent, so it can’t be held. To take it back, refund the booking and set the payout.' }
    }
  } catch (err) {
    console.error('Checking for a sent payout after holding', bookingId, err)
  }
  return { success: true }
}

// Takes the hold off without paying: for an accepted booking, which is paid as usual when
// it completes. A completed booking is released with payTidyProNow instead.
export async function removePayoutHold(admin: Admin, bookingId: string): Promise<{ success: true } | { error: string }> {
  const { data, error } = await admin
    .from('bookings')
    .update({ payout_held_at: null, payout_hold_note: null })
    .eq('id', bookingId)
    .not('payout_held_at', 'is', null)
    .neq('status', 'completed')
    .select('id')
  if (error) return { error: userFacingError(error) }
  if (!data?.length) return { error: 'This booking just changed. Refresh and try again.' }
  return { success: true }
}

// Releases any hold and sends the payout now.
export async function payTidyProNow(admin: Admin, bookingId: string): Promise<{ success: true; amount: number } | { error: string }> {
  const { data: booking, error } = await admin
    .from('bookings')
    .select('id, status, tidy_pro_id, cleaner_pay, stripe_transfer_id, payout_held_at')
    .eq('id', bookingId)
    .maybeSingle()
  if (error) return { error: userFacingError(error) }
  if (!booking) return { error: 'Booking not found.' }
  if (booking.stripe_transfer_id) return { error: 'The Tidy Pro has already been paid for this booking.' }
  if (!canAdminPayNow(booking)) return { error: 'Only a completed booking with a Tidy Pro and pay owed can be paid.' }

  const { data: tidyPro } = await admin
    .from('tidypro_profiles')
    .select('stripe_account_id, stripe_onboarding_completed')
    .eq('id', booking.tidy_pro_id!)
    .maybeSingle()
  if (!tidyPro?.stripe_account_id || !tidyPro.stripe_onboarding_completed) {
    return { error: 'The Tidy Pro hasn’t finished setting up payouts, so Stripe can’t pay them yet. They’re paid automatically once they finish.' }
  }

  if (booking.payout_held_at) {
    await admin.from('bookings').update({ payout_held_at: null, payout_hold_note: null }).eq('id', bookingId)
  }

  const result = await completeBookingPayout(admin, bookingId)
  if ('error' in result) return result

  // completeBookingPayout returns success when it has nothing to do, so check
  // the transfer really went out.
  const { data: after } = await admin.from('bookings').select('stripe_transfer_id').eq('id', bookingId).maybeSingle()
  if (!after?.stripe_transfer_id) return { error: 'The payout wasn’t sent. Refresh and try again.' }
  return { success: true, amount: Number(booking.cleaner_pay) }
}
