'use client'

import { useId, useState } from 'react'
import ModalShell from './ModalShell'
import CancelReasonSheet from './CancelReasonSheet'
import type { Cancellation, CancelReasonOption } from '@/lib/cancellationReasons'
import { occurrenceLabel } from '@/lib/recurrence'

// Canceling a recurring booking from the Bookings / Jobs tab, for the customer or the Tidy
// Pro: the whole series, or one visit picked from the list of upcoming ones. Then the usual
// reason sheet. The rules for each side are spelled out in `copy`.

export type OccurrenceOption = {
  date: string
  time: string
  // Already booked (otherwise canceling it just skips the date).
  booked: boolean
  // Booked and less than 2 hours away (customer refunds drop to 50%).
  late: boolean
  // Shown instead of date and time, e.g. in the viewer's own time zone.
  label?: string
}

export type RecurringCancelCopy = {
  series: string
  bookedVisit: string
  laterVisit: string
  lateVisit?: string
  // Ends the note when only some visits are canceled, e.g. "Your other visits stay on."
  rest: string
}

export default function RecurringCancelSheet({
  occurrences,
  reasons,
  copy,
  onCancelSeries,
  onCancelOccurrences,
  onClose,
  onDone,
}: {
  occurrences: OccurrenceOption[]
  reasons: readonly CancelReasonOption[]
  copy: RecurringCancelCopy
  onCancelSeries: (cancellation: Cancellation) => Promise<{ success: true } | { error: string }>
  // Any of the upcoming visits, e.g. the 3rd and 5th.
  onCancelOccurrences: (dates: string[], cancellation: Cancellation) => Promise<{ success: true } | { error: string }>
  onClose: () => void
  onDone: () => void
}) {
  const ids = useId()
  const [scope, setScope] = useState<'series' | 'some' | null>(null)
  const [dates, setDates] = useState<string[]>([])
  const [askingReason, setAskingReason] = useState(false)

  const picked = occurrences.filter((o) => dates.includes(o.date))
  const canContinue = scope === 'series' || (scope === 'some' && picked.length > 0)

  function toggle(date: string) {
    setDates((prev) => (prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date]))
  }

  if (askingReason && scope) {
    // One line per kind of visit picked, so each rule is said once.
    const notes = [
      picked.some((o) => o.late) && copy.lateVisit ? copy.lateVisit : null,
      picked.some((o) => o.booked && !(o.late && copy.lateVisit)) ? copy.bookedVisit : null,
      picked.some((o) => !o.booked) ? copy.laterVisit : null,
    ].filter(Boolean)
    const warning =
      scope === 'series'
        ? copy.series
        : `${picked.map((o) => o.label ?? occurrenceLabel(o.date, o.time)).join('; ')}. ${[...notes, copy.rest].join(' ')}`
    return (
      <CancelReasonSheet
        reasons={reasons}
        warning={warning}
        confirmLabel={scope === 'series' ? 'Cancel recurring booking' : picked.length > 1 ? `Cancel ${picked.length} visits` : 'Cancel this visit'}
        onClose={() => setAskingReason(false)}
        onConfirm={async (cancellation) => {
          const result = scope === 'series' ? await onCancelSeries(cancellation) : await onCancelOccurrences(picked.map((o) => o.date), cancellation)
          if ('error' in result) return result.error
          onDone()
          return null
        }}
      />
    )
  }

  const titleId = `${ids}-title`
  return (
    <ModalShell
      onClose={onClose}
      labelledBy={titleId}
      panelClassName="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl p-5 max-h-[90dvh] overflow-y-auto text-left"
    >
      <h2 id={titleId} className="text-lg font-bold text-slate-900">
        What do you want to cancel?
      </h2>

      <fieldset className="mt-4">
        <legend className="sr-only">Cancel the series or one visit</legend>
        <div className="flex flex-col gap-2">
          {(
            [
              { id: 'series', label: 'The whole recurring booking', hint: 'Every visit from now on' },
              { id: 'some', label: 'Specific visits', hint: 'Choose one or more. The rest stay on' },
            ] as const
          ).map((option) => (
            <label
              key={option.id}
              className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm cursor-pointer ${
                scope === option.id ? 'border-brand bg-brand/5 text-slate-900' : 'border-slate-200 text-slate-700'
              }`}
            >
              <input
                type="radio"
                name={`${ids}-scope`}
                checked={scope === option.id}
                onChange={() => setScope(option.id)}
                className="accent-brand mt-0.5"
              />
              <span>
                <span className="block font-semibold">{option.label}</span>
                <span className="block text-xs text-slate-500">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {scope === 'some' && (
        <fieldset className="mt-4">
          <legend className="block text-xs font-semibold text-slate-700 mb-1.5">Which visits?</legend>
          {occurrences.length === 0 ? (
            <p className="text-xs text-slate-500">There are no upcoming visits to cancel.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {occurrences.map((o) => (
                <label
                  key={o.date}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm cursor-pointer ${
                    dates.includes(o.date) ? 'border-brand bg-brand/5 text-slate-900' : 'border-slate-200 text-slate-700'
                  }`}
                >
                  <input type="checkbox" checked={dates.includes(o.date)} onChange={() => toggle(o.date)} className="accent-brand" />
                  <span className="flex-1">{o.label ?? occurrenceLabel(o.date, o.time)}</span>
                  <span className={`text-[11px] font-semibold ${o.booked ? 'text-brand' : 'text-slate-400'}`}>{o.booked ? 'Booked' : 'Not booked yet'}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
      )}

      <div className="flex gap-3 mt-5">
        <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600">
          Keep it
        </button>
        <button
          type="button"
          onClick={() => setAskingReason(true)}
          disabled={!canContinue}
          className="flex-1 py-2.5 rounded-xl bg-red-600 text-sm font-semibold text-white disabled:opacity-40"
        >
          Continue
        </button>
      </div>
    </ModalShell>
  )
}
