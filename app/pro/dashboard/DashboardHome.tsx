import Link from 'next/link'
import TodayJobRow from './TodayJobRow'

export type TodayJob = {
  id: string
  customerName: string
  address: string
  startTime: string | null
  durationMinutes: number | null
  progressStatus: string | null
  isActive: boolean
}

export type UpcomingJob = TodayJob & { date: string | null }

// ── icons ────────────────────────────────────────────────────────────────────

function IconHome({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'var(--color-brand)' : 'none'} stroke={active ? 'var(--color-brand)' : 'var(--color-slate-400)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/>
      <path d="M9 21V12h6v9"/>
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <path d="M16 2v4M8 2v4M3 10h18"/>
    </svg>
  )
}

function IconMessage() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
  )
}

function IconUser() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  )
}

function IconChevronRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6"/>
    </svg>
  )
}

function IconStar() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#f5a623" stroke="#f5a623" strokeWidth="1">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  )
}

// ── helpers ──────────────────────────────────────────────────────────────────

function formatTimeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function jobTimeRange(job: TodayJob): string {
  if (!job.startTime) return 'Anytime today'
  const [h, m] = job.startTime.split(':').map(Number)
  const duration = job.durationMinutes ?? 60
  const endTotal = h * 60 + m + duration
  const endH = Math.floor(endTotal / 60) % 24
  const endM = endTotal % 60
  const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
  return `${formatTimeLabel(job.startTime)} to ${formatTimeLabel(endTime)}`
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']

function tomorrowISO(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDayLabel(dateISO: string): string {
  if (dateISO === tomorrowISO()) return 'Tomorrow'
  const d = new Date(`${dateISO}T00:00:00`)
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`
}

// ── component ────────────────────────────────────────────────────────────────

export default function DashboardHome({
  firstName,
  jobsToday,
  jobsCompleted,
  rating,
  reviewCount,
  todaysJobs,
  upcomingJobs,
  unreadMessageCount,
  onboardingSteps,
}: {
  firstName: string
  jobsToday: number
  jobsCompleted: number
  rating: number
  reviewCount: number
  todaysJobs: TodayJob[]
  upcomingJobs: UpcomingJob[]
  unreadMessageCount: number
  onboardingSteps: { label: string; href: string }[]
}) {
  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-10 pb-28 max-w-sm mx-auto w-full">

        <p className="text-sm text-slate-500 mb-1">Welcome {firstName}</p>

        {onboardingSteps.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-3">Requested Actions</h2>
            <div className="flex flex-col gap-3">
              {onboardingSteps.map((step) => (
                <Link
                  key={step.label}
                  href={step.href}
                  className="w-full bg-white rounded-2xl px-5 py-4 shadow-sm flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <span className="font-semibold text-slate-800 text-sm">{step.label}</span>
                  <IconChevronRight />
                </Link>
              ))}
            </div>
          </div>
        )}

        <h1 className="text-3xl font-bold text-slate-900 mb-6">Dashboard</h1>

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="rounded-2xl border border-slate-100 shadow-sm py-4 px-2 text-center">
            <p className="text-2xl font-bold text-slate-900">{jobsToday}</p>
            <p className="text-xs text-slate-400 mt-1 leading-tight">Jobs Today</p>
          </div>
          <div className="rounded-2xl border border-slate-100 shadow-sm py-4 px-2 text-center">
            <p className="text-2xl font-bold text-slate-900">{jobsCompleted}</p>
            <p className="text-xs text-slate-400 mt-1 leading-tight">Jobs Completed</p>
          </div>
          <div className="rounded-2xl border border-slate-100 shadow-sm py-4 px-2 text-center">
            {reviewCount > 0 ? (
              <p className="flex items-center justify-center gap-1 text-2xl font-bold text-slate-900">
                <IconStar />{rating.toFixed(1)}
              </p>
            ) : (
              <p className="text-sm font-bold text-slate-900 leading-tight">No Rating<br />Yet</p>
            )}
            <p className="text-xs text-slate-400 mt-1 leading-tight">Average Rating</p>
          </div>
        </div>

        {/* Today's Jobs */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-2xl font-bold text-slate-900">Today&apos;s Jobs</h2>
          {todaysJobs.length > 0 && (
            <Link href="/pro/bookings" className="text-sm text-slate-400 underline">See all</Link>
          )}
        </div>

        <div className={upcomingJobs.length > 0 ? 'mb-10' : ''}>
          {todaysJobs.length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
              <p className="text-sm text-slate-400 leading-relaxed">
                You&apos;ll be notified when you receive your first booking request!
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-100 bg-white shadow-sm divide-y divide-slate-100 overflow-hidden">
              {todaysJobs.map((job) => (
                <TodayJobRow key={job.id} job={job} timeRangeLabel={jobTimeRange(job)} />
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Jobs */}
        {upcomingJobs.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-2xl font-bold text-slate-900">Upcoming Jobs</h2>
              <Link href="/pro/bookings" className="text-sm text-slate-400 underline">See all</Link>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white shadow-sm divide-y divide-slate-100 overflow-hidden">
              {upcomingJobs.map((job) => (
                <Link key={job.id} href={`/pro/bookings/${job.id}`} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400 mb-0.5">{job.date ? formatDayLabel(job.date) : 'Upcoming'}</p>
                    <p className="text-xs text-slate-400 mb-1">{jobTimeRange(job)}</p>
                    <p className="text-sm font-semibold text-slate-900 truncate">{job.customerName}</p>
                    {job.address && <p className="text-xs text-slate-400 truncate">{job.address}</p>}
                  </div>
                  <IconChevronRight />
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Bottom navigation ── */}
      <nav aria-label="Main" className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 safe-area-inset-bottom">
        <div className="flex justify-around items-center py-2 max-w-sm mx-auto px-2">
          {[
            { icon: <IconHome active />, label: 'Home', active: true, href: '/pro/dashboard', badge: 0 },
            { icon: <IconCalendar />, label: 'Bookings', active: false, href: '/pro/bookings', badge: 0 },
            { icon: <IconMessage />, label: 'Messages', active: false, href: '/pro/messages', badge: unreadMessageCount },
            { icon: <IconUser />, label: 'Profile', active: false, href: '/pro/profile', badge: 0 },
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
