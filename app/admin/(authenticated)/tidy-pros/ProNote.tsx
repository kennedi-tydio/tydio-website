'use client'

import { useState, useTransition } from 'react'
import { saveTidyProNoteAction } from '../../actions'

// The admin's private note on a Tidy Pro. Shows the note (or "Add note"); click to
// edit, then Save. Tidy Pros and customers never see it.
export function ProNote({ proId, name, initialNote }: { proId: string; name: string; initialNote: string }) {
  const [note, setNote] = useState(initialNote)
  const [draft, setDraft] = useState(initialNote)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    setError(null)
    startTransition(async () => {
      const result = await saveTidyProNoteAction(proId, draft)
      if (result.error) {
        setError(result.error)
        return
      }
      setNote(draft.trim())
      setEditing(false)
    })
  }

  function cancel() {
    setDraft(note)
    setError(null)
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={note ? `Edit note on ${name}` : `Add a note on ${name}`}
        className="block w-56 text-left text-xs rounded-md px-1.5 py-1 -mx-1.5 hover:bg-slate-50"
      >
        {note ? <span className="whitespace-pre-wrap text-slate-700">{note}</span> : <span className="text-slate-400">+ Add note</span>}
      </button>
    )
  }

  return (
    <div className="w-56">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') cancel()
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
        }}
        autoFocus
        rows={4}
        maxLength={2000}
        aria-label={`Note on ${name}`}
        placeholder="Only admins see this"
        className="block w-full text-xs text-slate-700 border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
      />
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="text-xs font-semibold text-white bg-brand rounded-md px-2 py-0.5 disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={cancel} disabled={pending} className="text-xs text-slate-500 hover:underline">
          Cancel
        </button>
      </div>
      {error && (
        <p role="alert" className="text-[11px] text-red-600 mt-0.5">
          {error}
        </p>
      )}
    </div>
  )
}
