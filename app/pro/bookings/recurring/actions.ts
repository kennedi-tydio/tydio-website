'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { pendingAmendment } from '@/lib/legal/agreementAmendments'
import { CLEANER_CANCEL_REASONS, parseCancellation, type Cancellation } from '@/lib/cancellationReasons'
import { dropSeriesForTidyPro } from '@/lib/recurringBookings'
import { cancelBookingForTidyPro, upcomingSeriesVisits } from '@/lib/tidyProCancellation'
import { listSeriesOccurrences, skipSeriesDates } from '@/lib/recurringOccurrences'
import { notifyCustomer } from '@/lib/customerNotifications'
import { notifyRecurringVisitsSkippedByTidyPro } from '@/lib/notifications'
import { userFacingError } from '@/lib/userFacingError'

// The Tidy Pro canceling from their Jobs tab: the whole recurring booking, or one visit of
// it. The customer is told either way (the Tidy Pro isn't texted about their own cancel).

const UNSIGNED_AMENDMENT_ERROR = 'Please sign the update to your contractor agreement before making changes. Reload the page to sign it.'

async function loadMySeries(admin: ReturnType<typeof createAdminClient>, tidyProId: string, seriesId: string) {
  const { data } = await admin
    .from('recurring_bookings')
    .select('id, user_id, tidy_pro_id, frequency, next_date, scheduled_time, time_zone, skipped_dates, status')
    .eq('id', seriesId)
    .eq('tidy_pro_id', tidyProId)
    .eq('status', 'active')
    .maybeSingle()
  return data
}

function revalidateJobs() {
  revalidatePath('/pro/bookings')
  revalidatePath('/pro/dashboard')
  revalidatePath('/dashboard/bookings')
  revalidatePath('/dashboard')
}

// Drops the series: no more visits come to them, the customer is asked to choose someone
// else, and every visit already on their schedule is canceled under the usual rules.
export async function cancelSeriesAsTidyProAction(seriesId: string, cancellation: Cancellation): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }
  const chosen = parseCancellation(CLEANER_CANCEL_REASONS, cancellation)
  if ('error' in chosen) return chosen

  const admin = createAdminClient()
  if (await pendingAmendment(admin, session.profileId)) return { error: UNSIGNED_AMENDMENT_ERROR }
  if (!(await loadMySeries(admin, session.profileId, seriesId))) return { error: 'This recurring booking isn’t yours anymore.' }

  // Read before dropping: the visits stay theirs until each is canceled.
  const visitIds = await upcomingSeriesVisits(admin, seriesId, session.profileId)
  const dropped = await dropSeriesForTidyPro(admin, seriesId, session.profileId)
  if ('error' in dropped) return { error: userFacingError(dropped.error) }

  let failed = 0
  for (const visitId of visitIds) {
    const result = await cancelBookingForTidyPro(admin, {
      bookingId: visitId,
      tidyProId: session.profileId,
      reason: { cancellation_reason: chosen.reason, cancellation_note: chosen.note },
    })
    if ('error' in result) {
      failed++
      console.error(`Canceling recurring visit ${visitId}:`, result.error)
    }
    revalidatePath(`/pro/messages/${visitId}`)
    revalidatePath(`/dashboard/messages/${visitId}`)
  }

  revalidateJobs()
  if (failed) return { error: 'The recurring booking is canceled, but a visit already booked couldn’t be canceled. Cancel it from its own page.' }
  return { success: true }
}

// Visits: a booked one is canceled like any accepted booking (the customer is refunded
// in full and can choose other Tidy Pros); a later one is skipped, so it's never booked.
// Any of the upcoming visits (e.g. the 3rd and 5th).
export async function cancelOccurrencesAsTidyProAction(
  seriesId: string,
  dates: string[],
  cancellation: Cancellation
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }
  const chosen = parseCancellation(CLEANER_CANCEL_REASONS, cancellation)
  if ('error' in chosen) return chosen
  if (!Array.isArray(dates) || dates.length === 0) return { error: 'Choose at least one visit to cancel.' }

  const admin = createAdminClient()
  if (await pendingAmendment(admin, session.profileId)) return { error: UNSIGNED_AMENDMENT_ERROR }
  const series = await loadMySeries(admin, session.profileId, seriesId)
  if (!series) return { error: 'This recurring booking isn’t yours anymore.' }

  const occurrences = await listSeriesOccurrences(admin, series, { tidyProId: session.profileId })
  const picked = [...new Set(dates)].map((date) => occurrences.find((o) => o.date === date))
  if (picked.some((o) => !o)) return { error: 'One of those visits can’t be canceled anymore. Refresh the page to see the visits.' }

  // Later visits first, in one update, with one message to the customer.
  const later = picked.filter((o) => !o!.bookingId).map((o) => o!.date)
  if (later.length) {
    const skipped = await skipSeriesDates(admin, seriesId, later)
    if ('error' in skipped) return { error: userFacingError(skipped.error) }
    const { data: me } = await admin.from('profiles').select('first_name').eq('id', session.profileId).maybeSingle()
    await notifyCustomer(admin, series.user_id, notifyRecurringVisitsSkippedByTidyPro(me?.first_name ?? 'Your Tidy Pro', later))
  }

  for (const visit of picked.filter((o) => o!.bookingId)) {
    const result = await cancelBookingForTidyPro(admin, {
      bookingId: visit!.bookingId!,
      tidyProId: session.profileId,
      reason: { cancellation_reason: chosen.reason, cancellation_note: chosen.note },
    })
    if ('error' in result) return { error: later.length ? `The visits not booked yet are canceled, but: ${result.error}` : result.error }
    revalidatePath(`/pro/messages/${visit!.bookingId}`)
    revalidatePath(`/dashboard/messages/${visit!.bookingId}`)
  }

  revalidateJobs()
  return { success: true }
}
