'use client'

import { useState } from 'react'

type Props = {
  titleId?: string
  working?: boolean
  error?: string | null
  // Yes = go ahead and opt out of texts. No = send text updates after all.
  onConfirm: () => void
  onCancel: () => void
}

// Second step shown when a customer chooses to opt out of text messages.
export default function SmsOptOutConfirm({ titleId, working, error, onConfirm, onCancel }: Props) {
  // Either button saves, so "Saving…" goes on the one that was tapped.
  const [tapped, setTapped] = useState<'optIn' | 'optOut' | null>(null)

  return (
    <>
      <h2 id={titleId} className="text-lg font-bold text-slate-900 mb-1">Are you sure?</h2>
      <p className="text-sm text-slate-600 mb-4 leading-relaxed">
        Text messages help you receive updates about your bookings, like confirmations, changes, and reminders, so you
        don&apos;t miss them. Do you still want to opt out of texts?
      </p>
      {error && <p role="alert" className="text-xs text-red-600 mb-3">{error}</p>}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => {
            setTapped('optIn')
            onCancel()
          }}
          disabled={working}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-brand)' }}
        >
          {working && tapped === 'optIn' ? 'Saving…' : 'No, send me text updates'}
        </button>
        <button
          type="button"
          onClick={() => {
            setTapped('optOut')
            onConfirm()
          }}
          disabled={working}
          className="flex-1 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600 disabled:opacity-50"
        >
          {working && tapped === 'optOut' ? 'Saving…' : "Yes, I don't want texts"}
        </button>
      </div>
    </>
  )
}
