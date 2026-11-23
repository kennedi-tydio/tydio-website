import type { createAdminClient } from '@/lib/supabase/admin'
import { cancelBookingAsAdmin } from '@/lib/bookingRequestGroups'
import { listSeriesOccurrences, skipSeriesDates } from '@/lib/recurringOccurrences'
import { notifyCustomer } from '@/lib/customerNotifications'
import { notifyRecurringSeriesCancelledByAdmin, notifyRecurringVisitsSkippedByAdmin, type NotificationPayload } from '@/lib/notifications'
import { canSendSms, sendSmsForPayload } from '@/lib/sms'
import { sendPushForPayload } from '@/lib/push'

// The admin canceling a recurring series, or visits of one, from /admin/recurring. A
// visit already booked is canceled one at a time with the Bookings tab's cancel (its own
// refund choice); these cover the series itself and the dates it hasn't booked yet.

type Admin = ReturnType<typeof createAdminClient>

// The refunds offered for every booked visit at once. Half and custom are per visit, so
// they're left to each visit's own cancel.
export const SERIES_REFUNDS = ['full', 'minus_fee', 'none'] as const
export type SeriesRefund = (typeof SERIES_REFUNDS)[number]

export function isSeriesRefund(value: string): value is SeriesRefund {
  return (SERIES_REFUNDS as readonly string[]).includes(value)
}

const SERIES_COLUMNS = 'id, user_id, tidy_pro_id, tidy_pro_accepted_at, frequency, next_date, scheduled_time, time_zone, skipped_dates, status'

// Text (with consent) and push, as the Tidy Pro hears about other series changes.
async function notifySeriesTidyPro(admin: Admin, tidyProId: string, payload: NotificationPayload): Promise<void> {
  const { data: tidyPro } = await admin.from('tidypro_profiles').select('phone, sms_consent').eq('id', tidyProId).maybeSingle()
  if (canSendSms(tidyPro?.sms_consent ?? null, tidyPro?.phone ?? null)) {
    await sendSmsForPayload(tidyPro!.phone!, payload).catch(() => {})
  }
  await sendPushForPayload(tidyProId, payload).catch(() => {})
}

// Stops the series, then cancels every visit already booked that hasn't started, each
// with `refund` if it was charged (one not charged yet has nothing to refund). Visits in
// progress are left alone. The customer and the Tidy Pro (once they've accepted the
// series) are told the series is over; each canceled visit sends its own notice too.
export async function cancelSeriesAsAdmin(
  admin: Admin,
  seriesId: string,
  refund: SeriesRefund,
  reason: string | null
): Promise<{ success: true; cancelledVisits: number; failed: string[] } | { error: string }> {
  const { data: series } = await admin.from('recurring_bookings').select(SERIES_COLUMNS).eq('id', seriesId).maybeSingle()
  if (!series) return { error: 'Recurring booking not found.' }
  if (series.status !== 'active') return { error: 'This recurring booking is already canceled.' }

  const booked = (await listSeriesOccurrences(admin, series)).filter((o) => o.bookingId)
  if (refund === 'none' && !reason && booked.length) {
    const { data: paid } = await admin
      .from('bookings')
      .select('id')
      .in('id', booked.map((o) => o.bookingId!))
      .not('stripe_payment_intent_id', 'is', null)
      .limit(1)
    if (paid?.length) return { error: 'Give the customer a reason for not refunding their paid visits.' }
  }

  // Stop the series first, so the scheduled job doesn't book a new visit meanwhile.
  const now = new Date().toISOString()
  const { data: updated, error } = await admin
    .from('recurring_bookings')
    .update({ status: 'cancelled', cancelled_at: now, updated_at: now })
    .eq('id', seriesId)
    .eq('status', 'active')
    .select('id')
  if (error) return { error: error.message }
  if (!updated?.length) return { error: 'This recurring booking is already canceled.' }

  const { data: visits } = booked.length
    ? await admin.from('bookings').select('id, scheduled_date, stripe_payment_intent_id').in('id', booked.map((o) => o.bookingId!))
    : { data: [] }
  let cancelledVisits = 0
  const failed: string[] = []
  for (const visit of visits ?? []) {
    const result = await cancelBookingAsAdmin(admin, visit.id, visit.stripe_payment_intent_id ? refund : 'none', reason)
    if ('error' in result) failed.push(`${visit.scheduled_date ?? visit.id.slice(0, 8)}: ${result.error}`)
    else cancelledVisits++
  }

  await notifyCustomer(admin, series.user_id, notifyRecurringSeriesCancelledByAdmin('USER'))
  if (series.tidy_pro_id && series.tidy_pro_accepted_at) {
    await notifySeriesTidyPro(admin, series.tidy_pro_id, notifyRecurringSeriesCancelledByAdmin('TIDYPRO'))
  }
  if (failed.length) console.error(`Admin canceling visits of series ${seriesId}:`, failed)
  return { success: true, cancelledVisits, failed }
}

// Skips dates the series hasn't booked yet, so they're never booked or charged.
export async function skipSeriesDatesAsAdmin(admin: Admin, seriesId: string, dates: string[]): Promise<{ success: true } | { error: string }> {
  if (!dates.length) return { error: 'Choose a visit to cancel.' }
  const { data: series } = await admin.from('recurring_bookings').select(SERIES_COLUMNS).eq('id', seriesId).maybeSingle()
  if (!series) return { error: 'Recurring booking not found.' }

  const skipped = await skipSeriesDates(admin, seriesId, dates)
  if ('error' in skipped) return skipped

  await notifyCustomer(admin, series.user_id, notifyRecurringVisitsSkippedByAdmin('USER', dates))
  if (series.tidy_pro_id && series.tidy_pro_accepted_at) {
    await notifySeriesTidyPro(admin, series.tidy_pro_id, notifyRecurringVisitsSkippedByAdmin('TIDYPRO', dates))
  }
  return { success: true }
}
