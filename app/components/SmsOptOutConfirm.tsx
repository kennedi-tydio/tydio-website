'use client'

type Props = {
  titleId?: string
  working?: boolean
  // Yes = go ahead and opt out of texts. No = send text updates after all.
  onConfirm: () => void
  onCancel: () => void
}

// Second step shown when a customer chooses to opt out of text messages.
export default function SmsOptOutConfirm({ titleId, working, onConfirm, onCancel }: Props) {
  return (
    <>
      <h2 id={titleId} className="text-lg font-bold text-slate-900 mb-1">Are you sure?</h2>
      <p className="text-sm text-slate-600 mb-4 leading-relaxed">
        Text messages help you receive updates about your bookings, like confirmations, changes, and reminders, so you
        don&apos;t miss them. Do you still want to opt out of texts?
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={working}
          className="flex-1 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600 disabled:opacity-50"
        >
          No, send me text updates
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={working}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-brand)' }}
        >
          {working ? 'Saving…' : "Yes, I don't want texts"}
        </button>
      </div>
    </>
  )
}
