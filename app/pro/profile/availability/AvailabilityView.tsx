'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from '@/app/components/NavigationSpinner'
import { addTimeOffAction, removeTimeOffAction, saveAvailabilityAction, setAwayAction } from './actions'
import { WEEKDAY_KEYS, type WeekdayKey, type WeeklyAvailability } from '@/lib/cleanerMatching'
import TimeSelect from '@/app/components/form/TimeSelect'
import type { TimeOffRange } from '@/lib/timeOff'

const DAY_LABELS: Record<WeekdayKey, string> = {
  sun: 'Sun',
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
}

const DEFAULT_RANGE = { start: '09:00', end: '17:00' }

function IconPlus() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="1.5">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" strokeLinecap="round" />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatDate(iso: string, withYear: boolean): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${MONTHS_SHORT[m - 1]} ${d}${withYear ? `, ${y}` : ''}`
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function formatRange(range: TimeOffRange): string {
  const sameYear = range.start.slice(0, 4) === range.end.slice(0, 4)
  if (range.startTime && range.endTime) {
    if (range.start === range.end) return `${formatDate(range.start, true)}, ${formatTime(range.startTime)} – ${formatTime(range.endTime)}`
    return `${formatDate(range.start, !sameYear)}, ${formatTime(range.startTime)} – ${formatDate(range.end, true)}, ${formatTime(range.endTime)}`
  }
  const days = range.start === range.end ? formatDate(range.start, true) : `${formatDate(range.start, !sameYear)} – ${formatDate(range.end, true)}`
  return `${days} (all day)`
}

