'use client'

import { useState } from 'react'
import { useRouter } from '@/app/components/NavigationSpinner'
import RecurringCancelSheet, { type OccurrenceOption } from '@/app/components/RecurringCancelSheet'
import { CLEANER_CANCEL_REASONS } from '@/lib/cancellationReasons'
import { cancelOccurrencesAsTidyProAction, cancelSeriesAsTidyProAction } from './recurring/actions'

// A recurring booking the Tidy Pro has accepted, on their Jobs tab: when it repeats, for
// whom, and Cancel (the whole series or one visit).
export type ProRecurringRow = {
  id: string
  customerName: string
  // e.g. "Every Sunday at 9:00 AM", in the Tidy Pro's time zone.
  schedule: string
  address: string | null
  occurrences: OccurrenceOption[]
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

export default function ProRecurringCard({ series }: { series: ProRecurringRow }) {
  const router = useRouter()
  const [cancelling, setCancelling] = useState(false)
  const firstName = series.customerName.split(' ')[0]

  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm p-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold mb-1.5" style={{ color: 'var(--color-brand)' }}>
        <IconRepeat />
        {series.schedule}
      </p>
      <p className="text-sm font-bold text-slate-900 truncate">{series.customerName}</p>
      {series.address && <p className="text-xs text-slate-400 truncate">{series.address}</p>}
      <button
        type="button"
        onClick={() => setCancelling(true)}
        className="w-full mt-3 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-red-600"
      >
        Cancel
      </button>
      {cancelling && (
        <RecurringCancelSheet
          occurrences={series.occurrences}
          reasons={CLEANER_CANCEL_REASONS}
          copy={{
            series: `You'll stop getting ${firstName}'s visits, and every visit already on your schedule is canceled. ${firstName} will be refunded and asked to choose another Tidy Pro.`,
            bookedVisit: `For a booked visit, ${firstName} is refunded in full and can choose another Tidy Pro for that day.`,
            laterVisit: `Visits not booked yet won't be booked, so ${firstName} isn't charged for them.`,
            rest: 'Their other visits stay with you.',
          }}
          onCancelSeries={(c) => cancelSeriesAsTidyProAction(series.id, c)}
          onCancelOccurrences={(dates, c) => cancelOccurrencesAsTidyProAction(series.id, dates, c)}
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
