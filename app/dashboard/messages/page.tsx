import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { isHiddenGroupRequest } from '@/lib/bookingRequestGroups'
import { listQuoteRequests } from '@/lib/quoteRequests'
import MessagesListView, { type MessageThreadSummary } from './MessagesListView'

export const metadata: Metadata = { title: 'Messages — Tydio' }

export default async function MessagesPage() {
  const session = await getSession()
  if (!session || session.role !== 'USER') redirect('/login')

  const admin = createAdminClient()

  const { data: bookings, error } = await admin
    .from('bookings')
    .select(
      'id, tidy_pro_name, tidy_pro_photo_url, status, decision_status, scheduled_date, scheduled_time, updated_at, user_unread, request_group_id, ended_at, user_archived_at'
    )
    .eq('user_id', session.profileId)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(`Failed to load messages: ${error.message}`)

  const bookingIds = (bookings ?? []).map((b) => b.id)
  const updatedAtById = new Map((bookings ?? []).map((b) => [b.id, b.updated_at as string | null]))
  const { data: chatRows } = bookingIds.length
    ? await admin
        .from('booking_messages')
        .select('booking_id, sender_role, body, created_at')
        .in('booking_id', bookingIds)
        .order('created_at', { ascending: true })
    : { data: [] }

  const lastMessageByBooking = new Map<string, { senderRole: string; body: string; at: string }>()
  for (const m of chatRows ?? []) {
    lastMessageByBooking.set(m.booking_id, { senderRole: m.sender_role, body: m.body, at: m.created_at })
  }

  // The latest added-task request per booking: when it was sent, or answered.
  const { data: additionRows } = bookingIds.length
    ? await admin
        .from('booking_task_additions')
        .select('booking_id, status, created_at, responded_at')
        .in('booking_id', bookingIds)
        .order('created_at', { ascending: true })
    : { data: [] }
  const lastAdditionByBooking = new Map<string, { status: string; at: string }>()
  for (const a of additionRows ?? []) {
    lastAdditionByBooking.set(a.booking_id, { status: a.status, at: a.responded_at ?? a.created_at })
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
    lastAddition: lastAdditionByBooking.get(b.id) ?? null,
    endedAt: b.ended_at,
    archivedAt: b.user_archived_at,
  }))

  // Most recent activity first: the last chat message, added-task update, or booking change.
  const lastActivity = (t: MessageThreadSummary) =>
    Math.max(
      ...[t.lastMessage?.at, t.lastAddition?.at, updatedAtById.get(t.bookingId)]
        .filter((at): at is string => !!at)
        .map((at) => Date.parse(at)),
      0
    )
  threads.sort((a, b) => lastActivity(b) - lastActivity(a))

  const quotes = await listQuoteRequests(admin, 'USER', session.profileId)
  const unreadMessageCount = threads.filter((t) => t.unread).length + quotes.filter((q) => q.unread).length

  return <MessagesListView threads={threads} quotes={quotes} unreadMessageCount={unreadMessageCount} />
}