export default function AvailabilityView({
  initialAvailability,
  initialAway,
  initialTimeOff,
  todayISO,
}: {
  initialAvailability: WeeklyAvailability
  initialAway: boolean
  initialTimeOff: TimeOffRange[]
  todayISO: string
}) {
  const router = useRouter()
  const [availability, setAvailability] = useState<WeeklyAvailability>(initialAvailability)
  const [away, setAway] = useState(initialAway)
  const [savingAway, setSavingAway] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [timeOff, setTimeOff] = useState<TimeOffRange[]>(initialTimeOff)
  const [offStart, setOffStart] = useState('')
  const [offEnd, setOffEnd] = useState('')
  const [offAllDay, setOffAllDay] = useState(true)
  const [offStartTime, setOffStartTime] = useState('09:00')
  const [offEndTime, setOffEndTime] = useState('17:00')
  const [savingTimeOff, setSavingTimeOff] = useState(false)
  const [timeOffError, setTimeOffError] = useState<string | null>(null)
  const [timeOffNotice, setTimeOffNotice] = useState<string | null>(null)

  async function handleAddTimeOff() {
    if (!offStart) {
      setTimeOffError('Please choose a date.')
      return
    }
    setSavingTimeOff(true)
    setTimeOffError(null)
    setTimeOffNotice(null)
    const result = await addTimeOffAction({
      start: offStart,
      end: offEnd || undefined,
      ...(offAllDay ? {} : { startTime: offStartTime, endTime: offEndTime }),
    })
    setSavingTimeOff(false)
    if ('error' in result) {
      setTimeOffError(result.error)
      return
    }
    setTimeOff(result.timeOff)
    setOffStart('')
    setOffEnd('')
    setOffAllDay(true)
    if (result.conflicts > 0) {
      setTimeOffNotice(
        `You already have ${result.conflicts === 1 ? 'a booking or request' : `${result.conflicts} bookings or requests`} on ${result.conflicts === 1 ? 'that date' : 'those dates'}. Time off only stops new bookings, so check your Messages and Bookings.`
      )
    }
  }

  async function handleRemoveTimeOff(range: TimeOffRange) {
    setSavingTimeOff(true)
    setTimeOffError(null)
    setTimeOffNotice(null)
    const result = await removeTimeOffAction(range)
    setSavingTimeOff(false)
    if ('error' in result) {
      setTimeOffError(result.error)
      return
    }
    setTimeOff(result.timeOff)
  }

  async function handleToggleAway() {
    const next = !away
    setAway(next)
    setSavingAway(true)
    setError(null)
    const result = await setAwayAction(next)
    setSavingAway(false)
    if ('error' in result) {
      setAway(!next)
      setError(result.error)
    }
  }

  function addRange(day: WeekdayKey) {
    setAvailability((prev) => ({ ...prev, [day]: [...(prev[day] ?? []), { ...DEFAULT_RANGE }] }))
  }

  function removeRange(day: WeekdayKey, index: number) {
    setAvailability((prev) => {
      const remaining = (prev[day] ?? []).filter((_, i) => i !== index)
      const next = { ...prev }
      if (remaining.length === 0) delete next[day]
      else next[day] = remaining
      return next
    })
  }

  function updateRange(day: WeekdayKey, index: number, field: 'start' | 'end', value: string) {
    setAvailability((prev) => ({
      ...prev,
      [day]: (prev[day] ?? []).map((r, i) => (i === index ? { ...r, [field]: value } : r)),
    }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const result = await saveAvailabilityAction(availability)
    setSaving(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    router.push('/pro/profile')
  }

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-10 pb-16 max-w-sm mx-auto w-full">
        <Link href="/pro/profile" aria-label="Back to Profile" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-2 mb-4">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>

        <h1 className="text-3xl font-bold text-slate-900 mb-6">Availability</h1>

        <div className="rounded-2xl border border-slate-100 shadow-sm px-4 py-4 mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p id="away-label" className="text-sm font-bold text-slate-900">Away</p>
            <p id="away-description" className="text-xs text-slate-500 leading-relaxed mt-1">
              This marks you away for services. You won&apos;t be able to receive bookings until you turn this back off.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={away}
            aria-labelledby="away-label"
            aria-describedby="away-description"
            onClick={handleToggleAway}
            disabled={savingAway}
            className="relative w-11 h-6 rounded-full flex-shrink-0 transition-colors disabled:opacity-60"
            style={{ backgroundColor: away ? 'var(--color-brand)' : '#cbd5e1' }}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${away ? 'translate-x-5' : ''}`}
            />
          </button>
        </div>

        <div className="flex flex-col gap-4 mb-8">
          {WEEKDAY_KEYS.map((day) => {
            const ranges = availability[day] ?? []
            return (
              <div key={day} className="flex items-start gap-3">
                <span className="w-9 pt-3 text-sm font-semibold text-slate-900 flex-shrink-0">{DAY_LABELS[day]}</span>
                <div className="flex-1 flex flex-col gap-2 min-w-0">
                  {ranges.length === 0 ? (
                    <div className="flex items-center gap-2">
                      <span className="flex-1 py-3 text-sm text-slate-400">Unavailable</span>
                      <button
                        type="button"
                        onClick={() => addRange(day)}
                        aria-label={`Add availability for ${DAY_LABELS[day]}`}
                        className="w-8 h-8 flex-shrink-0 flex items-center justify-center"
                      >
                        <IconPlus />
                      </button>
                    </div>
                  ) : (
                    ranges.map((range, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <TimeSelect
                          value={range.start}
                          onChange={(v) => updateRange(day, i, 'start', v)}
                          className="flex-1 min-w-0"
                          ariaLabel={`${DAY_LABELS[day]} start time`}
                        />
                        <span className="text-slate-400 flex-shrink-0">–</span>
                        <TimeSelect
                          value={range.end}
                          onChange={(v) => updateRange(day, i, 'end', v)}
                          className="flex-1 min-w-0"
                          ariaLabel={`${DAY_LABELS[day]} end time`}
                        />
                        {i === ranges.length - 1 ? (
                          <button
                            type="button"
                            onClick={() => addRange(day)}
                            aria-label={`Add another time range for ${DAY_LABELS[day]}`}
                            className="w-8 h-8 flex-shrink-0 flex items-center justify-center"
                          >
                            <IconPlus />
                          </button>
                        ) : (
                          <span className="w-8 flex-shrink-0" />
                        )}
                        <button
                          type="button"
                          onClick={() => removeRange(day, i)}
                          aria-label={`Remove time range for ${DAY_LABELS[day]}`}
                          className="w-8 h-8 flex-shrink-0 flex items-center justify-center text-slate-300 hover:text-red-500"
                        >
                          <IconTrash />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <section aria-labelledby="time-off-heading" className="mb-8">
          <h2 id="time-off-heading" className="text-lg font-bold text-slate-900">Time off</h2>
          <p className="text-xs text-slate-500 leading-relaxed mt-1 mb-4">
            Pick a day, or a start and end date, that you can&apos;t work. Leave &quot;All day&quot; checked, or uncheck it to set the hours you&apos;re
            off. Customers won&apos;t be able to book you during that time.
          </p>

          <div className="grid grid-cols-2 gap-2 mb-2">
            <label className="flex flex-col gap-1 min-w-0">
              <span className="text-xs font-semibold text-slate-700">From</span>
              <input
                type="date"
                value={offStart}
                min={todayISO}
                onChange={(e) => {
                  setOffStart(e.target.value)
                  if (offEnd && e.target.value > offEnd) setOffEnd('')
                }}
                className="w-full min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900"
              />
            </label>
            <label className="flex flex-col gap-1 min-w-0">
              <span className="text-xs font-semibold text-slate-700">To <span className="font-normal text-slate-400">(optional)</span></span>
              <input
                type="date"
                value={offEnd}
                min={offStart || todayISO}
                onChange={(e) => setOffEnd(e.target.value)}
                className="w-full min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900"
              />
            </label>
          </div>
          <label className="flex items-center gap-2.5 text-sm text-slate-700 mb-2 cursor-pointer">
            <input type="checkbox" checked={offAllDay} onChange={(e) => setOffAllDay(e.target.checked)} />
            All day
          </label>
          {!offAllDay && (
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-xs font-semibold text-slate-700">Start time</span>
                <TimeSelect value={offStartTime} onChange={setOffStartTime} className="w-full min-w-0" ariaLabel="Time off start time" />
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-xs font-semibold text-slate-700">End time</span>
                <TimeSelect value={offEndTime} onChange={setOffEndTime} className="w-full min-w-0" ariaLabel="Time off end time" />
              </div>
              {offEnd && offEnd !== offStart && (
                <p className="col-span-2 text-xs text-slate-400 leading-relaxed">
                  From the start time on the first day to the end time on the last day.
                </p>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={handleAddTimeOff}
            disabled={savingTimeOff || !offStart}
            className="w-full py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {savingTimeOff ? 'Saving…' : 'Add time off'}
          </button>

          {timeOffError && (
            <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mt-3 leading-relaxed">
              {timeOffError}
            </p>
          )}
          {timeOffNotice && (
            <p role="status" className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mt-3 leading-relaxed">
              {timeOffNotice}
            </p>
          )}

          {timeOff.length > 0 ? (
            <ul className="mt-4 rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-100">
              {timeOff.map((range) => (
                <li key={`${range.start}_${range.end}_${range.startTime ?? ''}_${range.endTime ?? ''}`} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-sm text-slate-900">{formatRange(range)}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTimeOff(range)}
                    disabled={savingTimeOff}
                    aria-label={`Remove time off ${formatRange(range)}`}
                    className="w-8 h-8 flex-shrink-0 flex items-center justify-center text-slate-300 hover:text-red-500 disabled:opacity-50"
                  >
                    <IconTrash />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-slate-400">No time off scheduled.</p>
          )}
        </section>

        {error && (
          <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4 leading-relaxed">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => router.push('/pro/profile')}
            disabled={saving}
            className="w-full py-3.5 rounded-xl bg-slate-100 text-sm font-semibold text-slate-500 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-opacity"
            style={{ backgroundColor: 'var(--color-brand)' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </main>
  )
}
