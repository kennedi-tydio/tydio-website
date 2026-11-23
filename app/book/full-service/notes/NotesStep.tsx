'use client'

import { useState, useTransition } from 'react'
import { useRouter } from '@/app/components/NavigationSpinner'
import { NOTES_COPY, type FullServiceSelection } from '@/lib/fullService'
import { updateDraftDetailsAction } from '@/app/book/review/actions'
import WizardFrame from '../WizardFrame'
import { saveFullServiceStepAction } from '../actions'

// The booking's one notes field: the same one the review page shows, which the
// Tidy Pro sees on the request and on arrival.
const MAX_NOTES = 1000

export default function NotesStep({
  draftId,
  selection,
  initialNotes,
}: {
  draftId: string
  selection: FullServiceSelection
  initialNotes: string
}) {
  const router = useRouter()
  const [notes, setNotes] = useState(initialNotes)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleContinue() {
    setError(null)
    startTransition(async () => {
      await updateDraftDetailsAction(draftId, { notes: notes.trim() })
      const result = await saveFullServiceStepAction({}, 'notes')
      if (result.error) setError(result.error)
      else router.push('/book')
    })
  }

  return (
    <WizardFrame
      type={selection.type}
      step="notes"
      backHref="/book/full-service/tasks"
      title={NOTES_COPY.title}
      description={NOTES_COPY.body}
      onContinue={handleContinue}
      continueLabel="Review booking"
      pending={pending}
      error={error}
    >
      <label className="block">
        <span className="sr-only">Notes for your Tidy Pro (optional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, MAX_NOTES))}
          rows={6}
          placeholder="For example: please use the products under the sink, and the cat hides in the guest room."
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand resize-none"
        />
      </label>
      <p className="text-xs text-slate-400 text-right mt-1">
        Optional · {notes.length}/{MAX_NOTES}
      </p>
      <p className="text-xs text-slate-500 leading-relaxed mt-3">
        Notes help your Tidy Pro with the services you&apos;ve chosen. They can&apos;t add work: anything extra needs to be
        an add-on or a Tidy Task, so your Tidy Pro is paid for it.
      </p>
    </WizardFrame>
  )
}
