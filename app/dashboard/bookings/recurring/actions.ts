'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadCustomerSeries, newTidyProOptions } from '@/lib/recurringBookings'
import { userFacingError } from '@/lib/userFacingError'
import { listSeriesOccurrences, skipSeriesDates } from '@/lib/recurringOccurrences'
import { CUSTOMER_CANCEL_REASONS, parseCancellation, type Cancellation } from '@/lib/cancellationReasons'
import { cancelBookingRequestAction } from '@/app/dashboard/messages/[bookingId]/actions'
import { notifyRecurringSeriesCancelledByCustomer, notifyRecurringVisitSkippedByCustomer, type NotificationPayload } from '@/lib/notifications'
import { canSendSms, sendSmsForPayload } from '@/lib/sms'
import { sendPushForPayload } from '@/lib/push'

// The Tidy Pro hears about a change to their recurring booking by text (with consent) and push.
async function notifySeriesTidyPro(admin: ReturnType<typeof createAdminClient>, tidyProId: string, payload: NotificationPayload): Promise<void> {
  const { data: tidyPro } = await admin.from('tidypro_profiles').select('phone, sms_consent').eq('id', tidyProId).maybeSingle()
  if (canSendSms(tidyPro?.sms_consent ?? null, tidyPro?.phone ?? null)) {
    await sendSmsForPayload(tidyPro!.phone!, payload).catch(() => {})
  }
  await sendPushForPayload(tidyProId, payload).catch(() => {})
}

async function loadOwnSeries(admin: ReturnType<typeof createAdminClient>, customerId: string, seriesId: string) {
  const { data } = await admin
    .from('recurring_bookings')
    .select('id, user_id, tidy_pro_id, tidy_pro_accepted_at, frequency, next_date, scheduled_time, time_zone, skipped_dates, status')
    .eq('id', seriesId)
    .eq('user_id', customerId)
    .maybeSingle()
  return data
}

// Cancels the whole recurring booking: no more visits are booked, and every visit already
// booked that hasn't started is canceled too, under the usual rules for each (refunded
// minus the Stripe fee, 50% if it's less than 2 hours away, free if not charged yet).
export async function cancelRecurringBookingAction(seriesId: string, cancellation: Cancellation): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }
  const chosen = parseCancellation(CUSTOMER_CANCEL_REASONS, cancellation)
  if ('error' in chosen) return chosen

  const admin = createAdminClient()
  const series = await loadOwnSeries(admin, session.profileId, seriesId)
  if (!series || series.status !== 'active') return { error: 'This recurring booking was already canceled.' }
  const booked = (await listSeriesOccurrences(admin, series)).filter((o) => o.bookingId)

  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('recurring_bookings')
    .update({ status: 'cancelled', cancelled_at: now, updated_at: now })
    .eq('id', seriesId)
    .eq('user_id', session.profileId)
    .eq('status', 'active')
    .select('id')

  if (error) return { error: userFacingError(error) }
  if (!data || data.length === 0) return { error: 'This recurring booking was already canceled.' }

  // The customer saw any late-cancel refund for these in the list before confirming.
  const failed: string[] = []
  for (const visit of booked) {
    const result = await cancelBookingRequestAction(visit.bookingId!, cancellation, true)
    if ('error' in result) failed.push(`${visit.date}: ${result.error}`)
  }

  if (series.tidy_pro_id && series.tidy_pro_accepted_at) {
    const { data: customer } = await admin.from('profiles').select('first_name').eq('id', session.profileId).maybeSingle()
    await notifySeriesTidyPro(admin, series.tidy_pro_id, notifyRecurringSeriesCancelledByCustomer(customer?.first_name ?? 'Your customer'))
  }

  revalidatePath('/dashboard/bookings')
  revalidatePath('/dashboard')
  if (failed.length) {
    console.error(`Canceling visits of series ${seriesId}:`, failed)
    return { error: 'Your recurring booking is canceled, but a visit already booked couldn’t be canceled. Cancel it from its own page.' }
  }
  return { success: true }
}

// Cancels any of the upcoming visits (e.g. the 3rd and 5th). A booked one is canceled like
// any booking; ones not booked yet are skipped, so they're never booked or charged.
export async function cancelRecurringOccurrencesAction(
  seriesId: string,
  dates: string[],
  cancellation: Cancellation
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }
  const chosen = parseCancellation(CUSTOMER_CANCEL_REASONS, cancellation)
  if ('error' in chosen) return chosen
  if (!Array.isArray(dates) || dates.length === 0) return { error: 'Choose at least one visit to cancel.' }

  const admin = createAdminClient()
  const series = await loadOwnSeries(admin, session.profileId, seriesId)
  if (!series || series.status !== 'active') return { error: 'This recurring booking was already canceled.' }

  const occurrences = await listSeriesOccurrences(admin, series)
  const picked = [...new Set(dates)].map((date) => occurrences.find((o) => o.date === date))
  if (picked.some((o) => !o)) return { error: 'One of those visits can’t be canceled anymore. Refresh the page to see your visits.' }

  // Later visits first, in one update: they're only a date on the series.
  const later = picked.filter((o) => !o!.bookingId).map((o) => o!.date)
  if (later.length) {
    const skipped = await skipSeriesDates(admin, seriesId, later)
    if ('error' in skipped) return { error: userFacingError(skipped.error) }
    if (series.tidy_pro_id && series.tidy_pro_accepted_at) {
      const { data: customer } = await admin.from('profiles').select('first_name').eq('id', session.profileId).maybeSingle()
      await notifySeriesTidyPro(admin, series.tidy_pro_id, notifyRecurringVisitSkippedByCustomer(customer?.first_name ?? 'Your customer', later))
    }
  }

  // The customer saw any late-cancel refund for these in the list before confirming.
  for (const visit of picked.filter((o) => o!.bookingId)) {
    const result = await cancelBookingRequestAction(visit!.bookingId!, cancellation, true)
    if ('error' in result) return { error: later.length ? `The visits not booked yet are canceled, but: ${result.error}` : result.error }
  }

  revalidatePath('/dashboard/bookings')
  revalidatePath('/dashboard')
  return { success: true }
}

// The next visit not yet booked, and every one after, goes to this Tidy Pro instead.
export async function chooseRecurringTidyProAction(seriesId: string, tidyProId: string): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const admin = createAdminClient()
  const series = await loadCustomerSeries(admin, session.profileId, seriesId)
  if (!series) return { error: 'This recurring booking was canceled.' }

  // Checked the same way they were offered, so they can do the job at that time.
  const chosen = (await newTidyProOptions(admin, series)).find((o) => o.id === tidyProId)
  if (!chosen) return { error: 'That Tidy Pro is no longer available at this time. Please choose again.' }

  const { error } = await admin
    .from('recurring_bookings')
    .update({
      tidy_pro_id: chosen.id,
      tidy_pro_name: chosen.name,
      tidy_pro_photo_url: chosen.photoUrl,
      // They haven't accepted it yet: the next visit goes to them as a request, and
      // accepting it accepts the series (see lib/recurringBookings).
      tidy_pro_accepted_at: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', series.id)
    .eq('user_id', session.profileId)

  if (error) return { error: userFacingError(error) }

  revalidatePath('/dashboard/bookings')
  return { success: true }
}
