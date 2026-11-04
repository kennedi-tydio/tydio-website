'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { cancelBookingAction, type CancelBookingState } from '../../actions'

export type RefundOption = { value: 'full' | 'minus_fee' | 'half' | 'none'; label: string }

const BUTTON =
  'text-xs font-semibold px-2.5 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

// Choosing a refund cancels straight away, once confirmed. No refund first asks for the
// reason, which the customer is emailed. With no payment on file there's nothing to
// refund, so it's a plain Cancel button.
function Controls({ options, confirmMessage }: { options: RefundOption[]; confirmMessage: (option?: RefundOption) => string }) {
  const { pending } = useFormStatus()
  const [askingReason, setAskingReason] = useState(false)
  const none = options.find((o) => o.value === 'none')

  if (pending) return <span className="text-xs text-slate-400">Canceling…</span>

  if (options.length === 0) {
    return (
      <>
        <input type="hidden" name="refund" value="none" />
        <button type="submit" className={BUTTON} onClick={(e) => !window.confirm(confirmMessage()) && e.preventDefault()}>
          Cancel
        </button>
      </>
    )
  }

  if (askingReason) {
    return (
      <div className="flex flex-col items-end gap-1.5 w-64">
        <input type="hidden" name="refund" value="none" />
        <textarea
          name="reason"
          required
          rows={3}
          maxLength={1000}
          autoFocus
          aria-label="Reason for no refund"
          placeholder="Why isn't the customer being refunded? This is emailed to them."
          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700"
        />
        <div className="flex gap-2">
          <button type="button" onClick={() => setAskingReason(false)} className="text-xs text-slate-400 hover:text-slate-600 px-2">
            Back
          </button>
          <button
            type="submit"
            className={BUTTON}
            onClick={(e) => {
              const reason = e.currentTarget.form?.elements.namedItem('reason')
              // Let the browser flag an empty reason itself.
              if (reason instanceof HTMLTextAreaElement && !reason.value.trim()) {
                reason.value = ''
                return
              }
              if (!window.confirm(confirmMessage(none))) e.preventDefault()
            }}
          >
            Cancel without refund
          </button>
        </div>
      </div>
    )
  }

  return (
    <select
      name="refund"
      defaultValue=""
      aria-label="Cancel with refund"
      onChange={(e) => {
        const select = e.currentTarget
        const option = options.find((o) => o.value === select.value)
        if (option?.value === 'none') {
          setAskingReason(true)
        } else if (option && window.confirm(confirmMessage(option))) {
          select.form?.requestSubmit()
        }
        // The form data is read as it submits, so this can go back to the prompt now,
        // ready for another try if the cancel fails.
        select.value = ''
      }}
      className="text-xs border border-red-200 rounded-lg px-2 py-1 bg-white text-red-600"
    >
      <option value="" disabled>
        Cancel with…
      </option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

export default function CancelBookingButton({
  bookingId,
  scope,
  warning,
  options,
}: {
  bookingId: string
  scope: string
  warning: string
  options: RefundOption[]
}) {
  const [state, formAction] = useActionState<CancelBookingState, FormData>(cancelBookingAction.bind(null, bookingId), {})

  if (state.message) return <span role="status" className="text-xs text-green-700">{state.message}</span>

  const confirmMessage = (option?: RefundOption) =>
    `Cancel ${scope}? ${option ? `The customer gets: ${option.label}.` : 'There’s no payment to refund.'} The customer is emailed and the cleaner is notified; the cleaner isn’t paid.${warning} This can’t be undone.`

  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <Controls options={options} confirmMessage={confirmMessage} />
      {state.error && <span role="alert" className="text-xs text-red-600 max-w-48 text-right">{state.error}</span>}
    </form>
  )
}
