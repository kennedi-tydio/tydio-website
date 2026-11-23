'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from '@/app/components/NavigationSpinner'
import { setThreadArchivedAction } from './actions'
import QuoteRequestList, { type QuoteRequestSummary } from '@/app/components/QuoteRequestList'

export type MessageThreadSummary = {
  bookingId: string
  cleanerName: string
  cleanerPhotoUrl: string | null
  status: string
  decisionStatus: string
  scheduledDate: string | null
  scheduledTime: string | null
  unread: boolean
  lastMessage: { senderRole: string; body: string; at: string } | null
  // The latest added-task request: its status, and when it was sent or answered.
  lastAddition: { status: string; at: string } | null
  // When the booking was canceled or declined, if it was.
  endedAt: string | null
  // When the customer archived the thread themselves, if they did.
  archivedAt: string | null
}

// Finished bookings go to Archived on their own.
const AUTO_ARCHIVED_STATUSES = new Set(['completed', 'declined', 'cancelled'])

function isAutoArchived(thread: MessageThreadSummary): boolean {
  return AUTO_ARCHIVED_STATUSES.has(thread.status)
}

// Archived by hand, with nothing new in the thread since: a newer message or
// added-task update brings it back to the inbox.
function isManuallyArchived(thread: MessageThreadSummary): boolean {
  if (!thread.archivedAt) return false
  const archivedAt = Date.parse(thread.archivedAt)
  const activity = [thread.lastMessage?.at, thread.lastAddition?.at].filter((at): at is string => !!at)
  return activity.every((at) => Date.parse(at) <= archivedAt)
}

