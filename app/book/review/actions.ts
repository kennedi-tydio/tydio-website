'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { customerNeedsPush } from '@/lib/pushRequirement'
import { PETS_REQUIRED_MESSAGE } from '@/lib/customerPets'
import { customerNeedsPets } from '@/lib/customerPetsData'
import { createAdminClient } from '@/lib/supabase/admin'
import { bookingBlockedByAccess, bookingBlockedBySuspension } from '@/lib/accountSuspension'
import type { TidyTask } from '@/app/dashboard/types'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import { DEFAULT_BOOKING_TIME_ZONE, hasAcceptanceWindowClosed } from '@/lib/bookingTime'
import { serviceTimeZone } from '@/lib/serviceTimeZone'
import { MAX_ENTRY_INSTRUCTIONS_LENGTH } from '@/lib/entryInstructions'
import { draftEntryInstructions } from '@/lib/entryInstructionsData'
import { placeBooking } from '@/lib/placeBooking'
import { bookableSelection } from '@/lib/fullServiceBooking'
import { markQuoteBooked } from '@/lib/pricingQuotes'
import { dropUnmatchedLaundryLinks } from '@/lib/laundry'
import { defaultPaymentMethodId } from '@/lib/defaultPaymentMethod'
import { isRecurrenceFrequency } from '@/lib/recurringBookings'
import { followUpPlacedBooking } from '@/lib/bookingPlacedFollowUp'
import { createQuoteRequest } from '@/lib/quoteRequests'
import { findPromoForCustomer } from '@/lib/promoCodesData'
import { PROMO_UNFUNDED_MESSAGE } from '@/lib/promoCodes'
import { ensurePromoFunded, quoteDraftServicePrice } from '@/lib/promoFunding'

// After a booking is placed, only the tasks it took leave the dashboard; the ones the
// customer didn't select stay on their list. The booked ones come back if the booking
// is canceled (see restoreBookingTasks). The booked-from draft is replaced with a fresh
// one so its schedule, cleaner, notes and card don't carry into the next booking.
async function keepUnbookedTasks(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
  draftId: string,
  taskList: TidyTask[]
): Promise<void> {
  const bookedIds = new Set(taskList.filter((t) => t.completed).map((t) => t.id))
  const withoutBooked = (tasks: TidyTask[]) => dropUnmatchedLaundryLinks(tasks.filter((t) => !bookedIds.has(t.id)))

  await admin.from('booking_drafts').delete().eq('id', draftId)
  const remaining = withoutBooked(taskList)
  if (remaining.length > 0) {
    await admin.from('booking_drafts').insert({ customer_user_id: profileId, task_list: remaining as never, last_step_reached: 1 })
  }

  // Any older list is cleared of the booked tasks too, so they can't resurface from it.
  const { data: others } = await admin.from('booking_drafts').select('id, task_list').eq('customer_user_id', profileId).neq('id', draftId)
  for (const other of others ?? []) {
    const tasks = (other.task_list as TidyTask[] | null) ?? []
    if (!tasks.some((t) => bookedIds.has(t.id))) continue
    const kept = withoutBooked(tasks)
    if (kept.length === 0) await admin.from('booking_drafts').delete().eq('id', other.id)
    else await admin.from('booking_drafts').update({ task_list: kept as never }).eq('id', other.id)
  }
}

async function loadOwnedDraftTasks(
  admin: ReturnType<typeof createAdminClient>,
  draftId: string,
  profileId: string
): Promise<TidyTask[]> {
  const { data } = await admin
    .from('booking_drafts')
    .select('task_list')
    .eq('id', draftId)
    .eq('customer_user_id', profileId)
    .maybeSingle()
  return (data?.task_list as TidyTask[] | null) ?? []
}

export async function updateTaskNoteAction(draftId: string, taskId: string, note: string): Promise<void> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return

  const admin = createAdminClient()
  const tasks = await loadOwnedDraftTasks(admin, draftId, session.profileId)
  // A pet task's instructions fed its photo check and estimate; changing them
  // means re-adding the task so both are redone.
  const updated = tasks.map((t) => (t.id === taskId && !t.pet ? { ...t, notes: note } : t))

  await admin
    .from('booking_drafts')
    .update({ task_list: updated as never })
    .eq('id', draftId)
    .eq('customer_user_id', session.profileId)

  revalidatePath('/book/review')
}

