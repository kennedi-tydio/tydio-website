import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { canCall } from '@/lib/maskedCalls'
import { noShowReportableAt } from '@/lib/bookingTime'
import { isRecurrenceFrequency, recurrenceScheduleLabel } from '@/lib/recurrence'
import { listTaskAdditions } from '@/lib/bookingTaskAdditions'
import { CLEANER_CANCELLED_REASON, canRequestReplacements, customerCancelledNote, liveReplacementGroup } from '@/lib/bookingRequestGroups'
import type { TidyTask } from '@/app/dashboard/types'
import MessageThreadView, { type ChatMessage } from './MessageThreadView'
import { isBlockedBetween } from '@/lib/userBlocks'

export const metadata: Metadata = { title: 'Messages — Tydio' }

export default async function MessageThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>
  searchParams: Promise<{ from?: string }>
}) {
  const session = await getSession()
  if (!session || session.role !== 'USER') redirect('/login')

  const { bookingId } = await params
  // Set when the customer lands here straight from sending a booking request.
  const { from } = await searchParams

  const admin = createAdminClient()

  const { data: booking, error } = await admin
    .from('bookings')
    .select(
      'id, tidy_pro_id, tidy_pro_name, tidy_pro_photo_url, scheduled_date, scheduled_time, estimated_duration_minutes, task_list, will_provide_supplies, total_customer_charge, status, decision_status, progress_status, user_unread, request_group_id, scheduled_date, stripe_payment_intent_id, stripe_refund_id, cancelled_reason, time_zone, recurring_booking_id, full_service'
    )
    .eq('id', bookingId)
    .eq('user_id', session.profileId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load booking: ${error.message}`)
  if (!booking) redirect('/dashboard/messages')

  if (booking.user_unread) {
    await admin.from('bookings').update({ user_unread: false }).eq('id', bookingId)
  }

  // A visit of a recurring booking repeats on the same weekday and time.
  const { data: series } = booking.recurring_booking_id
    ? await admin.from('recurring_bookings').select('frequency').eq('id', booking.recurring_booking_id).maybeSingle()
    : { data: null }
  const recurrence =
    series && isRecurrenceFrequency(series.frequency) ? recurrenceScheduleLabel(series.frequency, booking.scheduled_date, booking.scheduled_time) : null

  const replacementGroup = await liveReplacementGroup(admin, bookingId)

  const { data: chatRows } = await admin
    .from('booking_messages')
    .select('id, sender_role, body, created_at, kind, proposed_date, proposed_time, proposal_status')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true })

  const messages: ChatMessage[] =(chatRows ?? []).map((m) => ({
    id: m.id,
    senderRole: m.sender_role as 'USER' | 'TIDYPRO',
    body: m.body,
    createdAt: m.created_at,
    proposal:
      m.kind === 'time_proposal' && m.proposed_date && m.proposed_time
        ? { date: m.proposed_date, time: m.proposed_time, status: m.proposal_status ?? 'pending' }
        : null,
  }))

  const blocked = await isBlockedBetween(admin, session.profileId, booking.tidy_pro_id)

  return (
    <MessageThreadView
      blocked={blocked}
      bookingId={booking.id}
      cleanerName={booking.tidy_pro_name ?? 'your Tidy Pro'}
      cleanerPhotoUrl={booking.tidy_pro_photo_url}
      canCall={!blocked && canCall(booking)}
      scheduledDate={booking.scheduled_date}
      scheduledTime={booking.scheduled_time}
      durationMinutes={booking.estimated_duration_minutes ?? 30}
      tasks={(booking.task_list as TidyTask[] | null) ?? []}
      suppliesProvided={booking.will_provide_supplies ?? false}
      totalPrice={booking.total_customer_charge ?? 0}
      canChooseReplacements={canRequestReplacements(booking, replacementGroup != null)}
      replacesOneAtATime={booking.full_service != null}
      cleanerCancelled={booking.cancelled_reason === CLEANER_CANCELLED_REASON}
      cancelledNote={customerCancelledNote(booking.cancelled_reason)}
      status={booking.status ?? 'pending'}
      decisionStatus={booking.decision_status}
      progressStatus={booking.progress_status}
      messages={messages}
      recurrence={recurrence}
      taskAdditions={(await listTaskAdditions(admin, booking.id)).map((r) => ({
        id: r.id,
        tasks: r.tasks,
        status: r.status,
        amount: r.charge,
        newDurationMinutes: r.newDurationMinutes,
        applyToSeries: r.applyToSeries,
      }))}
      backHref={from === 'booking' ? '/dashboard' : '/dashboard/messages'}
      noShowReportableAtMs={noShowReportableAt(booking.scheduled_date, booking.scheduled_time, booking.time_zone)?.getTime() ?? null}
    />
  )
}
