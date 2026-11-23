import type { createAdminClient } from '@/lib/supabase/admin'
import { findAvailableCleaners, type CleanerMatch } from '@/lib/cleanerMatching'
import { requiredServicesForTasks } from '@/lib/tidyProServices'
import { DEFAULT_BOOKING_TIME_ZONE, bookingStartInstant, hasAcceptanceWindowClosed, isValidTimeZone, shiftDateISO, todayInZone } from '@/lib/bookingTime'
import { RECURRING_LEAD_DAYS, isRecurrenceFrequency, isVisitDue, nextVisitDate, recurringPaymentDueAt, type RecurrenceFrequency } from '@/lib/recurrence'
import { bookingBlockedByAccess, bookingBlockedBySuspension } from '@/lib/accountSuspension'
import { placeBooking } from '@/lib/placeBooking'
import { notifyCustomer } from '@/lib/customerNotifications'
import {
  notifyRecurringSeriesDroppedByTidyPro,
  notifyRecurringVisitBooked,
  notifyRecurringVisitCancelledByTidyPro,
  notifyRecurringVisitFailed,
  notifyRecurringVisitRequested,
} from '@/lib/notifications'
import { resolveStatePricing, resolveLocationSquareFootage } from '@/app/dashboard/taskPricing'
import { bookingDurationMinutes, combineWithFullService, priceTasksPart } from '@/lib/bookingPricing'
import { requiredServiceForFullService, type FullServiceSelection } from '@/lib/fullService'
import { bookableSelection, fullServiceMinutes, quotesForTidyPros } from '@/lib/fullServiceBooking'
import { servicePriceForCleaner } from '@/lib/pricingRules'
import { dropUnmatchedLaundryLinks } from '@/lib/laundry'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import type { TidyTask } from '@/app/dashboard/types'

type Admin = ReturnType<typeof createAdminClient>

// A recurring booking is a series: the customer books the first visit as usual, and each
// next visit is booked for them, with the same Tidy Pro, tasks, place, time and card,
// RECURRING_LEAD_DAYS before it. Each visit is its own booking.
//
// The Tidy Pro who accepts a visit accepts the series (tidy_pro_accepted_at), so from
// then on each next visit goes straight on their schedule, accepted, and is charged 3
// days before it (lib/recurringPayments). If they're away, off or booked that day, that
// visit is skipped and the customer told. Until the series is accepted (a new series, or
// a new Tidy Pro the customer picked), each visit is charged when it's booked and sent to
// the Tidy Pro as a request, like any other booking.
//
// The Tidy Pro can cancel one visit, or drop the whole series (dropSeriesForTidyPro),
// which leaves the customer to choose a new Tidy Pro. Canceling the series stops new
// visits; ones already booked stay until canceled themselves. Choosing a new Tidy Pro
// applies from the next visit not yet booked.

export { isRecurrenceFrequency, recurrenceLabel, type RecurrenceFrequency } from '@/lib/recurrence'

export type RecurringSeries = {
  id: string
  user_id: string
  tidy_pro_id: string | null
  frequency: string
  next_date: string
  scheduled_time: string
  time_zone: string
  scheduled_location: unknown
  task_list: unknown
  // Standard / Deep Cleaning every visit repeats (FullServiceSelection), or null.
  full_service?: unknown
  notes: string | null
  entry_instructions: string | null
  will_provide_supplies: boolean
  payment_method_id: string | null
  tidy_pro_accepted_at: string | null
  // Dates canceled before they were booked (lib/recurringOccurrences); never booked.
  skipped_dates?: string[] | null
}

const SERIES_COLUMNS =
  'id, user_id, tidy_pro_id, frequency, next_date, scheduled_time, time_zone, scheduled_location, task_list, full_service, notes, entry_instructions, will_provide_supplies, payment_method_id, tidy_pro_accepted_at, skipped_dates'

