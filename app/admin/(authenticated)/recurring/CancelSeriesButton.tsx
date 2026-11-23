'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { cancelRecurringSeriesAction, type CancelBookingState } from '../../actions'

const BUTTON =
  'text-xs font-semibold px-2.5 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

const REFUNDS = [
  { value: 'full', label: 'Full refund, Stripe fee included' },
  { value: 'minus_fee', label: 'Refund minus the Stripe fee' },
  { value: 'none', label: 'No refund' },
] as const

function Submit({ label, confirmMessage }: { label: string; confirmMessage: () => string }) {
  const { pending } = useFormStatus()
  if (pending) return <span className="text-xs text-slate-400">Canceling…</span>
  return (
    <button type="submit" className={BUTTON} onClick={(e) => !window.confirm(confirmMessage()) && e.preventDefault()}>
      {label}
    </button>
  )
}

// Cancels the whole series: no more visits are booked, and every visit already booked
// that hasn't started is canceled with the refund chosen here (where it was charged).
// `paidVisits` is how many booked visits have been charged, so there's something to refund.
export default function CancelSeriesButton({ seriesId, bookedVisits, paidVisits }: { seriesId: string; bookedVisits: number; paidVisits: number }) {
  const [state, formAction] = useActionState<CancelBookingState, FormData>(cancelRecurringSeriesAction.bind(null, seriesId), {})
  const [open, setOpen] = useState(false)
  const [refund, setRefund] = useState<(typeof REFUNDS)[number]['value']>('full')

  if (state.message) return <span role="status" className="text-xs text-green-700 max-w-56 text-right block">{state.message}</span>

  if (!open) {
    return (
      <button type="button" className={BUTTON} onClick={() => setOpen(true)}>
        Cancel series
      </button>
    )
  }

  const visitsText = bookedVisits
    ? ` ${bookedVisits} visit${bookedVisits === 1 ? '' : 's'} already booked will be canceled too${paidVisits ? `, and the ${paidVisits} charged get: ${REFUNDS.find((r) => r.value === refund)!.label}` : ' (none charged yet)'}.`
    : ''
  const confirmMessage = () =>
    `Cancel this whole recurring booking? No more visits will be booked.${visitsText} The customer and Tidy Pro are notified. This can’t be undone.`

  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1.5 w-64">
      {paidVisits > 0 ? (
        <select
          name="refund"
          value={refund}
          onChange={(e) => setRefund(e.target.value as typeof refund)}
          aria-label="Refund for charged visits"
          className="w-full text-xs border border-red-200 rounded-lg px-2 py-1 bg-white text-red-600"
        >
          {REFUNDS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      ) : (
        <input type="hidden" name="refund" value="none" />
      )}
      {paidVisits > 0 && (
        <textarea
          name="reason"
          required={refund === 'none'}
          rows={2}
          maxLength={1000}
          aria-label={refund === 'none' ? 'Reason for no refund' : 'Reason (optional)'}
          placeholder={refund === 'none' ? 'Why isn’t the customer being refunded? This is emailed to them.' : 'Reason (optional). This is emailed to the customer.'}
          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700"
        />
      )}
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:text-slate-600 px-2">
          Back
        </button>
        <Submit label="Cancel series" confirmMessage={confirmMessage} />
      </div>
      {state.error && <span role="alert" className="text-xs text-red-600 text-right">{state.error}</span>}
    </form>
  )
}
