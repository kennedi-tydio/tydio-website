'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { shiftDateISO } from '@/lib/bookingTime'

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']

function formatClockTime(minutesSinceMidnight: number): string {
  const h = Math.floor(minutesSinceMidnight / 60) % 24
  const m = minutesSinceMidnight % 60
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function formatDayLabel(dateISO: string, today: string): string {
  if (dateISO === today) return 'Today'
  if (dateISO === shiftDateISO(today, 1)) return 'Tomorrow'
  const d = new Date(`${dateISO}T00:00:00`)
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`
}

function IconCalendar({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--color-brand)' : 'var(--color-slate-400)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}

function IconHome() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  )
}

function IconMessage() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

function IconChevronRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

function IconChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#1a2332" strokeWidth="2" strokeLinecap="round">
      <path d="M4 6l4 4 4-4" />
    </svg>
  )
}

export type JobRow = {
  id: string
  href: string
  reviewLabel: string | null
  customerName: string
  address: string | null
  scheduledDate: string | null
  scheduledTime: string | null
  durationMinutes: number
  bucket: 'today' | 'upcoming' | 'past'
  today: string
}

type Tab = 'today' | 'upcoming' | 'past'

function sortKey(j: JobRow): string {
  return `${j.scheduledDate ?? ''}T${j.scheduledTime ?? ''}`
}

function JobRowCard({ job }: { job: JobRow }) {
  const dayLabel = job.scheduledDate ? formatDayLabel(job.scheduledDate, job.today) : '—'
  let startLabel = '—'
  let endLabel = ''
  if (job.scheduledTime) {
    const [h, m] = job.scheduledTime.split(':').map(Number)
    const start = h * 60 + m
    startLabel = formatClockTime(start)
    endLabel = `to ${formatClockTime(start + job.durationMinutes)}`
  }

  return (
    <Link href={job.href} className="flex items-start justify-between gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors">
      <div className="flex-shrink-0 w-20">
        <p className="text-xs font-semibold text-slate-500">{dayLabel}</p>
        <p className="text-sm font-bold text-slate-900 mt-0.5">{startLabel}</p>
        {endLabel && <p className="text-xs text-slate-400">{endLabel}</p>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-900 truncate">{job.customerName}</p>
        {job.address && <p className="text-xs text-slate-400 truncate">{job.address}</p>}
        {job.reviewLabel && (
          <p className="text-xs font-semibold mt-1" style={{ color: 'var(--color-brand)' }}>
            {job.reviewLabel}
          </p>
        )}
      </div>
      <span className="flex-shrink-0 mt-0.5">
        <IconChevronRight />
      </span>
    </Link>
  )
}

export default function JobsListView({ jobs, unreadMessageCount }: { jobs: JobRow[]; unreadMessageCount: number }) {
  const [tab, setTab] = useState<Tab>('today')
  const [sortDesc, setSortDesc] = useState(false)

  const visible = useMemo(() => {
    const filtered = jobs.filter((j) => j.bucket === tab)
    const sorted = [...filtered].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
    return sortDesc ? sorted.reverse() : sorted
  }, [jobs, tab, sortDesc])

  const TABS: { key: Tab; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'past', label: 'Past' },
  ]

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-10 pb-28 max-w-sm mx-auto w-full">
        <h1 className="text-3xl font-bold text-slate-900 mb-5">Your Jobs</h1>

        <div className="flex items-center gap-2 mb-5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-3.5 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                tab === t.key ? 'border-brand text-brand' : 'border-slate-200 text-slate-600 bg-white'
              }`}
              style={tab === t.key ? { backgroundColor: '#e8f9fa' } : undefined}
            >
              {t.label}
            </button>
          ))}
          <span className="w-px h-6 bg-slate-200 flex-shrink-0" />
          <button
            type="button"
            onClick={() => setSortDesc((v) => !v)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-900 bg-white flex-shrink-0"
          >
            Date <IconChevronDown />
          </button>
        </div>

        {visible.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm py-10 px-6 text-center">
            <p className="text-sm text-slate-400">You have no booked jobs at the moment</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm divide-y divide-slate-100 overflow-hidden">
            {visible.map((job) => (
              <JobRowCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </div>

      <nav aria-label="Main" className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100">
        <div className="flex justify-around items-center py-2 max-w-sm mx-auto px-2">
          {[
            { icon: <IconHome />, label: 'Home', href: '/pro/dashboard', active: false, badge: 0 },
            { icon: <IconCalendar active />, label: 'Bookings', href: '/pro/bookings', active: true, badge: 0 },
            { icon: <IconMessage />, label: 'Messages', href: '/pro/messages', active: false, badge: unreadMessageCount },
            { icon: <IconUser />, label: 'Profile', href: '/pro/profile', active: false, badge: 0 },
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