// Started when the first visit is booked. That visit's requests are linked to it.
export async function startRecurringSeries(
  admin: Admin,
  input: {
    customerId: string
    tidyProId: string
    tidyProName: string
    frequency: RecurrenceFrequency
    firstDate: string
    time: string
    timeZone: string
    location: ScheduledLocation | null
    taskList: TidyTask[]
    fullService?: FullServiceSelection | null
    notes: string | null
    entryInstructions: string | null
    suppliesProvided: boolean
    paymentMethodId: string
    firstBookingId: string
  }
): Promise<void> {
  const { data: tidyPro } = await admin.from('tidypro_profiles').select('profile_photo_url').eq('id', input.tidyProId).maybeSingle()
  const { data: series, error } = await admin
    .from('recurring_bookings')
    .insert({
      user_id: input.customerId,
      tidy_pro_id: input.tidyProId,
      tidy_pro_name: input.tidyProName,
      tidy_pro_photo_url: tidyPro?.profile_photo_url ?? null,
      frequency: input.frequency,
      start_date: input.firstDate,
      next_date: nextVisitDate(input.firstDate, input.frequency),
      scheduled_time: input.time,
      time_zone: input.timeZone,
      scheduled_location: input.location as never,
      task_list: dropUnmatchedLaundryLinks(input.taskList.filter((t) => t.completed)) as never,
      // With its visit-length estimate, so later visits (booked without the AI) keep it.
      full_service: (input.fullService ? { ...input.fullService, step: 'notes' } : null) as never,
      notes: input.notes,
      entry_instructions: input.entryInstructions,
      will_provide_supplies: input.suppliesProvided,
      payment_method_id: input.paymentMethodId,
    })
    .select('id')
    .single()
  if (error || !series) throw new Error(`Failed to start recurring booking: ${error?.message}`)

  // Every request sent for the first visit (the customer may have asked extra Tidy Pros).
  const { data: first } = await admin.from('bookings').select('request_group_id').eq('id', input.firstBookingId).maybeSingle()
  const linked = admin.from('bookings').update({ recurring_booking_id: series.id })
  await (first?.request_group_id ? linked.eq('request_group_id', first.request_group_id) : linked.eq('id', input.firstBookingId))
}

// Books every visit that's come due. Each series' next date is moved on before its visit
// is booked, and only by the run that moved it, so overlapping runs never book (or
// charge for) the same visit twice. A visit that can't be booked is skipped, and the
// customer told why.
export async function bookDueRecurringVisits(admin: Admin, now: Date = new Date()): Promise<{ booked: number; failed: number; skipped: number }> {
  const result = { booked: 0, failed: 0, skipped: 0 }

  // Due in some zone: the latest "today" anywhere is at most a day ahead of UTC.
  const horizon = shiftDateISO(now.toISOString().slice(0, 10), RECURRING_LEAD_DAYS + 1)
  const { data: due } = await admin
    .from('recurring_bookings')
    .select(SERIES_COLUMNS)
    .eq('status', 'active')
    .lte('next_date', horizon)

  for (const series of (due ?? []) as RecurringSeries[]) {
    if (!isRecurrenceFrequency(series.frequency)) continue
    const timeZone = isValidTimeZone(series.time_zone) ? series.time_zone : DEFAULT_BOOKING_TIME_ZONE
    if (!isVisitDue(series.next_date, todayInZone(timeZone, now))) continue

    const visitDate = series.next_date
    const { data: claimed } = await admin
      .from('recurring_bookings')
      .update({ next_date: nextVisitDate(visitDate, series.frequency), updated_at: now.toISOString() })
      .eq('id', series.id)
      .eq('status', 'active')
      .eq('next_date', visitDate)
      .select('id')
    if (!claimed || claimed.length === 0) continue

    // Canceled ahead of time by the customer or the Tidy Pro: not booked, and the date is
    // dropped from the list now that it's been passed over.
    const skipped = series.skipped_dates ?? []
    if (skipped.includes(visitDate)) {
      await admin
        .from('recurring_bookings')
        .update({ skipped_dates: skipped.filter((d) => d !== visitDate) })
        .eq('id', series.id)
      result.skipped += 1
      continue
    }

    // Too late to be accepted (the job didn't run in time): skipped without a charge.
    if (hasAcceptanceWindowClosed(visitDate, series.scheduled_time, now, timeZone)) {
      result.skipped += 1
      continue
    }

    const accepted = series.tidy_pro_accepted_at != null && series.tidy_pro_id != null
    const outcome = await bookVisit(admin, series, visitDate, timeZone, accepted)
    await admin
      .from('recurring_bookings')
      .update({ last_error: 'error' in outcome ? outcome.error : null, updated_at: new Date().toISOString() })
      .eq('id', series.id)

    if ('error' in outcome) {
      result.failed += 1
      const payload = outcome.tidyProUnavailable
        ? notifyRecurringVisitCancelledByTidyPro(outcome.tidyProUnavailable, visitDate)
        : notifyRecurringVisitFailed(visitDate, outcome.error)
      await notifyCustomer(admin, series.user_id, payload).catch(() => {})
    } else {
      result.booked += 1
      const payload = accepted
        ? notifyRecurringVisitBooked(outcome.tidyProName, visitDate, outcome.bookingId)
        : notifyRecurringVisitRequested(outcome.tidyProName, visitDate, outcome.bookingId)
      await notifyCustomer(admin, series.user_id, payload).catch(() => {})
    }
  }

  return result
}

