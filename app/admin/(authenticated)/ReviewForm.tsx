'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import type { AccountActionState } from '../actions'

type Review = { resolved: boolean; note: string }

// The Resolved checkbox and admin notes on a cancellation or report. Save appears once
// either changes, and the change only counts as saved once the server confirms it.
export default function ReviewForm({
  action: saveAction,
  label,
  resolved,
  note,
}: {
  action: (prev: AccountActionState, formData: FormData) => Promise<AccountActionState>
  label: string
  resolved: boolean
  note: string
}) {
  const [state, action, pending] = useActionState(saveAction, {})
  const [saved, setSaved] = useState<Review>({ resolved, note })
  const [draft, setDraft] = useState<Review>({ resolved, note })
  const submitted = useRef<Review>(draft)

  useEffect(() => {
    if (state.message) setSaved(submitted.current)
  }, [state])

  const changed = draft.resolved !== saved.resolved || draft.note.trim() !== saved.note.trim()

  return (
    <form
      action={action}
      onSubmit={() => {
        submitted.current = draft
      }}
      className="min-w-56"
    >
      <label className="flex items-center gap-2 text-xs font-medium text-slate-600 mb-1.5 cursor-pointer">
        <input
          type="checkbox"
          name="resolved"
          checked={draft.resolved}
          onChange={(event) => setDraft({ ...draft, resolved: event.target.checked })}
          className="h-4 w-4 accent-brand"
        />
        Resolved
      </label>
      <textarea
        name="note"
        aria-label={`Notes on ${label}`}
        value={draft.note}
        onChange={(event) => setDraft({ ...draft, note: event.target.value })}
        maxLength={2000}
        rows={2}
        placeholder="Add notes…"
        className="w-full text-xs text-slate-600 px-2 py-1.5 rounded-lg border border-slate-200 resize-y focus:outline-none focus:border-brand"
      />
      <div className="flex items-center gap-2 min-h-5">
        {changed && (
          <button
            type="submit"
            disabled={pending}
            className="text-xs font-semibold px-2 py-0.5 rounded-lg text-white bg-brand disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
        )}
        {!changed && !pending && state.message && <p role="status" className="text-xs text-green-600">{state.message}</p>}
        {state.error && <p role="alert" className="text-xs text-red-600">{state.error}</p>}
      </div>
    </form>
  )
}
