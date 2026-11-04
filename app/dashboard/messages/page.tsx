import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { isHiddenGroupRequest } from '@/lib/bookingRequestGroups'
import MessagesListView, { type MessageThreadSummary } from './MessagesListView'

export const metadata: Metadata = { title: 'Messages — Tydio' }

export default async function MessagesPage() {
  const session = await getSession()
  if (!session || session.role !== 'USER') redirect('/login')

  const admin = createAdminClient()

  const { data: bookings, error } = await admin
    .from('bookings')
    .select(
      'id, tidy_pro_name, tidy_pro_photo_url, status, decision_status, scheduled_date, scheduled_time, updated_at, user_unread, request_group_id'
    )
    .eq('user_id', session.profileId)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(`Failed to load messages: ${error.message}`)

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

  const threads: MessageThreadSummary[] = (bookings ?? []).filter((b) => !isHiddenGroupRequest(b)).map((b) => ({
    bookingId: b.id,
    cleanerName: b.tidy_pro_name ?? 'your Tidy Pro',
    cleanerPhotoUrl: b.tidy_pro_photo_url,
    status: b.status ?? 'pending',
    decisionStatus: b.decision_status,
    scheduledDate: b.scheduled_date,
    scheduledTime: b.scheduled_time,
    unread: b.user_unread ?? false,
    lastMessage: lastMessageByBooking.get(b.id) ?? null,
  }))

  const unreadMessageCount = threads.filter((t) => t.unread).length

  return <MessagesListView threads={threads} unreadMessageCount={unreadMessageCount} />
}