// Accepted: the visit goes on the Tidy Pro's schedule unpaid, charged 3 days before. If
// they're away, off or booked that day, that visit is skipped (tidyProUnavailable is
// their first name, for telling the customer); the series carries on.
async function bookVisit(
  admin: Admin,
  series: RecurringSeries,
  date: string,
  timeZone: string,
  accepted: boolean
): Promise<{ bookingId: string; tidyProName: string } | { error: string; tidyProUnavailable?: string }> {
  if (!series.tidy_pro_id) return { error: 'Your recurring booking doesn’t have a Tidy Pro right now. Choose a new Tidy Pro to keep it going.' }
  if (!accepted && !series.payment_method_id) return { error: 'The card for this booking was removed. Book this visit yourself with another card.' }

  const blocked = (await bookingBlockedBySuspension(admin, series.user_id)) ?? (await bookingBlockedByAccess(admin, series.user_id))
  if (blocked) return { error: blocked }

  if (accepted) {
    const time = series.scheduled_time.slice(0, 5)
    const result = await placeBooking(admin, {
      customerId: series.user_id,
      tidyProId: series.tidy_pro_id,
      date,
      time,
      timeZone,
      location: series.scheduled_location as ScheduledLocation | null,
      taskList: (series.task_list as TidyTask[] | null) ?? [],
      fullService: bookableSelection(series.full_service),
      notes: series.notes,
      entryInstructions: series.entry_instructions,
      suppliesProvided: series.will_provide_supplies,
      // Only used to show the total; any of their cards can pay when it's charged.
      paymentMethodId: series.payment_method_id ?? '',
      recurringBookingId: series.id,
      deferPayment: { dueAt: recurringPaymentDueAt(bookingStartInstant(date, time, timeZone)) },
    })
    if ('error' in result && UNAVAILABLE_ERRORS.some((e) => result.error.startsWith(e))) {
      const { data: tidyPro } = await admin.from('profiles').select('first_name').eq('id', series.tidy_pro_id).maybeSingle()
      return { error: result.error, tidyProUnavailable: tidyPro?.first_name ?? 'Your Tidy Pro' }
    }
    return result
  }

  return placeBooking(admin, {
    customerId: series.user_id,
    tidyProId: series.tidy_pro_id,
    date,
    time: series.scheduled_time.slice(0, 5),
    timeZone,
    location: series.scheduled_location as ScheduledLocation | null,
    taskList: (series.task_list as TidyTask[] | null) ?? [],
    fullService: bookableSelection(series.full_service),
    notes: series.notes,
    entryInstructions: series.entry_instructions,
    suppliesProvided: series.will_provide_supplies,
    paymentMethodId: series.payment_method_id ?? '',
    recurringBookingId: series.id,
    idempotencyKey: `recurring-visit-${series.id}-${date}`,
    stripeMetadata: { recurring_booking_id: series.id },
  })
}

// What placeBooking says when the Tidy Pro can't take that date (away, time off, or
// already booked), as opposed to a problem with the booking itself.
const UNAVAILABLE_ERRORS = ['This Tidy Pro is away', 'This Tidy Pro isn’t available', 'This Tidy Pro was just booked']

// A Tidy Pro accepting a visit of a series accepts the series: every later visit is theirs.
// Whoever accepted becomes the series' Tidy Pro, which matters when the customer asked
// several at once.
export async function acceptSeriesForBooking(admin: Admin, bookingId: string, tidyProId: string): Promise<void> {
  const { data: booking } = await admin.from('bookings').select('recurring_booking_id, tidy_pro_name, tidy_pro_photo_url').eq('id', bookingId).maybeSingle()
  if (!booking?.recurring_booking_id) return
  const now = new Date().toISOString()
  await admin
    .from('recurring_bookings')
    .update({
      tidy_pro_id: tidyProId,
      tidy_pro_name: booking.tidy_pro_name,
      tidy_pro_photo_url: booking.tidy_pro_photo_url,
      tidy_pro_accepted_at: now,
      last_error: null,
      updated_at: now,
    })
    .eq('id', booking.recurring_booking_id)
    .eq('status', 'active')
}

