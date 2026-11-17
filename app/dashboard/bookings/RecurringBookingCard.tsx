'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from '@/app/components/NavigationSpinner'
import { recurrenceLabel, type RecurrenceFrequency } from '@/lib/recurrence'
import { cancelRecurringBookingAction, cancelRecurringOccurrencesAction } from './recurring/actions'
import RecurringCancelSheet, { type OccurrenceOption } from '@/app/components/RecurringCancelSheet'
import { CUSTOMER_CANCEL_REASONS } from '@/lib/cancellationReasons'

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']

export type RecurringRow = {
  id: string
  frequency: RecurrenceFrequency
  cleanerName: string
  cleanerPhotoUrl: string | null
  address: string | null
  nextDate: string
  time: string
  // Why the last visit couldn't be booked, if it couldn't.
  lastError: string | null
  // Upcoming visits, booked or not yet, to cancel one of (lib/recurringOccurrences).
  occurrences: OccurrenceOption[]
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function IconRepeat() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 014-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 01-4 4H3" />
    </svg>
  )
}

export default function RecurringBookingCard({ series }: { series: RecurringRow }) {
  const router = useRouter()
  const [cancelling, setCancelling] = useState(false)

  const next = new Date(`${series.nextDate}T00:00:00`)
  const weekday = WEEKDAYS[next.getDay()]
  // The next date to be booked, past any the customer canceled ahead of time.
  const nextUnbooked = series.occurrences.find((o) => !o.booked)?.date ?? series.nextDate
  const nextDay = new Date(`${nextUnbooked}T00:00:00`)
  const nextLabel = `${MONTHS_SHORT[nextDay.getMonth()]} ${nextDay.getDate()}`

  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm p-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold mb-2" style={{ color: 'var(--color-brand)' }}>
        <IconRepeat />
        {recurrenceLabel(series.frequency)} · {weekday} at {formatTime(series.time)}
      </p>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-200 flex-shrink-0">
          {series.cleanerPhotoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={series.cleanerPhotoUrl} alt="" className="w-full h-full object-cover" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900 truncate">{series.cleanerName}</p>
          {series.address && <p className="text-xs text-slate-400 truncate">{series.address}</p>}
        </div>
      </div>
      <p className="text-xs text-slate-500 mt-3">Next visit to be booked: {nextLabel}</p>
      {series.lastError && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mt-2 leading-relaxed">
          Your last visit couldn&apos;t be booked: {series.lastError}
        </p>
      )}

      <div className="flex flex-col gap-2 mt-4">
        <Link
          href={`/dashboard/bookings/recurring/${series.id}/tidy-pro`}
          className="w-full py-2.5 rounded-xl text-white text-sm font-semibold text-center"
          style={{ backgroundColor: 'var(--color-brand)' }}
        >
          Choose a new Tidy Pro
        </Link>
        <button
          type="button"
          onClick={() => setCancelling(true)}
          className="w-full py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-red-600"
        >
          Cancel
        </button>
      </div>
      {cancelling && (
        <RecurringCancelSheet
          occurrences={series.occurrences}
          reasons={CUSTOMER_CANCEL_REASONS}
          copy={{
            series:
              'No more visits will be booked. Visits already booked are canceled too: one you’ve paid for is refunded minus the nonrefundable Stripe fee, and one not charged yet is free.',
            bookedVisit: 'A booked visit you’ve paid for is refunded minus the nonrefundable Stripe fee, and one not charged yet is free.',
            laterVisit: 'Visits not booked yet won’t be booked, and you won’t be charged for them.',
            lateVisit: 'A visit less than 2 hours away refunds 50%.',
            rest: 'Your other visits stay on.',
          }}
          onCancelSeries={(c) => cancelRecurringBookingAction(series.id, c)}
          onCancelOccurrences={(dates, c) => cancelRecurringOccurrencesAction(series.id, dates, c)}
          onClose={() => setCancelling(false)}
          onDone={() => {
            setCancelling(false)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
