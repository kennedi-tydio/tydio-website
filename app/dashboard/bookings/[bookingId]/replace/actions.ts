'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { bookingBlockedBySuspension } from '@/lib/accountSuspension'
import {
  canRequestReplacements,
  getReplacementOptions,
  liveReplacementGroup,
  validateReplacementSelection,
} from '@/lib/bookingRequestGroups'
import { replacesOneAtATime, sendChainReplacementRequest } from '@/lib/replacementChain'
import { notifyNewBookingRequest } from '@/lib/notifications'
import { canSendSms, sendSmsForPayload } from '@/lib/sms'
import { sendPushForPayload } from '@/lib/push'
import type { TidyTask } from '@/app/dashboard/types'
import { bookedTaskName } from '@/lib/laundry'
import { checklistInsertRows, fullServiceLabel, readSnapshot } from '@/lib/fullServiceBooking'

// A Standard / Deep Cleaning: one Tidy Pro at a time, at their own price, with the
// difference charged or refunded now. See lib/replacementChain.
export async function sendChainReplacementAction(
  bookingId: string,
  tidyProId: string,
  expectedDifferenceCents: number
): Promise<{ success: true } | { error: string; paymentFailed?: true }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const admin = createAdminClient()
  const suspended = await bookingBlockedBySuspension(admin, session.profileId)
  if (suspended) return { error: suspended }

  const result = await sendChainReplacementRequest(admin, { customerId: session.profileId, bookingId, tidyProId, expectedDifferenceCents })
  if ('error' in result) return result

  revalidatePath('/dashboard/messages')
  revalidatePath(`/dashboard/messages/${bookingId}`)
  revalidatePath('/dashboard')
  return { success: true }
}

// Sends a task booking to up to 3 other cleaners. Nothing is charged: the customer's
// original payment carries over to whoever accepts, at the price they already paid,
// and each cleaner's payout is the same as the original booking's: 80% of that price
// before Stripe's fee. See lib/bookingRequestGroups.
export async function sendReplacementRequestsAction(
  bookingId: string,
  cleanerIds: string[]
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const admin = createAdminClient()

  const suspended = await bookingBlockedBySuspension(admin, session.profileId)
  if (suspended) return { error: suspended }

  const { data: booking } = await admin
    .from('bookings')
    .select(
      'id, tidy_pro_id, status, request_group_id, scheduled_date, scheduled_time, scheduled_location, estimated_duration_minutes, task_list, full_service, pricing_version, pricing_breakdown, customer_subtotal, total_customer_charge, cleaner_pay, will_provide_supplies, pets, notes, entry_instructions, stripe_payment_intent_id, stripe_refund_id, cancelled_reason, time_zone'
    )
    .eq('id', bookingId)
    .eq('user_id', session.profileId)
    .maybeSingle()

  if (!booking) return { error: 'Booking not found.' }

  // A Standard / Deep Cleaning goes one at a time (sendChainReplacementAction).
  if (replacesOneAtATime(booking)) return { error: 'Please refresh the page and choose one Tidy Pro.' }

  const existingGroup = await liveReplacementGroup(admin, bookingId)

  if (!canRequestReplacements(booking, existingGroup != null) || booking.total_customer_charge == null) {
    return { error: 'This booking can no longer be sent to other Tidy Pros.' }
  }

  const paymentIntentId = booking.stripe_payment_intent_id!
  const total = booking.total_customer_charge

  const options = await getReplacementOptions(admin, { ...booking, user_id: session.profileId })
  const selectionError = validateReplacementSelection(cleanerIds, options.map((o) => o.id))
  if (selectionError) return { error: selectionError }
  const chosen = options.filter((o) => cleanerIds.includes(o.id))

  // One live group per booking (migration 099) stops a double-submit sending everything
  // twice. If everyone declines, the booking is canceled and refunded, so there's one round.
  const { data: group, error: groupError } = await admin
    .from('booking_request_groups')
    .insert({
      user_id: session.profileId,
      original_booking_id: bookingId,
      stripe_payment_intent_id: paymentIntentId,
      amount_cents: Math.round(total * 100),
    })
    .select('id')
    .single()

  if (groupError || !group) return { error: 'These requests were already sent.' }

  const { data: requests, error: insertError } = await admin
    .from('bookings')
    .insert(
      chosen.map((cleaner) => ({
        user_id: session.profileId,
        tidy_pro_id: cleaner.id,
        tidy_pro_name: cleaner.name,
        tidy_pro_photo_url: cleaner.photoUrl,
        scheduled_date: booking.scheduled_date,
        scheduled_time: booking.scheduled_time,
        time_zone: booking.time_zone,
        scheduled_location: booking.scheduled_location,
        estimated_duration_minutes: booking.estimated_duration_minutes,
        task_list: booking.task_list,
        // The cleaning carries over as booked and paid for.
        full_service: booking.full_service,
        pricing_version: booking.pricing_version,
        pricing_breakdown: booking.pricing_breakdown,
        customer_subtotal: booking.customer_subtotal,
        total_customer_charge: total,
        cleaner_pay: booking.cleaner_pay,
        tip: 0,
        will_provide_supplies: booking.will_provide_supplies,
        pets: booking.pets,
        notes: booking.notes,
        entry_instructions: booking.entry_instructions,
        decision_status: 'pending',
        status: 'pending',
        tidy_pro_unread: true,
        stripe_payment_intent_id: paymentIntentId,
        request_group_id: group.id,
      })) as never
    )
    .select('id, tidy_pro_id')

  if (insertError || !requests) {
    await admin.from('booking_request_groups').delete().eq('id', group.id)
    return { error: 'Something went wrong sending your requests. Please try again.' }
  }

  const tasks = (booking.task_list as TidyTask[] | null) ?? []
  const fullService = readSnapshot(booking.full_service)
  await admin.from('booking_tasks').insert(
    requests.flatMap((request) => [
      ...(fullService ? checklistInsertRows(request.id, fullService) : []),
      ...tasks.map((task) => ({
        booking_id: request.id,
        task_name: bookedTaskName(task),
        task_category: task.room,
        task_icon: task.room.toLowerCase(),
        is_completed: false,
      })),
    ]) as never
  )

  const { data: profile } = await admin.from('profiles').select('first_name').eq('id', session.profileId).maybeSingle()

  await Promise.all(
    requests.map(async (request) => {
      if (!request.tidy_pro_id) return
      const payload = notifyNewBookingRequest(profile?.first_name ?? 'A customer', request.id, fullServiceLabel(fullService))
      const { data: tidyPro } = await admin
        .from('tidypro_profiles')
        .select('phone, sms_consent')
        .eq('id', request.tidy_pro_id)
        .maybeSingle()
      if (canSendSms(tidyPro?.sms_consent ?? null, tidyPro?.phone ?? null)) {
        await sendSmsForPayload(tidyPro!.phone!, payload).catch(() => {})
      }
      await sendPushForPayload(request.tidy_pro_id, payload).catch(() => {})
    })
  )

  revalidatePath('/dashboard/messages')
  revalidatePath(`/dashboard/messages/${bookingId}`)
  return { success: true }
}