// The Tidy Pro dropping a series they accepted. No new visits go to them, and the
// customer is asked to choose someone else. Visits already booked are canceled by the
// caller, one by one, under the usual rules for a Tidy Pro canceling.
export async function dropSeriesForTidyPro(admin: Admin, seriesId: string, tidyProId: string): Promise<{ userId: string } | { error: string }> {
  const { data: dropped, error } = await admin
    .from('recurring_bookings')
    .update({ tidy_pro_id: null, tidy_pro_name: null, tidy_pro_photo_url: null, tidy_pro_accepted_at: null, updated_at: new Date().toISOString() })
    .eq('id', seriesId)
    .eq('tidy_pro_id', tidyProId)
    .eq('status', 'active')
    .select('user_id')
    .maybeSingle()
  if (error) return { error: error.message }
  if (!dropped) return { error: 'This recurring booking isn’t yours anymore.' }

  const { data: tidyPro } = await admin.from('profiles').select('first_name').eq('id', tidyProId).maybeSingle()
  await notifyCustomer(admin, dropped.user_id, notifyRecurringSeriesDroppedByTidyPro(tidyPro?.first_name ?? 'Your Tidy Pro', seriesId)).catch(() => {})
  return { userId: dropped.user_id }
}

export type PricedCleanerOption = CleanerMatch & { price: number }

// Who else could take the series' next visit not yet booked, priced as that visit would be
// (before the card's processing fee, as on search).
export async function newTidyProOptions(admin: Admin, series: RecurringSeries): Promise<PricedCleanerOption[]> {
  const location = series.scheduled_location as ScheduledLocation | null
  if (location?.latitude == null || location?.longitude == null) return []
  const tasks = (series.task_list as TidyTask[] | null) ?? []

  const { data: profile } = await admin.from('profiles').select('service_area_id, city, state').eq('id', series.user_id).single()
  const statePricing = await resolveStatePricing(admin, profile?.service_area_id ?? null, profile ?? undefined)
  if (!statePricing.configured) return []
  const squareFootage = await resolveLocationSquareFootage(admin, series.user_id, location)
  const fullService = bookableSelection(series.full_service)
  let breakdown
  try {
    breakdown = priceTasksPart(tasks, statePricing.state, statePricing.medianFourHourPrice, squareFootage)
  } catch {
    return []
  }
  const durationMinutes = bookingDurationMinutes(
    tasks,
    squareFootage,
    fullService ? (await fullServiceMinutes(fullService, squareFootage, { allowAi: false })).minutes : 0
  )

  const cleaners = await findAvailableCleaners(
    {
      latitude: location.latitude,
      longitude: location.longitude,
      date: series.next_date,
      time: series.scheduled_time.slice(0, 5),
      durationMinutes,
      requiredServices: [...requiredServicesForTasks(tasks), ...(fullService ? [requiredServiceForFullService(fullService.type)] : [])],
      customerId: series.user_id,
    },
    admin
  )

  // With Standard / Deep Cleaning, each Tidy Pro is priced with their own rates,
  // and anyone who can't do all of it is left out.
  const others = cleaners.filter((c) => c.id !== series.tidy_pro_id)
  const quotes = fullService ? await quotesForTidyPros(admin, others.map((c) => c.id), fullService, squareFootage) : null
  return others
    .filter((c) => !quotes || quotes.has(c.id))
    .map((c) => ({ ...c, price: servicePriceForCleaner(combineWithFullService(breakdown, quotes?.get(c.id) ?? null).total_customer_charge, c) }))
}

export async function loadCustomerSeries(admin: Admin, customerId: string, seriesId: string): Promise<RecurringSeries | null> {
  const { data } = await admin
    .from('recurring_bookings')
    .select(SERIES_COLUMNS)
    .eq('id', seriesId)
    .eq('user_id', customerId)
    .eq('status', 'active')
    .maybeSingle()
  return (data as RecurringSeries | null) ?? null
}
