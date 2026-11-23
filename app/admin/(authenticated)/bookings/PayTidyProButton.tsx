'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { payTidyProNowAction, type BookingAdminState } from '../../actions'

function Submit({ amount, held }: { amount: number; held: boolean }) {
  const { pending } = useFormStatus()
  if (pending) return <span className="text-xs text-slate-400">Paying…</span>
  return (
    <button
      type="submit"
      onClick={(e) => {
        const hold = held ? ' This takes the hold off.' : ''
        const ok = window.confirm(
          `Pay the Tidy Pro $${amount.toFixed(2)} now?${hold} If you refund the booking later and lower their payout, the difference is taken back from their Stripe account.`
        )
        if (!ok) e.preventDefault()
      }}
      className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-green-300 text-green-700 hover:bg-green-50 transition-colors whitespace-nowrap"
    >
      Pay Tidy Pro
    </button>
  )
}

// Sends a completed booking's payout now: releases a hold, or retries a transfer that
// didn't go through (lib/adminPayout).
export default function PayTidyProButton({ bookingId, amount, held }: { bookingId: string; amount: number; held: boolean }) {
  const [state, formAction] = useActionState<BookingAdminState, FormData>(payTidyProNowAction.bind(null, bookingId), {})

  if (state.message) return <span role="status" className="text-xs text-green-700 max-w-56 text-right">{state.message}</span>

  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <Submit amount={amount} held={held} />
      {state.error && <span role="alert" className="text-xs text-red-600 max-w-56 text-right">{state.error}</span>}
    </form>
  )
}
