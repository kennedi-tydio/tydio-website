import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { CLEANER_CANCELLED_REASON, cleanerCancelledNote } from '@/lib/bookingRequestGroups'
import { haversineDistanceMiles } from '@/lib/cleanerMatching'
import { canCall } from '@/lib/maskedCalls'
import { bookingStartInstant, scheduleForViewer } from '@/lib/bookingTime'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import type { TidyTask } from '@/app/dashboard/types'
import ProMessageThreadView, { type ChatMessage } from './ProMessageThreadView'
import { signedTaskPhotoUrls } from '@/lib/customerTaskPhotos'

export const metadata: Metadata = { title: 'Messages — Tydio' }

export default async function ProMessageThreadPage({
  params,
}: {
  params: Promise<{ bookingId: string }>
}) {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const { bookingId } = await params

  const admin = createAdminClient()

  const { data: booking, error } = await admin
    .from('bookings')
    .select(
      'id, user_id, scheduled_date, scheduled_time, scheduled_location, estimated_duration_minutes, task_list, pets, notes, will_provide_supplies, cleaner_pay, status, decision_status, progress_status, tidy_pro_unread, cancelled_reason, time_zone'
    )
    .eq('id', bookingId)
    .eq('tidy_pro_id', session.profileId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load booking: ${error.message}`)
  if (!booking) redirect('/pro/messages')

  if (booking.tidy_pro_unread) {
    await admin.from('bookings').update({ tidy_pro_unread: false }).eq('id', bookingId)
  }

  const [{ data: customerProfile }, { data: myStats }, { data: chatRows }] = await Promise.all([
    admin.from('profiles').select('first_name, last_name, photo_url').eq('id', booking.user_id).maybeSingle(),
    admin.from('tidypro_profiles').select('latitude, longitude, time_zone').eq('id', session.profileId).maybeSingle(),
    admin
      .from('booking_messages')
      .select('id, sender_role, body, created_at, kind, proposed_date, proposed_time, proposal_status')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true }),
  ])

  const schedule = scheduleForViewer(booking.scheduled_date, booking.scheduled_time, booking.time_zone, myStats?.time_zone ?? null)

  const messages: ChatMessage[] = (chatRows ?? []).map((m) => {
    // Suggested times are stored in the booking's time zone; show them in the cleaner's.
    const proposed =
      m.kind === 'time_proposal' && m.proposed_date && m.proposed_time
        ? scheduleForViewer(m.proposed_date, m.proposed_time, booking.time_zone, myStats?.time_zone ?? null)
        : null
    return {
      id: m.id,
      senderRole: m.sender_role as 'USER' | 'TIDYPRO',
      body: m.body,
      createdAt: m.created_at,
      proposal: proposed ? { date: proposed.date, time: proposed.time, status: m.proposal_status ?? 'pending' } : null,
    }
  })

  const location = booking.scheduled_location as ScheduledLocation | null
  const distanceMiles =
    location?.latitude != null && location?.longitude != null && myStats?.latitude != null && myStats?.longitude != null
      ? haversineDistanceMiles(
          { latitude: location.latitude, longitude: location.longitude },
          { latitude: myStats.latitude, longitude: myStats.longitude }
        )
      : null

  const addressLabel =
    location?.type === 'address' ? location.label : location?.type === 'current_location' ? 'Current Location' : null
  const addressLine = location?.type === 'address' ? location.line : null

  const customerName = [customerProfile?.first_name, customerProfile?.last_name].filter(Boolean).join(' ') || 'the customer'

  return (
    <ProMessageThreadView
      bookingId={booking.id}
      customerName={customerName}
      customerPhotoUrl={customerProfile?.photo_url ?? null}
      canCall={canCall({ ...booking, tidy_pro_id: session.profileId })}
      scheduledDate={schedule.date}
      scheduledTime={schedule.time}
      startsAtMs={
        booking.scheduled_date && booking.scheduled_time
          ? bookingStartInstant(booking.scheduled_date, booking.scheduled_time, booking.time_zone).getTime()
          : null
      }
      customerLocalTime={schedule.converted ? booking.scheduled_time : null}
      durationMinutes={booking.estimated_duration_minutes ?? 30}
      distanceMiles={distanceMiles}
      addressLabel={addressLabel}
      addressLine={addressLine}
      tasks={(booking.task_list as TidyTask[] | null) ?? []}
      photoUrls={await signedTaskPhotoUrls(admin, (booking.task_list as TidyTask[] | null) ?? [])}
      pets={booking.pets}
      notes={booking.notes}
      suppliesProvided={booking.will_provide_supplies ?? false}
      payout={booking.cleaner_pay ?? 0}
      status={booking.status ?? 'pending'}
      cancelledNote={cleanerCancelledNote(booking.cancelled_reason)}
      cancelledByMe={booking.cancelled_reason === CLEANER_CANCELLED_REASON}
      decisionStatus={booking.decision_status}
      progressStatus={booking.progress_status}
      messages={messages}
    />
  )
}
