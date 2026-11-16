'use client'

import { useMemo, useState } from 'react'
import { useRouter } from '@/app/components/NavigationSpinner'
import { confirmSelectionAction } from './actions'
import { minutesSinceMidnight, type WeeklyAvailability } from '@/lib/cleanerMatching'
import LoadingScreen from '@/app/components/LoadingSpinner'
import { isDateInTimeOff, type TimeOffRange } from '@/lib/timeOff'
import { openStartTimes, type StartWindow } from '@/lib/bookingSlots'
import { useLocalClock } from '@/app/components/useLocalClock'

export type BusyRange = { time: string; durationMinutes: number }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const SEARCH_HORIZON_DAYS = 120
const MIN_LEAD_MINUTES = 60

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatTimeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`
}

type DateStatus = 'past' | 'unavailable' | 'available'

// The picker itself, shared with choosing a new date for a recurring visit on hold
// (app/dashboard/bookings/[bookingId]/reschedule). onConfirm returns an error to show, or
// null once it's done.
export type TimePickerProps = {
  availability: WeeklyAvailability
  // Days the Tidy Pro marked off. Shown as unavailable, like a day they don't work.
  timeOff: TimeOffRange[]
  busyByDate: Record<string, BusyRange[]>
  durationMinutes: number
  todayISO: string
  nowMinutes: number
  // Already chosen on "Plan your booking" — pre-selected here, but the
  // customer can still change either one.
  initialDate: string | null
  initialTime: string | null
  // A date range and start-time window searched with on "Plan your booking". Only
  // dates and start times inside them are offered.
  dateRange: { start: string; end: string } | null
  timeWindow: StartWindow | null
  title?: string
  intro?: string
  confirmLabel?: string
  onConfirm: (date: string, time: string) => Promise<string | null>
}

type ChooseTimeProps = Omit<TimePickerProps, 'todayISO' | 'nowMinutes' | 'onConfirm'> & { draftId: string; cleanerId: string }

export default function ChooseTimeView({ draftId, cleanerId, ...props }: ChooseTimeProps) {
  const router = useRouter()
  return (
    <TimePicker
      {...props}
      onConfirm={async (date, time) => {
        const result = await confirmSelectionAction(draftId, cleanerId, date, time)
        if ('error' in result) return result.error
        router.push('/book/review')
        return null
      }}
    />
  )
}

export function TimePicker(props: Omit<TimePickerProps, 'todayISO' | 'nowMinutes'>) {
  const clock = useLocalClock()
  if (!clock) return <LoadingScreen />
  return <ChooseTimeForm {...props} todayISO={clock.todayISO} nowMinutes={clock.nowMinutes} />
}

function ChooseTimeForm({
  availability,
  timeOff,
  busyByDate,
  durationMinutes,
  todayISO,
  nowMinutes,
  initialDate,
  initialTime,
  dateRange,
  timeWindow,
  title = 'Choose a time',
  intro,
  confirmLabel = 'Confirm time',
  onConfirm,
}: TimePickerProps) {
  const router = useRouter()

  const computeSlots = useMemo(() => {
    return (dateISO: string): string[] => {
      if (dateRange && (dateISO < dateRange.start || dateISO > dateRange.end)) return []
      if (isDateInTimeOff(timeOff, dateISO)) return []
      // Part-day time off blocks slots the same way an existing booking does.
      return openStartTimes({
        availability,
        timeOff,
        dateISO,
        durationMinutes,
        bookings: (busyByDate[dateISO] ?? []).map((b) => {
          const start = minutesSinceMidnight(b.time)
          return { start, end: start + b.durationMinutes }
        }),
        // Same-day bookings need at least an hour's lead time — a slot
        // starting earlier than that isn't enough notice for a Tidy Pro.
        earliestStart: dateISO === todayISO ? nowMinutes + MIN_LEAD_MINUTES : 0,
        window: timeWindow,
      })
    }
  }, [availability, timeOff, busyByDate, durationMinutes, todayISO, nowMinutes, dateRange, timeWindow])

  const dateStatus = useMemo(() => {
    return (dateISO: string): DateStatus => {
      if (dateISO < todayISO) return 'past'
      return computeSlots(dateISO).length > 0 ? 'available' : 'unavailable'
    }
  }, [computeSlots, todayISO])

  const earliestAvailable = useMemo(() => {
    const fromISO = dateRange && dateRange.start > todayISO ? dateRange.start : todayISO
    const start = new Date(`${fromISO}T00:00:00`)
    for (let i = 0; i < SEARCH_HORIZON_DAYS; i++) {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      const iso = toISODate(d)
      if (dateStatus(iso) === 'available') return iso
    }
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A specific date already chosen on "Plan your booking" wins over the
  // earliest-available fallback (as long as it's still valid). With a date
  // range, the first day in it with an opening.
  const effectiveInitialDate = !dateRange && initialDate && initialDate >= todayISO ? initialDate : earliestAvailable

  const initialView = effectiveInitialDate ? new Date(`${effectiveInitialDate}T00:00:00`) : new Date(`${todayISO}T00:00:00`)
  const [viewYear, setViewYear] = useState(initialView.getFullYear())
  const [viewMonth, setViewMonth] = useState(initialView.getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(effectiveInitialDate)
  // An exact time carries over; a window's start is just where the window opens.
  const carriedTime = timeWindow ? null : initialTime
  const [selectedTime, setSelectedTime] = useState<string | null>(() =>
    carriedTime && effectiveInitialDate && computeSlots(effectiveInitialDate).includes(carriedTime) ? carriedTime : null
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function changeMonth(delta: number) {
    let m = viewMonth + delta
    let y = viewYear
    if (m < 0) { m = 11; y -= 1 }
    if (m > 11) { m = 0; y += 1 }
    setViewMonth(m)
    setViewYear(y)
  }

  function selectDate(iso: string) {
    setSelectedDate(iso)
    // A specific time already chosen on "Plan your booking" carries over to
    // whichever date ends up selected, as long as it's still open that day.
    setSelectedTime(carriedTime && computeSlots(iso).includes(carriedTime) ? carriedTime : null)
  }

  async function handleConfirm() {
    if (!selectedDate || !selectedTime) return
    setSaving(true)
    setError(null)
    const problem = await onConfirm(selectedDate, selectedTime)
    setSaving(false)
    if (problem) setError(problem)
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const startOffset = new Date(viewYear, viewMonth, 1).getDay()
  const cells: (number | null)[] = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const slots = selectedDate ? computeSlots(selectedDate) : []

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-16 max-w-sm mx-auto w-full">
        <button type="button" onClick={() => router.back()} aria-label="Back" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-2 mb-4">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <h1 className="text-3xl font-bold text-slate-900 mb-6">{title}</h1>
        {intro && <p className="text-sm text-slate-500 -mt-3 mb-5">{intro}</p>}

        {(dateRange || timeWindow) && (
          <p className="text-sm text-slate-500 -mt-3 mb-5">
            Showing times
            {dateRange && <> from {formatShortDate(dateRange.start)} to {formatShortDate(dateRange.end)}</>}
            {timeWindow && <> starting between {formatTimeLabel(timeWindow.start)} and {formatTimeLabel(timeWindow.end)}</>}
            .
          </p>
        )}

        <div className="rounded-2xl border border-slate-100 shadow-sm p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={() => changeMonth(-1)} aria-label="Previous month" className="w-7 h-7 flex items-center justify-center text-slate-400">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <span className="text-sm font-semibold text-slate-900">{MONTHS[viewMonth]} {viewYear}</span>
            <button type="button" onClick={() => changeMonth(1)} aria-label="Next month" className="w-7 h-7 flex items-center justify-center text-slate-400">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
          <div className="grid grid-cols-7 gap-y-2 text-center">
            {WEEKDAY_LABELS.map((w) => <span key={w} className="text-[10px] font-semibold text-slate-400">{w}</span>)}
            {cells.map((day, i) => {
              if (day == null) return <span key={i} />
              const iso = toISODate(new Date(viewYear, viewMonth, day))
              const status = dateStatus(iso)
              const isSelected = iso === selectedDate
              const disabled = status !== 'available'
              const colorClass = isSelected
                ? 'text-white font-semibold'
                : status === 'available'
                  ? 'text-brand font-medium hover:bg-slate-100'
                  : status === 'past'
                    ? 'text-slate-300'
                    : 'text-slate-800'
              return (
                <button
                  type="button"
                  key={i}
                  disabled={disabled}
                  onClick={() => selectDate(iso)}
                  className={`w-8 h-8 mx-auto rounded-full text-sm flex items-center justify-center ${colorClass}`}
                  style={isSelected ? { backgroundColor: 'var(--color-brand)' } : undefined}
                >
                  {day}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-4 mb-6 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-brand)' }} /> Available</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-800" /> Unavailable</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-300" /> Past Date</span>
        </div>

        {selectedDate && (
          <div className="mb-6">
            <h2 className="font-bold text-slate-900 mb-3">Select Time</h2>
            {slots.length === 0 ? (
              <p className="text-sm text-slate-400">No times available this day.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {slots.map((t) => {
                  const selected = t === selectedTime
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSelectedTime(t)}
                      className={`py-3.5 rounded-xl text-sm font-medium border border-transparent transition-colors ${
                        selected ? 'text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                      style={selected ? { backgroundColor: 'var(--color-brand)' } : undefined}
                    >
                      {formatTimeLabel(t)}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4 leading-relaxed">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleConfirm}
          disabled={!selectedDate || !selectedTime || saving}
          className="w-full py-4 rounded-2xl text-white font-semibold text-base tracking-wide disabled:opacity-50 transition-opacity"
          style={{ backgroundColor: 'var(--color-brand)' }}
        >
          {saving ? 'Confirming…' : confirmLabel}
        </button>
      </div>
    </main>
  )
}