// "Removing" a task from the booking just unmarks it as selected — the task
// itself stays on the draft so it still shows up (unselected) back on the
// dashboard task list.
export async function removeTaskFromBookingAction(draftId: string, taskId: string): Promise<void> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return

  const admin = createAdminClient()
  const tasks = await loadOwnedDraftTasks(admin, draftId, session.profileId)
  const updated = tasks.map((t) => (t.id === taskId ? { ...t, completed: false } : t))

  await admin
    .from('booking_drafts')
    .update({ task_list: updated as never })
    .eq('id', draftId)
    .eq('customer_user_id', session.profileId)

  revalidatePath('/book/review')
}

export interface DraftDetailsUpdate {
  notes?: string
  entryInstructions?: string
  suppliesProvided?: boolean
  giftCode?: string
}

export async function updateDraftDetailsAction(draftId: string, updates: DraftDetailsUpdate): Promise<void> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return

  const payload: { notes?: string; entry_instructions?: string; supplies_provided?: boolean; gift_code?: string } = {}
  if (updates.notes !== undefined) payload.notes = updates.notes
  // Stored as typed (blank included) so a cleared field doesn't refill from the address.
  if (updates.entryInstructions !== undefined) {
    payload.entry_instructions = updates.entryInstructions.slice(0, MAX_ENTRY_INSTRUCTIONS_LENGTH)
  }
  if (updates.suppliesProvided !== undefined) payload.supplies_provided = updates.suppliesProvided
  if (updates.giftCode !== undefined) payload.gift_code = updates.giftCode
  if (Object.keys(payload).length === 0) return

  const admin = createAdminClient()
  await admin
    .from('booking_drafts')
    .update(payload)
    .eq('id', draftId)
    .eq('customer_user_id', session.profileId)

  revalidatePath('/book/review')
}

// Checks the code can be used by this customer now and saves it on the draft; the
// review page then shows the discount. It's checked again when the booking is charged.
export async function applyPromoCodeAction(
  draftId: string,
  code: string
): Promise<{ error: string } | { success: true }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const admin = createAdminClient()
  const found = await findPromoForCustomer(admin, code, session.profileId)
  if ('error' in found) return found

  // Refused if Tydio's Stripe balance can't cover the difference for this booking (the
  // admin is emailed). Checked again on the review page and when the card is charged.
  const { data: draft } = await admin
    .from('booking_drafts')
    .select('task_list, full_service, scheduled_location, scheduled_date, scheduled_time, selected_tidy_pro_id')
    .eq('id', draftId)
    .eq('customer_user_id', session.profileId)
    .maybeSingle()
  if (!draft) return { error: 'Booking request not found.' }
  if (draft.selected_tidy_pro_id) {
    const quote = await quoteDraftServicePrice(admin, {
      customerId: session.profileId,
      tidyProId: draft.selected_tidy_pro_id,
      taskList: (draft.task_list as TidyTask[] | null) ?? [],
      location: draft.scheduled_location as ScheduledLocation | null,
      fullService: bookableSelection(draft.full_service),
    })
    if (quote) {
      const funded = await ensurePromoFunded(
        admin,
        {
          promo: found.promo,
          customerId: session.profileId,
          tidyProId: draft.selected_tidy_pro_id,
          date: draft.scheduled_date,
          time: draft.scheduled_time,
          tasks: quote.tasks,
          servicePrice: quote.servicePrice,
        },
        'applied'
      )
      if (!funded) return { error: PROMO_UNFUNDED_MESSAGE }
    }
  }

  await admin
    .from('booking_drafts')
    .update({ gift_code: found.promo.code })
    .eq('id', draftId)
    .eq('customer_user_id', session.profileId)

  revalidatePath('/book/review')
  return { success: true }
}

export async function removePromoCodeAction(draftId: string): Promise<void> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return

  await createAdminClient()
    .from('booking_drafts')
    .update({ gift_code: null })
    .eq('id', draftId)
    .eq('customer_user_id', session.profileId)

  revalidatePath('/book/review')
}

