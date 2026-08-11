'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { saveAvailabilityAction } from './actions'
import { WEEKDAY_KEYS, type WeekdayKey, type WeeklyAvailability } from '@/lib/cleanerMatching'
import TimeSelect from '@/app/components/form/TimeSelect'

const DAY_LABELS: Record<WeekdayKey, string> = {
  sun: 'Sun',
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
}

const DEFAULT_RANGE = { start: '09:00', end: '15:00' }

function IconPlus() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
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

export default function AvailabilityView({ initialAvailability }: { initialAvailability: WeeklyAvailability }) {
  const router = useRouter()
  const [availability, setAvailability] = useState<WeeklyAvailability>(initialAvailability)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-10 pb-16 max-w-sm mx-auto w-full">
        <Link href="/pro/profile" aria-label="Back to Profile" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-2 mb-4">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>

        <h1 className="text-3xl font-bold text-slate-900 mb-6">Availability</h1>

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

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4 leading-relaxed">
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
            style={{ backgroundColor: '#38C7CA' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
