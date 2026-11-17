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
import { markQuoteBooked } from '@/lib/pricingQuotes'
import { dropUnmatchedLaundryLinks } from '@/lib/laundry'
import { defaultPaymentMethodId, makeDefaultIfNone } from '@/lib/defaultPaymentMethod'
import { isRecurrenceFrequency, startRecurringSeries } from '@/lib/recurringBookings'

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

export async function applyPromoCodeAction(
  draftId: string,
  code: string
): Promise<{ error: string } | { success: true }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const trimmed = code.trim()
  if (!trimmed) return { error: 'Enter a promo code.' }

  const admin = createAdminClient()
  const { data: promo } = await admin
    .from('promo_codes')
    .select('id, code, active')
    .ilike('code', trimmed)
    .maybeSingle()

  if (!promo || !promo.active) return { error: 'Invalid promo code. Try again.' }

  await admin
    .from('booking_drafts')
    .update({ gift_code: promo.code })
    .eq('id', draftId)
    .eq('customer_user_id', session.profileId)

  revalidatePath('/book/review')
  return { success: true }
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
): Promise<{ bookingId: string } | { error: string; paymentFailed?: true }> {
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
      'id, task_list, scheduled_location, scheduled_date, scheduled_time, selected_tidy_pro_id, notes, entry_instructions, supplies_provided, selected_payment_method_id, recurrence_frequency'
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

  const placed = await placeBooking(admin, {
    customerId: session.profileId,
    tidyProId: draft.selected_tidy_pro_id,
    date: draft.scheduled_date,
    time: draft.scheduled_time,
    timeZone: bookingTimeZone,
    location,
    taskList,
    notes: draft.notes,
    entryInstructions,
    suppliesProvided: draft.supplies_provided,
    paymentMethodId,
    extraCleanerIds,
    stripeMetadata: { draft_id: draftId },
  })
  if ('error' in placed) return placed

  // Before keepUnbookedTasks clears the draft, so the quote isn't later counted as abandoned.
  await markQuoteBooked(admin, draftId, placed.bookingId)

  await makeDefaultIfNone(admin, session.profileId, paymentMethodId)

  // The first visit is booked; the series books each next one (see lib/recurringBookings).
  if (isRecurrenceFrequency(draft.recurrence_frequency)) {
    await startRecurringSeries(admin, {
      customerId: session.profileId,
      tidyProId: draft.selected_tidy_pro_id,
      tidyProName: placed.tidyProName,
      frequency: draft.recurrence_frequency,
      firstDate: draft.scheduled_date,
      time: draft.scheduled_time,
      timeZone: bookingTimeZone,
      location,
      taskList,
      notes: draft.notes,
      entryInstructions,
      suppliesProvided: draft.supplies_provided,
      paymentMethodId,
      firstBookingId: placed.bookingId,
    }).catch((err) => console.error('[Tydio] Starting recurring booking failed:', err))
    revalidatePath('/dashboard/bookings')
  }

  await keepUnbookedTasks(admin, session.profileId, draftId, taskList)

  if (saveEntryInstructionsToAddress && location?.type === 'address') {
    await admin
      .from('user_addresses')
      .update({ entry_instructions: entryInstructions, updated_at: new Date().toISOString() })
      .eq('id', location.addressId)
      .eq('user_id', session.profileId)
    revalidatePath('/dashboard/profile/addresses')
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/messages')
  return { bookingId: placed.bookingId }
}