function isArchived(thread: MessageThreadSummary): boolean {
  return isAutoArchived(thread) || isManuallyArchived(thread)
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatDateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`
}

// How the booking stands, said the way the thread's last bubble says it.
function bookingStatusLabel(thread: MessageThreadSummary): string {
  // Once the Tidy Pro had accepted, ending it is canceling the booking (by either side; a
  // Tidy Pro canceling is stored as declined). Before that it was only a request.
  const wasAccepted = thread.decisionStatus === 'accepted'
  if (thread.status === 'cancelled') return wasAccepted ? 'Booking canceled' : 'Request canceled'
  if (thread.status === 'declined') return wasAccepted ? 'Booking canceled' : 'Request declined'
  if (thread.decisionStatus === 'accepted') return 'Booking confirmed'
  return 'Awaiting response'
}

function additionLabel(status: string): string {
  if (status === 'pending') return 'You asked to add tasks'
  if (status === 'accepted') return 'Booking modification accepted'
  if (status === 'declined') return 'Booking modification declined'
  if (status === 'cancelled') return 'Booking modification canceled'
  if (status === 'expired') return 'Booking modification expired'
  return 'Booking modification removed'
}

// The most recent thing in the thread: a chat message, an added-task request (or its
// answer), or the booking ending. With none of those, how the booking stands.
function statusLabel(thread: MessageThreadSummary): string {
  const candidates: { at: string; text: string }[] = []
  if (thread.lastMessage) {
    const prefix = thread.lastMessage.senderRole === 'USER' ? 'You: ' : ''
    candidates.push({ at: thread.lastMessage.at, text: `${prefix}${thread.lastMessage.body}` })
  }
  if (thread.lastAddition) candidates.push({ at: thread.lastAddition.at, text: additionLabel(thread.lastAddition.status) })
  if (thread.endedAt && (thread.status === 'cancelled' || thread.status === 'declined')) {
    candidates.push({ at: thread.endedAt, text: bookingStatusLabel(thread) })
  }
  if (candidates.length === 0) return bookingStatusLabel(thread)
  return candidates.reduce((latest, c) => (Date.parse(c.at) > Date.parse(latest.at) ? c : latest)).text
}

function IconHome() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}

function IconMessage({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--color-brand)' : 'var(--color-slate-400)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  )
}

function IconArchive() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="20" height="5" rx="1" />
      <path d="M4 8v11a2 2 0 002 2h12a2 2 0 002-2V8M10 12h4" />
    </svg>
  )
}

function IconUnarchive() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="20" height="5" rx="1" />
      <path d="M4 8v11a2 2 0 002 2h12a2 2 0 002-2V8M12 18v-6M9.5 14.5L12 12l2.5 2.5" />
    </svg>
  )
}

function IconUser() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  )
}

function Avatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt={name} className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
  }
  return (
    <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 bg-slate-100 text-slate-500 font-semibold">
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

export default function MessagesListView({
  threads,
  quotes = [],
  unreadMessageCount,
}: {
  threads: MessageThreadSummary[]
  quotes?: QuoteRequestSummary[]
  unreadMessageCount: number
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'inbox' | 'archived'>('inbox')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const inboxThreads = threads.filter((t) => !isArchived(t))
  const archivedThreads = threads.filter(isArchived)
  const shown = tab === 'inbox' ? inboxThreads : archivedThreads
  const archivedUnread = archivedThreads.filter((t) => t.unread).length

  function setArchived(bookingId: string, archived: boolean) {
    setError(null)
    setPendingId(bookingId)
    startTransition(async () => {
      const result = await setThreadArchivedAction(bookingId, archived)
      if ('error' in result) setError(result.error)
      else router.refresh()
      setPendingId(null)
    })
  }

  return (
    <main id="main-content" className="min-h-svh bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-10 pb-28 max-w-sm mx-auto w-full safe-area-inset-bottom">
        <h1 className="text-3xl font-bold text-slate-900 mb-6">Messages</h1>

        <div role="tablist" aria-label="Messages" className="flex gap-1 p-1 mb-6 rounded-full bg-slate-100">
          {([
            { id: 'inbox', label: 'Inbox', count: 0 },
            { id: 'archived', label: 'Archived', count: archivedUnread },
          ] as const).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 rounded-full py-2 text-sm font-semibold flex items-center justify-center gap-1.5 ${
                tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className="min-w-[16px] h-4 px-1 rounded-full bg-brand text-white text-[10px] font-bold flex items-center justify-center leading-none">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === 'inbox' && <QuoteRequestList quotes={quotes} />}

        {error && (
          <p role="alert" className="mb-4 text-sm text-red-600">
            {error}
          </p>
        )}

        {shown.length === 0 && tab === 'inbox' && quotes.length > 0 ? null : shown.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
            {tab === 'inbox' ? (
              <>
                <p className="font-semibold text-slate-900 mb-1">No messages yet</p>
                <p className="text-sm text-slate-400">
                  {archivedThreads.length > 0
                    ? 'Finished and archived conversations are in Archived.'
                    : 'Booking requests you send will show up here.'}
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold text-slate-900 mb-1">Nothing archived</p>
                <p className="text-sm text-slate-400">Completed, declined and canceled bookings move here on their own.</p>
              </>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm divide-y divide-slate-100 overflow-hidden">
            {shown.map((thread) => {
              // Finished bookings stay archived, so only open ones get the button.
              const canToggle = !isAutoArchived(thread)
              const archiving = tab === 'inbox'
              return (
                <div key={thread.bookingId} className="flex items-center">
                  <Link
                    href={`/dashboard/messages/${thread.bookingId}`}
                    className="flex flex-1 min-w-0 items-center gap-3 pl-4 py-3.5 pr-2"
                  >
                    <span className="relative flex-shrink-0">
                      <Avatar name={thread.cleanerName} photoUrl={thread.cleanerPhotoUrl} />
                      {thread.unread && (
                        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-brand ring-2 ring-white" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm truncate ${thread.unread ? 'font-bold text-slate-900' : 'font-semibold text-slate-900'}`}>
                        {thread.cleanerName}
                      </p>
                      <p
                        className={`text-xs truncate ${thread.unread ? 'font-semibold' : 'text-slate-400'}`}
                        style={thread.unread ? { color: 'var(--color-brand)' } : undefined}
                      >
                        {statusLabel(thread)}
                      </p>
                    </div>
                    {thread.scheduledDate && (
                      <p className="text-xs text-slate-400 flex-shrink-0">{formatDateLabel(thread.scheduledDate)}</p>
                    )}
                  </Link>
                  {canToggle ? (
                    <button
                      type="button"
                      onClick={() => setArchived(thread.bookingId, archiving)}
                      disabled={pendingId === thread.bookingId}
                      aria-label={`${archiving ? 'Archive' : 'Move to inbox'}: conversation with ${thread.cleanerName}`}
                      title={archiving ? 'Archive' : 'Move to inbox'}
                      className="flex-shrink-0 mr-2 w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                    >
                      {archiving ? <IconArchive /> : <IconUnarchive />}
                    </button>
                  ) : (
                    <span className="w-2 flex-shrink-0" />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <nav aria-label="Main" className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 safe-area-inset-bottom">
        <div className="flex justify-around items-center py-2 max-w-sm mx-auto px-2">
          {[
            { icon: <IconHome />, label: 'Home', active: false, href: '/dashboard', badge: 0 },
            { icon: <IconCalendar />, label: 'Bookings', active: false, href: '/dashboard/bookings', badge: 0 },
            { icon: <IconMessage active />, label: 'Messages', active: true, href: '/dashboard/messages', badge: unreadMessageCount },
            { icon: <IconUser />, label: 'Profile', active: false, href: '/dashboard/profile', badge: 0 },
          ].map((item) => (
            <Link key={item.label} href={item.href} aria-current={item.active ? 'page' : undefined} className="flex flex-col items-center gap-0.5 px-3 py-1 relative">
              <span className="relative">
                {item.icon}
                {item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-brand text-white text-[10px] font-bold flex items-center justify-center leading-none">
                    {item.badge}
                  </span>
                )}
              </span>
              <span className={`text-[10px] font-medium ${item.active ? 'text-brand' : 'text-slate-400'}`}>
                {item.label}
              </span>
              {item.active && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand" />
              )}
            </Link>
          ))}
        </div>
      </nav>
    </main>
  )
}
