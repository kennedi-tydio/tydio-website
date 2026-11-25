'use server'

import { requiredServicesForTasks } from '@/lib/tidyProServices'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { findAvailableCleaners, type CleanerMatch } from '@/lib/cleanerMatching'
import { resolveStatePricing, resolveLocationSquareFootage } from '@/app/dashboard/taskPricing'
import { bookingDurationMinutes, combineWithFullService, priceTasksPart } from '@/lib/bookingPricing'
import { requiredServiceForFullService, selectionLabel } from '@/lib/fullService'
import { ensureFullServiceEstimate } from '@/lib/aiFullServiceEstimate'
import { bookableSelection, quotesForTidyPros } from '@/lib/fullServiceBooking'
import { servicePriceForCleaner } from '@/lib/pricingRules'
import { closeUnmetSearch, recordUnmetSearch } from '@/lib/unmetBookingSearches'
import { recordPricingView, taskLabel } from '@/lib/pricingQuotes'
import { buildQuoteDetails } from '@/lib/quoteDetails'
import { customerPetsSummary } from '@/lib/customerPetsData'
import { normalizeScheduleRange } from '@/lib/bookingSlots'
import { serviceTimeZone } from '@/lib/serviceTimeZone'
import { DEFAULT_BOOKING_TIME_ZONE } from '@/lib/bookingTime'
import type { TidyTask } from '@/app/dashboard/types'
import { isRecurrenceFrequency, type RecurrenceFrequency } from '@/lib/recurrence'
import { hasQuoteTasks } from '@/lib/taskQuotes'
import { bookingBlockedByAccess } from '@/lib/accountSuspension'

export type ScheduledLocation =
  | { type: 'current_location'; latitude: number; longitude: number }
  | { type: 'address'; addressId: string; label: string; line: string; latitude: number | null; longitude: number | null }

export interface Schedule {
  location: ScheduledLocation | null
  date: string | null // "YYYY-MM-DD"
  // The last date of a date range, after `date`. null = just `date` (or Any day).
  endDate: string | null
  time: string | null // "HH:MM", null = Anytime
  // The latest start time of a time window, after `time`. null = exactly `time` (or Anytime).
  endTime: string | null
  // Repeat on the same weekday and time. Only for a specific date (not Any day or a range).
  recurrence?: RecurrenceFrequency | null
}

// A schedule with any range end that doesn't make sense dropped (see normalizeScheduleRange).
function withValidRange(schedule: Schedule): Schedule {
  return { ...schedule, ...normalizeScheduleRange(schedule) }
}

function locationKey(location: ScheduledLocation | null): string {
  if (!location) return ''
  return location.type === 'address' ? `address:${location.addressId}` : 'current_location'
}

export async function saveSchedule(draftId: string, input: Schedule): Promise<void> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return
  const schedule = withValidRange(input)

  const admin = createAdminClient()
  // Waitlisted (or otherwise blocked) customers can keep Tidy Tasks but not book.
  if (await bookingBlockedByAccess(admin, session.profileId)) return
  const { data: current } = await admin
    .from('booking_drafts')
    .select('scheduled_location')
    .eq('id', draftId)
    .eq('customer_user_id', session.profileId)
    .maybeSingle()
  // Entry instructions typed for one home shouldn't follow the booking to another.
  const placeChanged = locationKey(current?.scheduled_location as ScheduledLocation | null) !== locationKey(schedule.location)

  await admin
    .from('booking_drafts')
    .update({
      scheduled_location: schedule.location as never,
      scheduled_date: schedule.date,
      scheduled_end_date: schedule.endDate,
      scheduled_time: schedule.time,
      scheduled_end_time: schedule.endTime,
      any_day_selected: schedule.date == null,
      recurrence_frequency: schedule.date && !schedule.endDate && isRecurrenceFrequency(schedule.recurrence) ? schedule.recurrence : null,
      ...(placeChanged ? { entry_instructions: null } : {}),
    })
    .eq('id', draftId)
    .eq('customer_user_id', session.profileId)
}

