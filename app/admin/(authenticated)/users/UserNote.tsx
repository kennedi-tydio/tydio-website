'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { saveUserNoteAction } from '../../actions'

// The admin's private note on a user. Save appears once the text changes, and the
// note only counts as saved once the server confirms it.
export function UserNote({ profileId, name, note }: { profileId: string; name: string; note: string }) {
  const [state, action, pending] = useActionState(saveUserNoteAction.bind(null, profileId), {})
  const [saved, setSaved] = useState(note)
  const [draft, setDraft] = useState(note)
  const submitted = useRef(note)

  useEffect(() => {
    if (state.message) setSaved(submitted.current)
  }, [state])

  const changed = draft.trim() !== saved.trim()

  return (
    <form
      action={action}
      onSubmit={() => {
        submitted.current = draft
      }}
      className="min-w-56"
    >
      <textarea
        name="note"
        aria-label={`Note on ${name}`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        maxLength={2000}
        rows={2}
        placeholder="Add a note…"
        className="w-full text-xs text-slate-600 px-2 py-1.5 rounded-lg border border-slate-200 resize-y focus:outline-none focus:border-brand"
      />
      <div className="flex items-center gap-2 min-h-5">
        {changed && (
          <button
            type="submit"
            disabled={pending}
            className="text-xs font-semibold px-2 py-0.5 rounded-lg text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-brand)' }}
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
