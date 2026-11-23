import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { canRequestReplacements, getReplacementOptions, liveReplacementGroup } from '@/lib/bookingRequestGroups'
import { getChainReplacementOptions, loadChainBooking, replacesOneAtATime } from '@/lib/replacementChain'
import ReplacementPickerView from './ReplacementPickerView'
import ChainReplacementPickerView from './ChainReplacementPickerView'

export const metadata: Metadata = { title: 'Choose other Tidy Pros — Tydio' }

export default async function ReplacementPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'USER') redirect('/login')

  const { bookingId } = await params
  const admin = createAdminClient()

  const { data: booking, error } = await admin
    .from('bookings')
    .select(
      'id, tidy_pro_id, status, request_group_id, scheduled_date, scheduled_time, scheduled_location, estimated_duration_minutes, task_list, full_service, stripe_payment_intent_id, stripe_refund_id, cancelled_reason, time_zone'
    )
    .eq('id', bookingId)
    .eq('user_id', session.profileId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load booking: ${error.message}`)
  if (!booking) redirect('/dashboard/messages')

  const existingGroup = await liveReplacementGroup(admin, bookingId)

  if (!canRequestReplacements(booking, existingGroup != null)) redirect(`/dashboard/messages/${bookingId}`)

  // A Standard / Deep Cleaning: one Tidy Pro at a time, each with their own price.
  if (replacesOneAtATime(booking)) {
    const chainBooking = await loadChainBooking(admin, bookingId, session.profileId)
    if (!chainBooking) redirect('/dashboard/messages')
    const { options, holding } = await getChainReplacementOptions(admin, chainBooking)
    return (
      <ChainReplacementPickerView
        bookingId={booking.id}
        scheduledDate={booking.scheduled_date}
        scheduledTime={booking.scheduled_time}
        paidTotal={holding.heldTotal}
        options={options}
      />
    )
  }

  const options = await getReplacementOptions(admin, { ...booking, user_id: session.profileId })

  return (
    <ReplacementPickerView
      bookingId={booking.id}
      scheduledDate={booking.scheduled_date}
      scheduledTime={booking.scheduled_time}
      options={options}
    />
  )
}
