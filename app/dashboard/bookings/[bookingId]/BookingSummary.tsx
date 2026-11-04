'use client'

import type { ReactNode } from 'react'
import { useRouter } from '@/app/components/NavigationSpinner'
import type { BookingTaskRow } from './CurrentBookingView'

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatDateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return `${WEEKDAYS_SHORT[d.getDay()]} ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`
}

function formatClockTime(minutesSinceMidnight: number): string {
  const h = Math.floor(minutesSinceMidnight / 60) % 24
  const m = minutesSinceMidnight % 60
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function formatTimeRange(time: string, durationMinutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const start = h * 60 + m
  return `${formatClockTime(start)} - ${formatClockTime(start + durationMinutes)}`
}

function IconBack() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  )
}

export function CategoryIcon({ category }: { category: string }) {
  const c = category.toLowerCase()
  if (c.includes('kitchen'))
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a2332" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18"/><circle cx="12" cy="15" r="3"/><path d="M7 6h.01M11 6h.01"/></svg>
  if (c.includes('bed'))
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a2332" strokeWidth="1.8" strokeLinecap="round"><path d="M2 20v-8a2 2 0 012-2h16a2 2 0 012 2v8"/><path d="M2 14h20M7 14V9a1 1 0 011-1h8a1 1 0 011 1v5"/></svg>
  if (c.includes('bath'))
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a2332" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12V5a2 2 0 014 0"/><path d="M2 12h20v2a6 6 0 01-6 6H8a6 6 0 01-6-6v-2z"/><path d="M6 20l-1 2M18 20l1 2"/></svg>
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a2332" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>
}

export function groupByCategory(tasks: BookingTaskRow[]): { category: string; tasks: BookingTaskRow[] }[] {
  const order: string[] = []
  const map = new Map<string, BookingTaskRow[]>()
  for (const t of tasks) {
    if (!map.has(t.task_category)) {
      map.set(t.task_category, [])
      order.push(t.task_category)
    }
    map.get(t.task_category)!.push(t)
  }
  return order.map((category) => ({ category, tasks: map.get(category)! }))
}

export type OrderLine = { label: string; amount: number }

// The shared body of the Upcoming / Past booking screens: who, when, where,
// what, and what it cost. Each screen supplies its own buttons underneath.
export default function BookingSummary({
  eyebrow,
  cleanerName,
  scheduledDate,
  scheduledTime,
  durationMinutes,
  addressLabel,
  addressSubline,
  tasks,
  suppliesNote,
  pets,
  notes,
  orderLines,
  totalPrice,
  children,
}: {
  eyebrow: string
  cleanerName: string
  scheduledDate: string | null
  scheduledTime: string | null
  durationMinutes: number
  addressLabel: string | null
  addressSubline: string | null
  tasks: BookingTaskRow[]
  suppliesNote: string
  pets: string | null
  notes: string | null
  orderLines: OrderLine[]
  totalPrice: number
  children: ReactNode
}) {
  const router = useRouter()

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-10 max-w-sm mx-auto w-full">
        <button
          type="button"
          onClick={() => router.push('/dashboard/bookings')}
          aria-label="Back"
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-1.5 mb-5"
        >
          <IconBack />
        </button>

        <p className="text-sm text-slate-400 mb-1">{eyebrow}</p>
        <h1 className="text-2xl font-bold text-slate-900 mb-3">{cleanerName}</h1>

        <div className="flex items-stretch gap-4 mb-7">
          <div className="flex-shrink-0">
            {scheduledDate && <p className="text-sm font-semibold text-slate-900">{formatDateLabel(scheduledDate)}</p>}
            {scheduledTime && <p className="text-xs text-slate-600 mt-1">{formatTimeRange(scheduledTime, durationMinutes)}</p>}
          </div>
          {addressLabel && (
            <div className="border-l border-slate-200 pl-4 min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{addressLabel}</p>
              {addressSubline && <p className="text-xs text-slate-600 mt-1">{addressSubline}</p>}
            </div>
          )}
        </div>

        <p className="text-sm font-bold mb-3" style={{ color: 'var(--color-brand)' }}>
          Tasks
        </p>
        <div className="flex flex-col gap-4 mb-5">
          {groupByCategory(tasks).map((group) => (
            <div key={group.category}>
              <div className="flex items-center gap-2 mb-1.5">
                <CategoryIcon category={group.category} />
                <p className="text-sm font-semibold text-slate-900">{group.category}</p>
              </div>
              {group.tasks.map((task) => (
                <p key={task.id} className="text-xs text-slate-700 pl-[26px] mb-1">
                  {task.task_name}
                </p>
              ))}
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-700 mb-5">{suppliesNote}</p>

        {(pets || notes) && (
          <div className="border-t border-slate-200 pt-5 mb-5">
            <p className="text-sm font-bold mb-3" style={{ color: 'var(--color-brand)' }}>
              Additional Details
            </p>
            {pets && (
              <div className="mb-3">
                <p className="text-xs text-slate-900 mb-1">Pets</p>
                <p className="text-xs text-slate-400">{pets}</p>
              </div>
            )}
            {notes && (
              <div>
                <p className="text-xs text-slate-900 mb-1">Notes</p>
                <p className="text-xs text-slate-400">{notes}</p>
              </div>
            )}
          </div>
        )}

        <div className="border-t border-slate-200 pt-5 mb-10">
          <p className="text-sm font-bold mb-3" style={{ color: 'var(--color-brand)' }}>
            Order Summary
          </p>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 flex flex-col gap-2.5">
            {orderLines.map((line) => (
              <div key={line.label} className="flex items-center justify-between text-xs text-slate-900">
                <span>{line.label}</span>
                <span>${line.amount.toFixed(2)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between text-xs font-bold text-slate-900">
              <span>Total</span>
              <span>${totalPrice.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {children}
      </div>
    </main>
  )
}
