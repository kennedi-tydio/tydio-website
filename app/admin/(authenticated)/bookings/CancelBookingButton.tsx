'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { cancelBookingAction, type CancelBookingState } from '../../actions'

// max is what the customer paid, the most a custom refund can be.
export type RefundOption = { value: 'full' | 'minus_fee' | 'half' | 'custom' | 'none'; label: string; max?: number }

const BUTTON =
  'text-xs font-semibold px-2.5 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

// Choosing a refund cancels straight away, once confirmed. No refund first asks for the
// reason, which the customer is emailed, and a custom refund first asks for the amount.
// With no payment on file there's nothing to refund, so it's a plain Cancel button.
function Controls({ options, confirmMessage }: { options: RefundOption[]; confirmMessage: (option?: RefundOption) => string }) {
  const { pending } = useFormStatus()
  const [askingReason, setAskingReason] = useState(false)
  const [askingAmount, setAskingAmount] = useState(false)
  const none = options.find((o) => o.value === 'none')
  const custom = options.find((o) => o.value === 'custom')

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

  if (askingAmount && custom) {
    return (
      <div className="flex flex-col items-end gap-1.5 w-64">
        <input type="hidden" name="refund" value="custom" />
        <label className="flex items-center gap-1 w-full text-xs text-slate-600">
          <span>Refund $</span>
          <input
            name="amount"
            type="number"
            inputMode="decimal"
            required
            min="0.01"
            step="0.01"
            max={custom.max}
            autoFocus
            aria-label="Refund amount in dollars"
            className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700"
          />
        </label>
        {custom.max != null && <span className="text-[11px] text-slate-400">Up to ${custom.max.toFixed(2)}, what the customer paid</span>}
        <textarea
          name="reason"
          rows={2}
          maxLength={1000}
          aria-label="Reason (optional)"
          placeholder="Reason (optional). This is emailed to the customer."
          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700"
        />
        <div className="flex gap-2">
          <button type="button" onClick={() => setAskingAmount(false)} className="text-xs text-slate-400 hover:text-slate-600 px-2">
            Back
          </button>
          <button
            type="submit"
            className={BUTTON}
            onClick={(e) => {
              const amount = e.currentTarget.form?.elements.namedItem('amount')
              // Let the browser flag a missing or out-of-range amount itself.
              if (!(amount instanceof HTMLInputElement) || !amount.checkValidity()) return
              const label = `a refund of $${Number(amount.value).toFixed(2)}`
              if (!window.confirm(confirmMessage({ ...custom, label }))) e.preventDefault()
            }}
          >
            Cancel and refund
          </button>
        </div>
      </div>
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
        } else if (option?.value === 'custom') {
          setAskingAmount(true)
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
