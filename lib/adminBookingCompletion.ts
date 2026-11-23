// An admin finishing a booking for the Tidy Pro, for when they did the job but
// can't finish it in the app (photos that won't upload, a dead phone). It's
// the same completion as the Tidy Pro's own "Complete" button
// (markBookingDoneAction): the cleaning's rooms are ticked, the payout is sent
// (unless the admin put it on hold) and the customer is asked for a review. The
// one difference is that the after photos aren't required. Add-ons and Tidy
// Tasks without one stay unticked, so it's clear which have no photo.
import type { createAdminClient } from '@/lib/supabase/admin'
import { completeBookingPayout } from '@/lib/bookings'
import { notifyCustomer } from '@/lib/customerNotifications'
import { notifyBookingDone } from '@/lib/notifications'
import { userFacingError } from '@/lib/userFacingError'

type Admin = ReturnType<typeof createAdminClient>

// The rows of a Standard / Deep Cleaning (the whole home, a room).
const CLEANING_KINDS = ['full_service_home', 'full_service_room'] as const

// The Tidy Pro has arrived or is cleaning, and hasn't finished.
export function canAdminComplete(b: { status: string | null; progress_status: string | null; tidy_pro_id: string | null; cleaner_marked_complete_at: string | null }): boolean {
  return (
    b.status === 'scheduled' &&
    b.tidy_pro_id != null &&
    (b.progress_status === 'arrived' || b.progress_status === 'cleaning') &&
    b.cleaner_marked_complete_at == null
  )
}

export async function completeBookingAsAdmin(
  admin: Admin,
  bookingId: string
): Promise<{ success: true; warning?: string } | { error: string }> {
  const { data: booking, error: loadError } = await admin
    .from('bookings')
    .select('id, user_id, tidy_pro_id, status, progress_status, cleaner_marked_complete_at, suspended_for_upcharge_at, payment_due_at')
    .eq('id', bookingId)
    .maybeSingle()
  if (loadError) return { error: userFacingError(loadError) }
  if (!booking) return { error: 'Booking not found.' }
  if (!canAdminComplete(booking)) {
    return { error: 'Only a booking the Tidy Pro has arrived at or started can be marked complete.' }
  }
  if (booking.suspended_for_upcharge_at) return { error: 'This booking is on hold for an unpaid upcharge. Remove the upcharge or wait for the customer to pay it.' }
  if (booking.payment_due_at) return { error: 'The customer hasn’t paid for this visit yet, so it can’t be completed.' }

  const { data: marked, error } = await admin
    .from('bookings')
    .update({ progress_status: 'done' })
    .eq('id', bookingId)
    .eq('status', 'scheduled')
    .in('progress_status', ['arrived', 'cleaning'])
    .is('suspended_for_upcharge_at', null)
    .select('id')
  if (error) return { error: userFacingError(error) }
  // Finished, canceled or put on hold since it was loaded.
  if (!marked?.length) return { error: 'This booking changed since the page loaded. Refresh and try again.' }

  await admin
    .from('booking_tasks')
    .update({ is_completed: true, completed_at: new Date().toISOString() })
    .eq('booking_id', bookingId)
    .in('kind', CLEANING_KINDS)
    .eq('is_completed', false)

  // As when the Tidy Pro finishes: the booking completes and the payout is
  // sent, unless the admin has it on hold.
  const payout = await completeBookingPayout(admin, bookingId)
  await notifyCustomer(admin, booking.user_id, notifyBookingDone(bookingId))

  if ('error' in payout) {
    return { success: true, warning: `It's complete, but the payout didn't go through: ${payout.error}` }
  }
  return { success: true }
}