// Converts a booking_draft into a real `bookings` row — a pending request
// sent to the Tidy Pro — and clears the draft, matching the same pricing
// logic the review page itself uses so the charged total can't drift from
// what the customer saw. Callers should route to the resulting booking's
// message thread on success.
//
// The customer can optionally ask up to 2 more Tidy Pros at the same time. They're
// charged once, at their first choice's price, and every request shares that payment
// in a request group: the first to accept gets the booking and the rest are canceled.
// See lib/bookingRequestGroups.
export async function confirmBookingAction(
  draftId: string,
  timeZone?: string,
  extraCleanerIds: string[] = [],
  // Also save this booking's entry instructions on the address, for next time.
  saveEntryInstructionsToAddress = false
): Promise<{ bookingId: string } | { error: string; paymentFailed?: true; promoFailed?: true }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const admin = createAdminClient()

  const suspended = await bookingBlockedBySuspension(admin, session.profileId)
  if (suspended) return { error: suspended }
  const noAccess = await bookingBlockedByAccess(admin, session.profileId)
  if (noAccess) return { error: noAccess }
  if (await customerNeedsPush(admin, session.profileId)) {
    return { error: 'Turn on push notifications in Profile → Notifications before booking, so we can reach you about it.' }
  }
  if (await customerNeedsPets(admin, session.profileId)) return { error: PETS_REQUIRED_MESSAGE }

  const { data: draft } = await admin
    .from('booking_drafts')
    .select(
      'id, task_list, full_service, scheduled_location, scheduled_date, scheduled_time, selected_tidy_pro_id, notes, entry_instructions, supplies_provided, gift_code, selected_payment_method_id, recurrence_frequency'
    )
    .eq('id', draftId)
    .eq('customer_user_id', session.profileId)
    .maybeSingle()

  if (!draft) return { error: 'Booking request not found.' }
  if (!draft.selected_tidy_pro_id || !draft.scheduled_date || !draft.scheduled_time) {
    return { error: 'Finish scheduling before confirming.' }
  }
  // A card picked for this booking, or else their default (which the review page preselects).
  const paymentMethodId = draft.selected_payment_method_id ?? (await defaultPaymentMethodId(admin, session.profileId))
  if (!paymentMethodId) return { error: 'Select a payment method before confirming.' }
  const location = draft.scheduled_location as ScheduledLocation | null
  if (location?.type !== 'address') return { error: 'Choose a saved address for this booking before confirming.' }
  // The time they picked is local to the home, wherever their device thinks it is.
  const bookingTimeZone = await serviceTimeZone(admin, session.profileId, location, timeZone, DEFAULT_BOOKING_TIME_ZONE)
  // A booking inside this window would be auto-canceled as soon as it was made.
  if (hasAcceptanceWindowClosed(draft.scheduled_date, draft.scheduled_time, new Date(), bookingTimeZone)) {
    return { error: 'Please choose a time at least an hour from now.' }
  }

  const entryInstructions = await draftEntryInstructions(admin, session.profileId, draft.entry_instructions, location)
  const taskList = (draft.task_list as TidyTask[] | null) ?? []
  const fullService = bookableSelection(draft.full_service)

  const placed = await placeBooking(admin, {
    customerId: session.profileId,
    tidyProId: draft.selected_tidy_pro_id,
    date: draft.scheduled_date,
    time: draft.scheduled_time,
    timeZone: bookingTimeZone,
    location,
    taskList,
    fullService,
    notes: draft.notes,
    entryInstructions,
    suppliesProvided: draft.supplies_provided,
    paymentMethodId,
    extraCleanerIds,
    stripeMetadata: { draft_id: draftId },
    // Only this first visit: a recurring series' later visits are full price.
    promoCode: draft.gift_code,
  })
  if ('error' in placed) return placed

  // Before keepUnbookedTasks clears the draft, so the quote isn't later counted as abandoned.
  await markQuoteBooked(admin, draftId, placed.bookingId)

  const followUp = await followUpPlacedBooking(admin, {
    customerId: session.profileId,
    bookingId: placed.bookingId,
    tidyProId: draft.selected_tidy_pro_id,
    tidyProName: placed.tidyProName,
    paymentMethodId,
    recurrenceFrequency: draft.recurrence_frequency,
    date: draft.scheduled_date,
    time: draft.scheduled_time,
    timeZone: bookingTimeZone,
    location,
    taskList,
    fullService,
    notes: draft.notes,
    entryInstructions,
    suppliesProvided: draft.supplies_provided,
    saveEntryInstructionsToAddress,
  })
  if (followUp.startedSeries) revalidatePath('/dashboard/bookings')
  if (followUp.savedEntryInstructions) revalidatePath('/dashboard/profile/addresses')

  await keepUnbookedTasks(admin, session.profileId, draftId, taskList)

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/messages')
  return { bookingId: placed.bookingId }
}

