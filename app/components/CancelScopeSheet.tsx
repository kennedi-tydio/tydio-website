'use client'

import { useId, useState } from 'react'
import ModalShell from './ModalShell'

// First step of canceling a visit of a recurring booking: just this visit, or the entire
// series. The caller then asks for the reason (CancelReasonSheet).
export default function CancelScopeSheet({
  visitLabel,
  onChoose,
  onClose,
}: {
  // e.g. "Sun, Nov 29 · 9:00 AM"
  visitLabel: string | null
  onChoose: (scope: 'visit' | 'series') => void
  onClose: () => void
}) {
  const ids = useId()
  const [scope, setScope] = useState<'visit' | 'series' | null>(null)
  const titleId = `${ids}-title`

  const options = [
    { id: 'visit', label: 'Just this visit', hint: visitLabel ? `${visitLabel}. The rest stay on` : 'The rest stay on' },
    { id: 'series', label: 'The entire recurring booking', hint: 'This visit and every one after it' },
  ] as const

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
        <legend className="sr-only">Cancel this visit or the entire recurring booking</legend>
        <div className="flex flex-col gap-2">
          {options.map((option) => (
            <label
              key={option.id}
              className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm cursor-pointer ${
                scope === option.id ? 'border-brand bg-brand/5 text-slate-900' : 'border-slate-200 text-slate-700'
              }`}
            >
              <input type="radio" name={`${ids}-scope`} checked={scope === option.id} onChange={() => setScope(option.id)} className="accent-brand mt-0.5" />
              <span>
                <span className="block font-semibold">{option.label}</span>
                <span className="block text-xs text-slate-500">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex gap-3 mt-5">
        <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600">
          Keep it
        </button>
        <button
          type="button"
          onClick={() => scope && onChoose(scope)}
          disabled={!scope}
          className="flex-1 py-2.5 rounded-xl bg-red-600 text-sm font-semibold text-white disabled:opacity-40"
        >
          Continue
        </button>
      </div>
    </ModalShell>
  )
}
