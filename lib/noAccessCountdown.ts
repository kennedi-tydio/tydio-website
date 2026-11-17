import { revalidatePath } from 'next/cache'
import type { createAdminClient } from '@/lib/supabase/admin'
import { sendUnableToAccessEscalation } from '@/lib/bookingIncidentEmail'
import { userFacingError } from '@/lib/userFacingError'

type Admin = ReturnType<typeof createAdminClient>

// Starts the "Unable to access location" countdown: puts the booking in 'arrived' (the
// no-access countdown screen) and stamps when it began. Allowed at the door (on the way)
// or from the task list before any task is done. Pressing it again while already waiting
// keeps the countdown where it is. The admin is emailed the first time only.
// Used by the button and by a customer report of "I can't enter the property".
export async function startNoAccessCountdown(
  admin: Admin,
  bookingId: string,
  tidyProId: string
): Promise<{ success: true } | { error: string }> {
  const { data: booking } = await admin
    .from('bookings')
    .select('id, status, progress_status, arrived_at, no_access_reported_at')
    .eq('id', bookingId)
    .eq('tidy_pro_id', tidyProId)
    .maybeSingle()

  if (!booking) return { error: 'Booking not found.' }
  if (booking.status !== 'scheduled' || !['on_the_way', 'arrived', 'cleaning'].includes(booking.progress_status ?? '')) {
    return { error: 'This booking is not in progress.' }
  }

  if (booking.progress_status === 'cleaning') {
    const { count } = await admin
      .from('booking_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('booking_id', bookingId)
      .eq('is_completed', true)
    if ((count ?? 0) > 0) return { error: 'You’ve already finished a task, so you can’t report no access now.' }
  }

  const now = new Date()
  const { error } = await admin
    .from('bookings')
    .update({
      progress_status: 'arrived',
      arrived_at: booking.arrived_at ?? now.toISOString(),
      no_access_reported_at: booking.progress_status === 'arrived' && booking.no_access_reported_at ? booking.no_access_reported_at : now.toISOString(),
    })
    .eq('id', bookingId)
  if (error) return { error: userFacingError(error) }

  if (!booking.no_access_reported_at) {
    await sendUnableToAccessEscalation(admin, bookingId, now).catch((err) =>
      console.error('[Tydio] Unable to access admin email failed:', bookingId, err)
    )
  }

  return { success: true }
}

// The pages that show the countdown, or that the customer sees it change on.
export function revalidateNoAccessPaths(bookingId: string): void {
  revalidatePath(`/pro/bookings/${bookingId}`)
  revalidatePath(`/pro/messages/${bookingId}`)
  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/bookings/${bookingId}`)
}
