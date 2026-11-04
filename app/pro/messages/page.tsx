import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { cleanerCancelledNote } from '@/lib/bookingRequestGroups'
import { scheduleForViewer } from '@/lib/bookingTime'
import ProMessagesListView, { type ProMessageThreadSummary } from './ProMessagesListView'

export const metadata: Metadata = { title: 'Messages — Tydio' }

export default async function ProMessagesPage() {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const admin = createAdminClient()

  const { data: bookings, error } = await admin
    .from('bookings')
    .select('id, user_id, status, decision_status, scheduled_date, scheduled_time, updated_at, tidy_pro_unread, cancelled_reason, time_zone')
    .eq('tidy_pro_id', session.profileId)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(`Failed to load messages: ${error.message}`)

  const customerIds = [...new Set((bookings ?? []).map((b) => b.user_id))]
  const { data: customers } = customerIds.length
    ? await admin.from('profiles').select('id, first_name, last_name, photo_url').in('id', customerIds)
    : { data: [] }
  const customerById = new Map((customers ?? []).map((c) => [c.id, c]))

  const bookingIds = (bookings ?? []).map((b) => b.id)
  const { data: chatRows } = bookingIds.length
    ? await admin
        .from('booking_messages')
        .select('booking_id, sender_role, body, created_at')
        .in('booking_id', bookingIds)
        .order('created_at', { ascending: true })
    : { data: [] }

  const lastMessageByBooking = new Map<string, { senderRole: string; body: string }>()
  for (const m of chatRows ?? []) {
    lastMessageByBooking.set(m.booking_id, { senderRole: m.sender_role, body: m.body })
  }

  const { data: me } = await admin.from('tidypro_profiles').select('time_zone').eq('id', session.profileId).maybeSingle()

  const threads: ProMessageThreadSummary[] = (bookings ?? []).map((b) => {
    const customer = customerById.get(b.user_id)
    const schedule = scheduleForViewer(b.scheduled_date, b.scheduled_time, b.time_zone, me?.time_zone ?? null)
    return {
      bookingId: b.id,
      customerName: customer ? [customer.first_name, customer.last_name].filter(Boolean).join(' ') || 'Customer' : 'Customer',
      customerPhotoUrl: customer?.photo_url ?? null,
      status: b.status ?? 'pending',
      cancelledNote: cleanerCancelledNote(b.cancelled_reason),
      decisionStatus: b.decision_status,
      scheduledDate: schedule.date,
      scheduledTime: schedule.time,
      unread: b.tidy_pro_unread ?? false,
      lastMessage: lastMessageByBooking.get(b.id) ?? null,
    }
  })

  const unreadMessageCount = threads.filter((t) => t.unread).length

  return <ProMessagesListView threads={threads} unreadMessageCount={unreadMessageCount} />
}
