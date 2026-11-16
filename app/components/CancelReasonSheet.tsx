'use client'

import { useId, useState } from 'react'
import ModalShell from './ModalShell'
import { CANCEL_NOTE_MAX_LENGTH, type CancelReasonOption, type Cancellation } from '@/lib/cancellationReasons'

// Asks why before a booking is canceled: one reason from the list, plus an optional note.
// onConfirm runs the cancel and returns an error message, or null once it's done.
export default function CancelReasonSheet({
  reasons,
  warning,
  confirmLabel = 'Cancel booking',
  onConfirm,
  onClose,
}: {
  reasons: readonly CancelReasonOption[]
  warning?: string | null
  confirmLabel?: string
  onConfirm: (cancellation: Cancellation) => Promise<string | null>
  onClose: () => void
}) {
  const titleId = useId()
  const noteId = useId()
  const [reason, setReason] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    if (!reason) {
      setError('Please choose a reason for canceling.')
      return
    }
    setWorking(true)
    setError(null)
    const message = await onConfirm({ reason, note })
    setWorking(false)
    if (message) setError(message)
  }

  return (
    <ModalShell
      onClose={working ? undefined : onClose}
      labelledBy={titleId}
      panelClassName="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto text-left"
    >
      <h2 id={titleId} className="text-lg font-bold text-slate-900">
        Why are you canceling?
      </h2>
      {warning && <p className="text-xs text-slate-600 mt-1">{warning}</p>}

      <fieldset className="mt-4">
        <legend className="sr-only">Reason for canceling</legend>
        <div className="flex flex-col gap-2">
          {reasons.map((r) => (
            <label
              key={r.id}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm cursor-pointer ${
                reason === r.id ? 'border-brand bg-brand/5 text-slate-900' : 'border-slate-200 text-slate-700'
              }`}
            >
              <input
                type="radio"
                name="cancel-reason"
                value={r.id}
                checked={reason === r.id}
                onChange={() => setReason(r.id)}
                disabled={working}
                className="accent-brand"
              />
              {r.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label htmlFor={noteId} className="block text-sm font-semibold text-slate-700 mt-4 mb-1">
        Add a note <span className="font-normal text-slate-400">(optional)</span>
      </label>
      <textarea
        id={noteId}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={CANCEL_NOTE_MAX_LENGTH}
        rows={3}
        disabled={working}
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 resize-none"
      />

      {error && (
        <p role="alert" className="text-xs text-red-600 mt-2">
          {error}
        </p>
      )}

      <div className="flex gap-3 mt-4">
        <button
          type="button"
          onClick={onClose}
          disabled={working}
          className="flex-1 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600 disabled:opacity-50"
        >
          Keep it
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={working}
          className="flex-1 py-2.5 rounded-xl bg-red-600 text-sm font-semibold text-white disabled:opacity-50"
        >
          {working ? 'Canceling…' : confirmLabel}
        </button>
      </div>
    </ModalShell>
  )
}