// Automatic pricing was down when some of these tasks were added (lib/taskQuotes.ts),
// so instead of charging now, the booking goes to the chosen Tidy Pro for a quote. The
// customer approves and pays it later (lib/quoteRequests.ts); only then is a booking
// request sent. The tasks leave the dashboard while the request is out, as when booking.
export async function requestQuoteAction(
  draftId: string,
  timeZone?: string,
  saveEntryInstructionsToAddress = false
): Promise<{ quoteId: string } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const admin = createAdminClient()

  const suspended = await bookingBlockedBySuspension(admin, session.profileId)
  if (suspended) return { error: suspended }
  const noAccess = await bookingBlockedByAccess(admin, session.profileId)
  if (noAccess) return { error: noAccess }
  if (await customerNeedsPush(admin, session.profileId)) {
    return { error: 'Turn on push notifications in Profile → Notifications first, so we can tell you when your quote is ready.' }
  }
  if (await customerNeedsPets(admin, session.profileId)) return { error: PETS_REQUIRED_MESSAGE }

  const { data: draft } = await admin
    .from('booking_drafts')
    .select(
      'id, task_list, full_service, scheduled_location, scheduled_date, scheduled_time, selected_tidy_pro_id, notes, entry_instructions, supplies_provided, gift_code, selected_payment_method_id, recurrence_frequency'
    )
    .eq('id', draftId)
    .eq('customer_user_id', session.profileId)
    .maybeSingle()

  if (!draft) return { error: 'Booking request not found.' }
  if (!draft.selected_tidy_pro_id || !draft.scheduled_date || !draft.scheduled_time) {
    return { error: 'Finish scheduling before sending your request.' }
  }
  const location = draft.scheduled_location as ScheduledLocation | null
  if (location?.type !== 'address') return { error: 'Choose a saved address for this booking before sending your request.' }
  const bookingTimeZone = await serviceTimeZone(admin, session.profileId, location, timeZone, DEFAULT_BOOKING_TIME_ZONE)
  if (hasAcceptanceWindowClosed(draft.scheduled_date, draft.scheduled_time, new Date(), bookingTimeZone)) {
    return { error: 'Please choose a time at least an hour from now.' }
  }

  const taskList = (draft.task_list as TidyTask[] | null) ?? []
  const created = await createQuoteRequest(admin, {
    customerId: session.profileId,
    tidyProId: draft.selected_tidy_pro_id,
    date: draft.scheduled_date,
    time: draft.scheduled_time,
    timeZone: bookingTimeZone,
    location,
    taskList,
    fullService: draft.full_service,
    notes: draft.notes,
    entryInstructions: await draftEntryInstructions(admin, session.profileId, draft.entry_instructions, location),
    suppliesProvided: draft.supplies_provided ?? false,
    giftCode: draft.gift_code,
    recurrenceFrequency: isRecurrenceFrequency(draft.recurrence_frequency) ? draft.recurrence_frequency : null,
    saveEntryInstructions: saveEntryInstructionsToAddress,
    paymentMethodId: draft.selected_payment_method_id ?? (await defaultPaymentMethodId(admin, session.profileId)),
  })
  if ('error' in created) return created

  // The customer finished: the draft isn't an abandoned cart, though nothing's booked yet.
  await admin
    .from('pricing_quotes')
    .update({ booked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('draft_id', draftId)
    .is('booked_at', null)

  await keepUnbookedTasks(admin, session.profileId, draftId, taskList)

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/messages')
  return { quoteId: created.quoteId }
}