export interface StatePricingNotConfiguredError {
  code: 'STATE_PRICING_NOT_CONFIGURED'
  message: string
  city: string | null
  state: string | null
}

// fullServicePrice: this Tidy Pro's price for the booking's Standard / Deep
// Cleaning (their own rates), when it has one. Already included in price.
// quotePending: some tasks were added while automatic pricing was down, so
// `price` leaves them out; the Tidy Pro quotes them (lib/taskQuotes.ts).
export type PricedCleanerMatch = CleanerMatch & { price: number; fullServicePrice?: number; quotePending?: boolean }

export interface CleanerSearchResult {
  cleaners: PricedCleanerMatch[]
  error?: StatePricingNotConfiguredError
  // No one matched and we saved the search, so the customer will hear when someone's free.
  notifyWhenAvailable?: boolean
}

const EMPTY_RESULT: CleanerSearchResult = { cleaners: [] }

export async function searchAvailableCleaners(
  draftId: string,
  input: Schedule,
  // The customer's browser zone: the fallback for a search nobody matched when the home's state isn't known.
  timeZone?: string
): Promise<CleanerSearchResult> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return EMPTY_RESULT
  const schedule = withValidRange(input)
  // Bookings need a full saved address, not just a device location.
  if (schedule.location?.type !== 'address') return EMPTY_RESULT
  if (schedule.location.latitude == null || schedule.location.longitude == null) {
    return EMPTY_RESULT
  }

  const admin = createAdminClient()
  if (await bookingBlockedByAccess(admin, session.profileId)) return EMPTY_RESULT

  const { data: profile } = await admin
    .from('profiles')
    .select('service_area_id, city, state')
    .eq('id', session.profileId)
    .single()

  const { data: draft } = await admin
    .from('booking_drafts')
    .select('task_list, full_service, notes, entry_instructions, supplies_provided, gift_code')
    .eq('id', draftId)
    .eq('customer_user_id', session.profileId)
    .maybeSingle()

  const allTasks = (draft?.task_list as TidyTask[] | null) ?? []
  const tasks = allTasks.filter((t) => t.completed)
  const fullService = bookableSelection(draft?.full_service)
  if (tasks.length === 0 && !fullService) return EMPTY_RESULT

  const statePricing = await resolveStatePricing(admin, profile?.service_area_id ?? null, profile ?? undefined)
  if (!statePricing.configured) {
    return {
      cleaners: [],
      error: {
        code: 'STATE_PRICING_NOT_CONFIGURED',
        message: 'Instant pricing is not currently available for this service location.',
        city: statePricing.city,
        state: statePricing.state,
      },
    }
  }

  const squareFootage = await resolveLocationSquareFootage(admin, session.profileId, schedule.location)
  // The picker asks for the size before an address can be used; every booking needs one.
  if (!squareFootage) return EMPTY_RESULT

  // How long the Standard / Deep Cleaning should take, estimated once per
  // selection and saved on the draft. Scheduling only: never part of the price.
  const fullServiceMinutes = fullService
    ? (await ensureFullServiceEstimate(admin, draftId, fullService, squareFootage)).minutes
    : 0

  let durationMinutes = 180
  let basePrice = 0
  let taskPart = null
  try {
    taskPart = priceTasksPart(tasks, statePricing.state, statePricing.medianFourHourPrice, squareFootage)
    durationMinutes = bookingDurationMinutes(tasks, squareFootage, fullServiceMinutes)
    basePrice = taskPart.total_customer_charge
  } catch {
    // fall back to the default typical duration if a task is unpriceable
  }
  const requiredServices = [
    ...requiredServicesForTasks(tasks),
    ...(fullService ? [requiredServiceForFullService(fullService.type)] : []),
  ]

  const matched = await findAvailableCleaners(
    {
      latitude: schedule.location.latitude,
      longitude: schedule.location.longitude,
      date: schedule.date,
      endDate: schedule.endDate,
      time: schedule.time,
      endTime: schedule.endTime,
      durationMinutes,
      requiredServices,
      customerId: session.profileId,
    },
    admin
  )

  // With Standard / Deep Cleaning, only Tidy Pros who've priced it and offer
  // every chosen add-on can take it, each at their own price.
  const quotes = fullService ? await quotesForTidyPros(admin, matched.map((c) => c.id), fullService, squareFootage) : null
  const cleaners = quotes ? matched.filter((c) => quotes.has(c.id)) : matched

  // No one matched: tell the admin, and keep looking so the customer hears when someone's free.
  if (cleaners.length === 0) {
    const watching = await recordUnmetSearch(admin, {
      customerId: session.profileId,
      draftId,
      location: {
        latitude: schedule.location.latitude,
        longitude: schedule.location.longitude,
        label: schedule.location.type === 'address' ? `${schedule.location.label} · ${schedule.location.line}` : null,
      },
      date: schedule.date,
      endDate: schedule.endDate,
      time: schedule.time,
      endTime: schedule.endTime,
      timeZone: await serviceTimeZone(admin, session.profileId, schedule.location, timeZone, DEFAULT_BOOKING_TIME_ZONE),
      durationMinutes,
      requiredServices,
      tasks: [
        ...(fullService ? [{ name: selectionLabel(fullService), room: 'Full service' }] : []),
        ...tasks.map((t) => ({ name: t.name, room: t.room })),
      ],
      // Standard / Deep Cleaning is priced by each Tidy Pro, so there's no one price to quote.
      estimatedPrice: !fullService && basePrice > 0 ? basePrice : null,
    }).catch((err) => {
      console.error('[Tydio] Saving unmet search failed:', err)
      return false
    })
    return { cleaners: [], notifyWhenAvailable: watching }
  }

  await closeUnmetSearch(admin, draftId).catch((err) => console.error('[Tydio] Closing unmet search failed:', err))

  const quotePending = hasQuoteTasks(tasks)
  const pricedCleaners: PricedCleanerMatch[] = cleaners.map((cleaner) => {
    const quote = quotes?.get(cleaner.id) ?? null
    const total = taskPart ? combineWithFullService(taskPart, quote).total_customer_charge : basePrice + (quote?.customer_total ?? 0)
    return {
      ...cleaner,
      price: servicePriceForCleaner(total, cleaner),
      ...(quote ? { fullServicePrice: quote.customer_total } : {}),
      ...(quotePending ? { quotePending: true } : {}),
    }
  })

  // For abandoned-cart tracking: what they were just quoted.
  await recordPricingView(admin, {
    customerId: session.profileId,
    draftId,
    stage: 'cleaners',
    taskNames: [...(fullService ? [selectionLabel(fullService)] : []), ...tasks.map(taskLabel)],
    durationMinutes,
    date: schedule.date,
    time: schedule.time,
    locationLabel: schedule.location.type === 'address' ? `${schedule.location.label} · ${schedule.location.line}` : null,
    cleanerPrices: pricedCleaners.map((c) => c.price),
    details: buildQuoteDetails({
      tasks,
      fullService,
      squareFootage,
      date: schedule.date,
      endDate: schedule.endDate,
      time: schedule.time,
      endTime: schedule.endTime,
      recurrence: schedule.date && !schedule.endDate ? schedule.recurrence : null,
      breakdown: taskPart,
      offers: pricedCleaners.map((c) => ({
        name: c.name,
        isTopTidyPro: c.isTopTidyPro,
        distanceMiles: c.distanceMiles,
        price: c.price,
        ...(c.fullServicePrice != null ? { fullServicePrice: c.fullServicePrice } : {}),
        ...(c.quotePending ? { quotePending: true } : {}),
      })),
      pets: await customerPetsSummary(admin, session.profileId).catch(() => null),
      draft: {
        notes: draft?.notes,
        entry_instructions: draft?.entry_instructions,
        supplies_provided: draft?.supplies_provided,
        gift_code: draft?.gift_code,
      },
    }),
  })

  return { cleaners: pricedCleaners }
}
