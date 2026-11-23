import type { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'
import type { TidyTask } from '@/app/dashboard/types'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import { resolveLocationSquareFootage } from '@/app/dashboard/taskPricing'
import { bookingDurationMinutes } from '@/lib/bookingPricing'
import { bookableSelection, fullServiceMinutes, quoteForTidyPro } from '@/lib/fullServiceBooking'
import { requiredServiceForFullService } from '@/lib/fullService'
import { quoteDraftServicePrice } from '@/lib/promoFunding'
import { cleanerPayoutForServicePrice } from '@/lib/pricingRules'
import { hasBookingConflict } from '@/lib/cleanerMatching'
import { overlapsTimeOff, parseTimeOff } from '@/lib/timeOff'
import { SERVICES_NOT_OFFERED_MESSAGE, providesServices, requiredServicesForTasks } from '@/lib/tidyProServices'
import { hasAcceptanceWindowClosed } from '@/lib/bookingTime'
import { BLOCKED_BOOKING_MESSAGE, isBlockedBetween } from '@/lib/userBlocks'
import { isHiddenFromCustomer } from '@/lib/privateTidyPros'
import { dropUnmatchedLaundryLinks } from '@/lib/laundry'
import { restoreBookingTasks } from '@/lib/bookingRequestGroups'
import { placeBooking } from '@/lib/placeBooking'
import { defaultPaymentMethodId } from '@/lib/defaultPaymentMethod'
import { followUpPlacedBooking } from '@/lib/bookingPlacedFollowUp'
import { notifyCustomer } from '@/lib/customerNotifications'
import { canSendSms, sendSmsForPayload } from '@/lib/sms'
import { sendPushForPayload } from '@/lib/push'
import { MAX_QUOTE_PRICE, MIN_QUOTE_PRICE, applyQuote, hasQuoteTasks } from '@/lib/taskQuotes'
import { userFacingError } from '@/lib/userFacingError'
import {
  notifyQuoteDeclinedByCustomer,
  notifyQuoteDeclinedByTidyPro,
  notifyQuoteExpired,
  notifyQuoteRequested,
  notifyQuoteSent,
  type NotificationPayload,
} from '@/lib/notifications'

// The fallback booking flow for when automatic pricing (OpenAI) is down. See
// lib/taskQuotes.ts for how a task ends up needing a quote, and
// supabase/migrations/087_booking_quote_requests.sql for the statuses.
//
//   Customer sends the booking for a quote  → nothing charged; the Tidy Pro is told.
//   Tidy Pro prices each task in dollars    → added to the rest of the booking's price;
//                                             the customer is told.
//   Customer presses "Approve & Pay"        → placeBooking charges the card and creates
//                                             a normal pending booking request, which
//                                             the Tidy Pro accepts or declines as usual.
//   Either side declines, or it runs out    → the tasks go back on the dashboard.
//
// Not to be confused with lib/pricingQuotes.ts (abandoned-cart tracking).

type Admin = ReturnType<typeof createAdminClient>
export type QuoteRequestRow = Database['public']['Tables']['booking_quote_requests']['Row']
export type QuoteRequestStatus = QuoteRequestRow['status']

export const OPEN_QUOTE_STATUSES: QuoteRequestStatus[] = ['requested', 'quoted', 'paying']
// The ones either side can still end.
const ENDABLE_QUOTE_STATUSES: QuoteRequestStatus[] = ['requested', 'quoted']

export const MAX_TIDY_PRO_NOTE_LENGTH = 500
const QUOTE_PRICE_MESSAGE = `Enter a price from $${MIN_QUOTE_PRICE} to $${MAX_QUOTE_PRICE} for each task.`

export function isOpenQuote(status: QuoteRequestStatus): boolean {
  return OPEN_QUOTE_STATUSES.includes(status)
}

// What the booking will include: the Tidy Pro's quoted times once there are some.
export function quoteRequestTasks(row: Pick<QuoteRequestRow, 'task_list' | 'quoted_task_list'>): TidyTask[] {
  return ((row.quoted_task_list ?? row.task_list) as TidyTask[] | null) ?? []
}

export function originalQuoteTasks(row: Pick<QuoteRequestRow, 'task_list'>): TidyTask[] {
  return (row.task_list as TidyTask[] | null) ?? []
}

export function quoteWindowClosed(row: Pick<QuoteRequestRow, 'scheduled_date' | 'scheduled_time' | 'time_zone'>, now = new Date()): boolean {
  return hasAcceptanceWindowClosed(row.scheduled_date, row.scheduled_time.slice(0, 5), now, row.time_zone)
}

async function notifyCleaner(admin: Admin, id: string, payload: NotificationPayload): Promise<void> {
  const { data: person } = await admin.from('tidypro_profiles').select('phone, sms_consent').eq('id', id).maybeSingle()
  if (canSendSms(person?.sms_consent ?? null, person?.phone ?? null)) {
    await sendSmsForPayload(person!.phone!, payload).catch(() => {})
  }
  await sendPushForPayload(id, payload).catch(() => {})
}

async function firstName(admin: Admin, id: string, fallback: string): Promise<string> {
  const { data } = await admin.from('profiles').select('first_name').eq('id', id).maybeSingle()
  return data?.first_name ?? fallback
}

// ── Sending a request ────────────────────────────────────────────────────────

export type QuoteRequestInput = {
  customerId: string
  tidyProId: string
  date: string
  time: string
  timeZone: string
  location: ScheduledLocation
  // Every task on the draft; only the selected ones are sent.
  taskList: TidyTask[]
  fullService: unknown
  notes: string | null
  entryInstructions: string | null
  suppliesProvided: boolean
  giftCode: string | null
  recurrenceFrequency: string | null
  saveEntryInstructions: boolean
  paymentMethodId: string | null
}

// Checks the Tidy Pro could still take this booking (the same checks placeBooking makes
// before a charge, with each unquoted task holding the longest a Tidy Task can take), so
// nobody is asked to quote a booking they couldn't do.
async function tidyProCanTake(admin: Admin, input: QuoteRequestInput, tasks: TidyTask[]): Promise<string | null> {
  const fullService = bookableSelection(input.fullService)
  const squareFootage = await resolveLocationSquareFootage(admin, input.customerId, input.location)
  const fullServiceDuration = fullService ? (await fullServiceMinutes(fullService, squareFootage)).minutes : 0
  if (fullService && !(await quoteForTidyPro(admin, input.tidyProId, fullService, squareFootage))) {
    return 'This Tidy Pro can’t do this cleaning any more. Please go back and choose another Tidy Pro.'
  }
  let duration: number
  try {
    duration = bookingDurationMinutes(tasks, squareFootage, fullServiceDuration)
  } catch {
    return 'Could not price one of your tasks.'
  }

  const { data: tidyPro } = await admin
    .from('tidypro_profiles')
    .select('is_away, time_off, services_provided')
    .eq('id', input.tidyProId)
    .maybeSingle()
  if (!tidyPro) return 'This Tidy Pro isn’t available. Please go back and choose another Tidy Pro.'
  if (tidyPro.is_away) return 'This Tidy Pro is away right now. Please go back and choose another Tidy Pro.'
  const required = [...requiredServicesForTasks(tasks), ...(fullService ? [requiredServiceForFullService(fullService.type)] : [])]
  if (!providesServices(tidyPro.services_provided, required)) return SERVICES_NOT_OFFERED_MESSAGE
  if (
    overlapsTimeOff(parseTimeOff(tidyPro.time_off), input.date, input.time, duration) ||
    (await hasBookingConflict(admin, input.tidyProId, input.date, input.time, duration))
  ) {
    return 'This Tidy Pro isn’t free at this time anymore. Please go back and choose another time or Tidy Pro.'
  }
  return null
}

export async function createQuoteRequest(admin: Admin, input: QuoteRequestInput): Promise<{ quoteId: string } | { error: string }> {
  const tasks = dropUnmatchedLaundryLinks(input.taskList.filter((t) => t.completed))
  if (!hasQuoteTasks(tasks)) return { error: 'None of these tasks need a quote. Please confirm your request instead.' }

  if (isHiddenFromCustomer(input.tidyProId, input.customerId)) return { error: BLOCKED_BOOKING_MESSAGE }
  if (await isBlockedBetween(admin, input.customerId, input.tidyProId)) return { error: BLOCKED_BOOKING_MESSAGE }

  const problem = await tidyProCanTake(admin, input, tasks)
  if (problem) return { error: problem }

  const { data: row, error } = await admin
    .from('booking_quote_requests')
    .insert({
      user_id: input.customerId,
      tidy_pro_id: input.tidyProId,
      task_list: tasks as never,
      full_service: (bookableSelection(input.fullService) ?? null) as never,
      scheduled_location: input.location as never,
      scheduled_date: input.date,
      scheduled_time: input.time,
      time_zone: input.timeZone,
      notes: input.notes,
      entry_instructions: input.entryInstructions,
      supplies_provided: input.suppliesProvided,
      gift_code: input.giftCode?.trim() || null,
      recurrence_frequency: input.recurrenceFrequency,
      save_entry_instructions: input.saveEntryInstructions,
      selected_payment_method_id: input.paymentMethodId,
    })
    .select('id')
    .single()
  if (error || !row) return { error: userFacingError(error, 'Your quote request couldn’t be sent. Please try again.') }

  await notifyCleaner(admin, input.tidyProId, notifyQuoteRequested(await firstName(admin, input.customerId, 'A customer'), row.id))
  return { quoteId: row.id }
}

// ── Pricing a quote ──────────────────────────────────────────────────────────

// The booking's price with these tasks, before the card fee and any promo, worked out
// the same way placeBooking will charge it. Null if it can't be priced.
export async function priceQuoteTasks(
  admin: Admin,
  row: Pick<QuoteRequestRow, 'user_id' | 'tidy_pro_id' | 'scheduled_location' | 'full_service'>,
  tasks: TidyTask[]
): Promise<{ servicePrice: number; cleanerPay: number; tasks: TidyTask[] } | null> {
  const priced = await quoteDraftServicePrice(admin, {
    customerId: row.user_id,
    tidyProId: row.tidy_pro_id,
    taskList: tasks.map((t) => ({ ...t, completed: true })),
    location: row.scheduled_location as ScheduledLocation | null,
    fullService: bookableSelection(row.full_service),
  })
  if (!priced) return null
  return { servicePrice: priced.servicePrice, cleanerPay: cleanerPayoutForServicePrice(priced.servicePrice), tasks: priced.tasks }
}

// For the Tidy Pro's live preview as they type their times.
export async function previewQuote(
  admin: Admin,
  input: { quoteId: string; tidyProId: string; pricesByTaskId: Record<string, unknown> }
): Promise<{ servicePrice: number; cleanerPay: number } | { error: string }> {
  const row = await loadForTidyPro(admin, input.quoteId, input.tidyProId)
  if (!row) return { error: 'Quote request not found.' }
  const quoted = applyQuote(originalQuoteTasks(row), input.pricesByTaskId)
  if (!quoted) return { error: QUOTE_PRICE_MESSAGE }
  const priced = await priceQuoteTasks(admin, row, quoted)
  if (!priced) return { error: 'This booking can’t be priced right now.' }
  return { servicePrice: priced.servicePrice, cleanerPay: priced.cleanerPay }
}

// ── Tidy Pro side ────────────────────────────────────────────────────────────

async function loadForTidyPro(admin: Admin, quoteId: string, tidyProId: string): Promise<QuoteRequestRow | null> {
  const { data } = await admin.from('booking_quote_requests').select('*').eq('id', quoteId).eq('tidy_pro_id', tidyProId).maybeSingle()
  return data
}

// Sends (or, before the customer has paid, updates) the Tidy Pro's quote.
export async function submitQuote(
  admin: Admin,
  input: { quoteId: string; tidyProId: string; pricesByTaskId: Record<string, unknown>; note: string | null }
): Promise<{ success: true } | { error: string }> {
  const row = await loadForTidyPro(admin, input.quoteId, input.tidyProId)
  if (!row) return { error: 'Quote request not found.' }
  if (!ENDABLE_QUOTE_STATUSES.includes(row.status)) return { error: 'This quote request is closed.' }
  if (quoteWindowClosed(row)) return { error: 'This booking starts too soon to be quoted now.' }

  const quoted = applyQuote(originalQuoteTasks(row), input.pricesByTaskId)
  if (!quoted) return { error: QUOTE_PRICE_MESSAGE }
  const priced = await priceQuoteTasks(admin, row, quoted)
  if (!priced) return { error: 'This booking can’t be priced right now. Please try again.' }

  const now = new Date().toISOString()
  const { data: updated, error } = await admin
    .from('booking_quote_requests')
    .update({
      status: 'quoted',
      quoted_task_list: quoted as never,
      quoted_service_price: priced.servicePrice,
      quoted_cleaner_pay: priced.cleanerPay,
      tidy_pro_note: input.note?.trim().slice(0, MAX_TIDY_PRO_NOTE_LENGTH) || null,
      quoted_at: now,
      updated_at: now,
      user_unread: true,
      tidy_pro_unread: false,
    })
    .eq('id', row.id)
    .in('status', ENDABLE_QUOTE_STATUSES)
    .select('id')
  if (error) return { error: userFacingError(error, 'Your quote couldn’t be sent. Please try again.') }
  if (!updated || updated.length === 0) return { error: 'This quote request is closed.' }

  await notifyCustomer(admin, row.user_id, notifyQuoteSent(await firstName(admin, row.tidy_pro_id, 'Your Tidy Pro'), row.id))
  return { success: true }
}

// Ends a request that's still open, and puts the customer's tasks back on their list.
// Conditional on the status, so it can't end one that's being paid for.
async function endQuoteRequest(
  admin: Admin,
  row: QuoteRequestRow,
  status: 'pro_declined' | 'customer_declined' | 'expired',
  extra: { decline_reason?: string | null } = {}
): Promise<boolean> {
  const now = new Date().toISOString()
  const { data: updated } = await admin
    .from('booking_quote_requests')
    .update({
      status,
      ended_at: now,
      updated_at: now,
      user_unread: status !== 'customer_declined',
      tidy_pro_unread: status !== 'pro_declined',
      ...extra,
    })
    .eq('id', row.id)
    .in('status', ENDABLE_QUOTE_STATUSES)
    .select('id')
  if (!updated || updated.length === 0) return false
  await restoreBookingTasks(admin, row.user_id, originalQuoteTasks(row))
  return true
}

export async function declineQuoteAsTidyPro(
  admin: Admin,
  input: { quoteId: string; tidyProId: string; reason: string | null }
): Promise<{ success: true } | { error: string }> {
  const row = await loadForTidyPro(admin, input.quoteId, input.tidyProId)
  if (!row) return { error: 'Quote request not found.' }
  const ended = await endQuoteRequest(admin, row, 'pro_declined', {
    decline_reason: input.reason?.trim().slice(0, MAX_TIDY_PRO_NOTE_LENGTH) || null,
  })
  if (!ended) return { error: 'This quote request is already closed.' }
  await notifyCustomer(admin, row.user_id, notifyQuoteDeclinedByTidyPro(await firstName(admin, row.tidy_pro_id, 'Your Tidy Pro'), row.id))
  return { success: true }
}

// ── Customer side ────────────────────────────────────────────────────────────

export async function loadForCustomer(admin: Admin, quoteId: string, customerId: string): Promise<QuoteRequestRow | null> {
  const { data } = await admin.from('booking_quote_requests').select('*').eq('id', quoteId).eq('user_id', customerId).maybeSingle()
  return data
}

// Declining the quote, or withdrawing the request before it was quoted.
export async function declineQuoteAsCustomer(
  admin: Admin,
  input: { quoteId: string; customerId: string }
): Promise<{ success: true } | { error: string }> {
  const row = await loadForCustomer(admin, input.quoteId, input.customerId)
  if (!row) return { error: 'Quote request not found.' }
  const ended = await endQuoteRequest(admin, row, 'customer_declined')
  if (!ended) return { error: 'This quote request is already closed.' }
  await notifyCleaner(admin, row.tidy_pro_id, notifyQuoteDeclinedByCustomer(await firstName(admin, row.user_id, 'Your customer'), row.id))
  return { success: true }
}

// "Approve & Pay": charges the card for the quoted booking and sends it to the Tidy Pro
// as a normal booking request. Nothing is sent until the charge succeeds. Checks that
// need the customer present (push, pets, access) are made by the caller.
export async function approveAndPayQuote(
  admin: Admin,
  input: { quoteId: string; customerId: string }
): Promise<{ bookingId: string } | { error: string; paymentFailed?: true; promoFailed?: true }> {
  const row = await loadForCustomer(admin, input.quoteId, input.customerId)
  if (!row) return { error: 'Quote request not found.' }
  if (row.status === 'paid' && row.booking_id) return { bookingId: row.booking_id }
  if (row.status === 'paying') return { error: 'Your payment is already going through. Please wait a moment.' }
  if (row.status !== 'quoted') return { error: 'This quote can’t be paid for any more.' }
  if (quoteWindowClosed(row)) return { error: 'This booking starts too soon to be booked now.' }

  const paymentMethodId = row.selected_payment_method_id ?? (await defaultPaymentMethodId(admin, input.customerId))
  if (!paymentMethodId) return { error: 'Add or choose a payment method first.' }

  const tasks = quoteRequestTasks(row)
  if (hasQuoteTasks(tasks)) return { error: 'This quote is incomplete. Please ask your Tidy Pro to send it again.' }

  // Held while the card is charged, so a second tap can't charge twice.
  const { data: locked } = await admin
    .from('booking_quote_requests')
    .update({ status: 'paying', updated_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('status', 'quoted')
    .select('id')
  if (!locked || locked.length === 0) return { error: 'This quote can’t be paid for any more.' }

  const location = row.scheduled_location as ScheduledLocation
  const fullService = bookableSelection(row.full_service)
  const time = row.scheduled_time.slice(0, 5)
  let placed: Awaited<ReturnType<typeof placeBooking>>
  try {
    placed = await placeBooking(admin, {
      customerId: input.customerId,
      tidyProId: row.tidy_pro_id,
      date: row.scheduled_date,
      time,
      timeZone: row.time_zone,
      location,
      taskList: tasks.map((t) => ({ ...t, completed: true })),
      fullService,
      notes: row.notes,
      entryInstructions: row.entry_instructions,
      suppliesProvided: row.supplies_provided,
      paymentMethodId,
      stripeMetadata: { quote_request_id: row.id },
      promoCode: row.gift_code,
    })
  } catch (err) {
    placed = { error: userFacingError(err, 'Payment failed. Please try again.') }
  }

  if ('error' in placed) {
    await admin.from('booking_quote_requests').update({ status: 'quoted', updated_at: new Date().toISOString() }).eq('id', row.id).eq('status', 'paying')
    return placed
  }

  const now = new Date().toISOString()
  await admin
    .from('booking_quote_requests')
    .update({ status: 'paid', booking_id: placed.bookingId, ended_at: now, updated_at: now, user_unread: false })
    .eq('id', row.id)

  await followUpPlacedBooking(admin, {
    customerId: input.customerId,
    bookingId: placed.bookingId,
    tidyProId: row.tidy_pro_id,
    tidyProName: placed.tidyProName,
    paymentMethodId,
    recurrenceFrequency: row.recurrence_frequency,
    date: row.scheduled_date,
    time,
    timeZone: row.time_zone,
    location,
    taskList: tasks,
    fullService,
    notes: row.notes,
    entryInstructions: row.entry_instructions,
    suppliesProvided: row.supplies_provided,
    saveEntryInstructionsToAddress: row.save_entry_instructions,
  })

  return { bookingId: placed.bookingId }
}

// ── Expiry ───────────────────────────────────────────────────────────────────

// Run on a schedule (with the booking-request expiry). A request not quoted and paid for
// before the acceptance window closes, an hour before the start, can't be booked, so it
// ends and the tasks go back on the dashboard. One being paid for is left alone.
export async function expireQuoteRequests(admin: Admin, now: Date = new Date()): Promise<{ expired: number }> {
  const { data: open } = await admin.from('booking_quote_requests').select('*').in('status', ENDABLE_QUOTE_STATUSES)
  let expired = 0
  for (const row of open ?? []) {
    if (!quoteWindowClosed(row, now)) continue
    try {
      if (!(await endQuoteRequest(admin, row, 'expired'))) continue
      expired++
      await notifyCustomer(admin, row.user_id, notifyQuoteExpired('USER', row.id))
      await notifyCleaner(admin, row.tidy_pro_id, notifyQuoteExpired('TIDYPRO', row.id))
    } catch (err) {
      console.error('[Tydio] Expiring quote request failed:', row.id, err)
    }
  }
  return { expired }
}

// Lazily, when either side opens a request, so it never shows as open past its time.
export async function expireIfDue(admin: Admin, row: QuoteRequestRow): Promise<QuoteRequestRow> {
  if (!ENDABLE_QUOTE_STATUSES.includes(row.status) || !quoteWindowClosed(row)) return row
  if (await endQuoteRequest(admin, row, 'expired')) return { ...row, status: 'expired', ended_at: new Date().toISOString() }
  const { data } = await admin.from('booking_quote_requests').select('*').eq('id', row.id).maybeSingle()
  return data ?? row
}

// ── Labels ───────────────────────────────────────────────────────────────────

export function quoteStatusLabel(status: QuoteRequestStatus, viewer: 'USER' | 'TIDYPRO'): string {
  switch (status) {
    case 'requested':
      return viewer === 'USER' ? 'Waiting for your Tidy Pro’s quote' : 'Send your quote'
    case 'quoted':
      return viewer === 'USER' ? 'Quote ready: approve & pay' : 'Quote sent'
    case 'paying':
      return 'Payment going through'
    case 'paid':
      return viewer === 'USER' ? 'Approved & paid' : 'Customer paid: see the booking request'
    case 'pro_declined':
      return viewer === 'USER' ? 'Tidy Pro declined to quote' : 'You declined'
    case 'customer_declined':
      return viewer === 'USER' ? 'You declined' : 'Customer declined'
    case 'expired':
      return 'Expired'
  }
}

// ── Messages lists ───────────────────────────────────────────────────────────

// How long a finished request stays on the Messages list.
const ENDED_QUOTE_LIST_DAYS = 7

export type QuoteListItem = {
  id: string
  href: string
  name: string
  photoUrl: string | null
  statusLabel: string
  scheduledDate: string
  unread: boolean
  actionNeeded: boolean
}

// The viewer's open quote requests, and ones that ended in the last week.
export async function listQuoteRequests(admin: Admin, viewer: 'USER' | 'TIDYPRO', profileId: string): Promise<QuoteListItem[]> {
  const { data: rows } = await admin
    .from('booking_quote_requests')
    .select('id, user_id, tidy_pro_id, status, scheduled_date, scheduled_time, time_zone, user_unread, tidy_pro_unread, updated_at')
    .eq(viewer === 'USER' ? 'user_id' : 'tidy_pro_id', profileId)
    .order('updated_at', { ascending: false })
    .limit(30)

  const cutoff = Date.now() - ENDED_QUOTE_LIST_DAYS * 24 * 60 * 60 * 1000
  const now = new Date()
  const shown = (rows ?? [])
    // One whose time has passed reads as expired even before the job gets to it.
    .map((r) => (ENDABLE_QUOTE_STATUSES.includes(r.status) && quoteWindowClosed(r, now) ? { ...r, status: 'expired' as const } : r))
    .filter((r) => isOpenQuote(r.status) || Date.parse(r.updated_at) >= cutoff)
  if (shown.length === 0) return []

  const otherIds = [...new Set(shown.map((r) => (viewer === 'USER' ? r.tidy_pro_id : r.user_id)))]
  const [{ data: people }, { data: proPhotos }] = await Promise.all([
    admin.from('profiles').select('id, first_name, last_name, photo_url').in('id', otherIds),
    viewer === 'USER'
      ? admin.from('tidypro_profiles').select('id, profile_photo_url').in('id', otherIds)
      : Promise.resolve({ data: [] as { id: string; profile_photo_url: string | null }[] }),
  ])
  const personById = new Map((people ?? []).map((p) => [p.id, p]))
  const proPhotoById = new Map((proPhotos ?? []).map((p) => [p.id, p.profile_photo_url]))

  return shown.map((r) => {
    const otherId = viewer === 'USER' ? r.tidy_pro_id : r.user_id
    const person = personById.get(otherId)
    return {
      id: r.id,
      href: viewer === 'USER' ? `/dashboard/quotes/${r.id}` : `/pro/quotes/${r.id}`,
      name: [person?.first_name, person?.last_name].filter(Boolean).join(' ') || (viewer === 'USER' ? 'Your Tidy Pro' : 'Customer'),
      photoUrl: (viewer === 'USER' ? proPhotoById.get(otherId) : person?.photo_url) ?? null,
      statusLabel: quoteStatusLabel(r.status, viewer),
      scheduledDate: r.scheduled_date,
      unread: viewer === 'USER' ? r.user_unread : r.tidy_pro_unread,
      actionNeeded: viewer === 'USER' ? r.status === 'quoted' : r.status === 'requested',
    }
  })
}
