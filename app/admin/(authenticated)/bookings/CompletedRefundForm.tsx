'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { refundCompletedBookingAction, type BookingAdminState } from '../../actions'
import type { AdminPayoutChoice } from '@/lib/payoutHold'
import type { RefundOption } from './CancelBookingButton'
import PayoutFields, { payoutAmount } from './PayoutFields'

const BUTTON =
  'text-xs font-semibold px-2.5 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

function Submit({ onConfirm }: { onConfirm: (e: React.MouseEvent<HTMLButtonElement>) => void }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className={BUTTON} onClick={onConfirm}>
      {pending ? 'Saving…' : 'Refund and set payout'}
    </button>
  )
}

// A completed booking the customer escalated: refund them and set what the Tidy Pro is
// paid, in one go. If the payout is on hold or hasn't gone out, the new pay is what's sent;
// if it has, the difference (all of it, for No payout) is taken back from the Tidy Pro's
// Stripe account.
export default function CompletedRefundForm({
  bookingId,
  options,
  cleanerPay,
  payoutSent,
}: {
  bookingId: string
  options: RefundOption[]
  cleanerPay: number
  payoutSent: boolean
}) {
  const [state, formAction] = useActionState<BookingAdminState, FormData>(refundCompletedBookingAction.bind(null, bookingId), {})
  const [open, setOpen] = useState(false)
  const [refund, setRefund] = useState<RefundOption['value']>(options[0]?.value ?? 'none')
  const [payout, setPayout] = useState<AdminPayoutChoice>('full')
  const [payoutCustom, setPayoutCustom] = useState('')

  if (state.message) return <span role="status" className="text-xs text-green-700 max-w-64 text-right inline-block">{state.message}</span>

  if (!open) {
    return (
      <button type="button" className={BUTTON} onClick={() => setOpen(true)}>
        Refund…
      </button>
    )
  }

  const chosen = options.find((o) => o.value === refund)
  const custom = options.find((o) => o.value === 'custom')

  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1.5 w-64">
      {options.length > 0 ? (
        <label className="flex items-center gap-1 w-full text-xs text-slate-600">
          <span>Refund</span>
          <select
            name="refund"
            value={refund}
            onChange={(e) => setRefund(e.currentTarget.value as RefundOption['value'])}
            className="flex-1 min-w-0 text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700"
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input type="hidden" name="refund" value="none" />
      )}
      {refund === 'custom' && custom && (
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
            aria-label="Refund amount in dollars"
            className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700"
          />
        </label>
      )}
      <PayoutFields pay={cleanerPay} choice={payout} onChoice={setPayout} custom={payoutCustom} onCustom={setPayoutCustom} />
      <textarea
        name="note"
        rows={2}
        maxLength={1000}
        aria-label="Note (optional)"
        placeholder="Note (optional). Emailed to the customer and the Tidy Pro."
        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700"
      />
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:text-slate-600 px-2">
          Back
        </button>
        <Submit
          onConfirm={(e) => {
            const form = e.currentTarget.form
            // Let the browser flag a missing or out-of-range amount itself.
            if (!form || !form.checkValidity()) return
            const amount = form.elements.namedItem('amount')
            const refundText =
              refund === 'custom' && amount instanceof HTMLInputElement
                ? `a refund of $${Number(amount.value).toFixed(2)}`
                : (chosen?.label ?? 'no refund')
            const pay = payoutAmount(payout, cleanerPay, payoutCustom) ?? 0
            const clawback =
              payoutSent && pay < cleanerPay
                ? ` Their payout was already sent, so $${(cleanerPay - pay).toFixed(2)} will be taken back from their Stripe account.`
                : ''
            const message = `The customer gets: ${refundText}. The Tidy Pro is paid $${pay.toFixed(2)} of their $${cleanerPay.toFixed(2)}.${clawback} Both are emailed. This can only be done once.`
            if (!window.confirm(message)) e.preventDefault()
          }}
        />
      </div>
      {state.error && <span role="alert" className="text-xs text-red-600 text-right">{state.error}</span>}
    </form>
  )
}
