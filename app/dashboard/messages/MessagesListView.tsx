'use client'

import Link from 'next/link'

export type MessageThreadSummary = {
  bookingId: string
  cleanerName: string
  cleanerPhotoUrl: string | null
  status: string
  decisionStatus: string
  scheduledDate: string | null
  scheduledTime: string | null
  unread: boolean
  lastMessage: { senderRole: string; body: string } | null
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatDateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`
}

function statusLabel(thread: MessageThreadSummary): string {
  if (thread.lastMessage) {
    const prefix = thread.lastMessage.senderRole === 'USER' ? 'You: ' : ''
    return `${prefix}${thread.lastMessage.body}`
  }
  if (thread.status === 'cancelled') return 'Request cancelled'
  if (thread.status === 'declined') return 'Request declined'
  if (thread.decisionStatus === 'accepted') return 'Booking confirmed'
  return 'Awaiting response'
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
  unreadMessageCount,
}: {
  threads: MessageThreadSummary[]
  unreadMessageCount: number
}) {
  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-10 pb-28 max-w-sm mx-auto w-full">
        <h1 className="text-3xl font-bold text-slate-900 mb-6">Messages</h1>

        {threads.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
            <p className="font-semibold text-slate-900 mb-1">No messages yet</p>
            <p className="text-sm text-slate-400">Booking requests you send will show up here.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm divide-y divide-slate-100 overflow-hidden">
            {threads.map((thread) => (
              <Link
                key={thread.bookingId}
                href={`/dashboard/messages/${thread.bookingId}`}
                className="flex items-center gap-3 px-4 py-3.5"
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
            ))}
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
