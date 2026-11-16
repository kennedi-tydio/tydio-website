'use client'

import { RECURRENCE_FREQUENCIES, recurrenceLabel, type RecurrenceFrequency } from '@/lib/recurrence'

function IconRepeat() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 014-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 01-4 4H3" />
    </svg>
  )
}

// Shown once a specific date is picked: repeat the booking on the same weekday and time.
export default function RecurringBookingOption({
  value,
  onChange,
}: {
  value: RecurrenceFrequency | null
  onChange: (value: RecurrenceFrequency | null) => void
}) {
  const on = value != null
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3.5">
      <label className="w-full flex items-center gap-2.5 cursor-pointer">
        <IconRepeat />
        <span className="text-sm text-slate-800 flex-1">Recurring booking</span>
        <input
          type="checkbox"
          role="switch"
          checked={on}
          onChange={(e) => onChange(e.target.checked ? 'weekly' : null)}
          className="sr-only peer"
        />
        <span
          aria-hidden="true"
          className="relative w-10 h-6 rounded-full transition-colors flex-shrink-0 peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2"
          style={{ backgroundColor: on ? 'var(--color-brand)' : '#cbd5e1' }}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : ''}`} />
        </span>
      </label>
      {on && (
        <div className="mt-3 pt-3 border-t border-slate-200">
          <div role="radiogroup" aria-label="How often" className="flex flex-wrap gap-2">
            {RECURRENCE_FREQUENCIES.map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={value === f}
                onClick={() => onChange(f)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                  value === f ? 'border-brand text-brand' : 'border-slate-200 text-slate-600 bg-white'
                }`}
                style={value === f ? { backgroundColor: '#e8f9fa' } : undefined}
              >
                {recurrenceLabel(f)}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            Same day of the week, time and Tidy Pro. When your Tidy Pro accepts, they&apos;re booked for every visit, and we charge your card 3 days before each one. Cancel anytime from Bookings.
          </p>
        </div>
      )}
    </div>
  )
}
