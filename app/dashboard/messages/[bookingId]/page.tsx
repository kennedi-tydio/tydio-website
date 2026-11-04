import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { haversineDistanceMiles } from '@/lib/cleanerMatching'
import { canCall } from '@/lib/maskedCalls'
import { CLEANER_CANCELLED_REASON, canRequestReplacements, customerCancelledNote } from '@/lib/bookingRequestGroups'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import type { TidyTask } from '@/app/dashboard/types'
import MessageThreadView, { type ChatMessage } from './MessageThreadView'

export const metadata: Metadata = { title: 'Messages — Tydio' }

export default async function MessageThreadPage({
  params,
}: {
  params: Promise<{ bookingId: string }>
}) {
  const session = await getSession()
  if (!session || session.role !== 'USER') redirect('/login')

  const { bookingId } = await params

  const admin = createAdminClient()

  const { data: booking, error } = await admin
    .from('bookings')
    .select(
      'id, tidy_pro_id, tidy_pro_name, tidy_pro_photo_url, scheduled_date, scheduled_time, scheduled_location, estimated_duration_minutes, task_list, pets, notes, will_provide_supplies, total_customer_charge, status, decision_status, progress_status, user_unread, request_group_id, scheduled_date, stripe_payment_intent_id, stripe_refund_id, cancelled_reason, time_zone'
    )
    .eq('id', bookingId)
    .eq('user_id', session.profileId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load booking: ${error.message}`)
  if (!booking) redirect('/dashboard/messages')

  if (booking.user_unread) {
    await admin.from('bookings').update({ user_unread: false }).eq('id', bookingId)
  }

  const { data: replacementGroup } = await admin
    .from('booking_request_groups')
    .select('id')
    .eq('original_booking_id', bookingId)
    .maybeSingle()

  const [{ data: cleanerStats }, { data: chatRows }] = await Promise.all([
    booking.tidy_pro_id
      ? admin.from('tidypro_profiles').select('latitude, longitude').eq('id', booking.tidy_pro_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from('booking_messages')
      .select('id, sender_role, body, created_at, kind, proposed_date, proposed_time, proposal_status')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true }),
  ])

  const messages: ChatMessage[] = (chatRows ?? []).map((m) => ({
    id: m.id,
    senderRole: m.sender_role as 'USER' | 'TIDYPRO',
    body: m.body,
    createdAt: m.created_at,
    proposal:
      m.kind === 'time_proposal' && m.proposed_date && m.proposed_time
        ? { date: m.proposed_date, time: m.proposed_time, status: m.proposal_status ?? 'pending' }
        : null,
  }))

  const location = booking.scheduled_location as ScheduledLocation | null
  const distanceMiles =
    location?.latitude != null && location?.longitude != null && cleanerStats?.latitude != null && cleanerStats?.longitude != null
      ? haversineDistanceMiles(
          { latitude: location.latitude, longitude: location.longitude },
          { latitude: cleanerStats.latitude, longitude: cleanerStats.longitude }
        )
      : null

  const addressLabel =
    location?.type === 'address' ? location.label : location?.type === 'current_location' ? 'Current Location' : null
  const addressLine = location?.type === 'address' ? location.line : null

  return (
    <MessageThreadView
      bookingId={booking.id}
      cleanerName={booking.tidy_pro_name ?? 'your Tidy Pro'}
      cleanerPhotoUrl={booking.tidy_pro_photo_url}
      canCall={canCall(booking)}
      scheduledDate={booking.scheduled_date}
      scheduledTime={booking.scheduled_time}
      durationMinutes={booking.estimated_duration_minutes ?? 30}
      distanceMiles={distanceMiles}
      addressLabel={addressLabel}
      addressLine={addressLine}
      tasks={(booking.task_list as TidyTask[] | null) ?? []}
      pets={booking.pets}
      notes={booking.notes}
      suppliesProvided={booking.will_provide_supplies ?? false}
      totalPrice={booking.total_customer_charge ?? 0}
      canChooseReplacements={canRequestReplacements(booking, replacementGroup != null)}
      cleanerCancelled={booking.cancelled_reason === CLEANER_CANCELLED_REASON}
      cancelledNote={customerCancelledNote(booking.cancelled_reason)}
      status={booking.status ?? 'pending'}
      decisionStatus={booking.decision_status}
      progressStatus={booking.progress_status}
      messages={messages}
    />
  )
}
