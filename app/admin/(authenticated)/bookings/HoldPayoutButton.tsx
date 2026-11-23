'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { holdPayoutAction, removePayoutHoldAction, type BookingAdminState } from '../../actions'

const BUTTON =
  'text-xs font-semibold px-2.5 py-1 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors whitespace-nowrap disabled:opacity-50'

function Submit({ label, pendingLabel, confirm }: { label: string; pendingLabel: string; confirm?: string }) {
  const { pending } = useFormStatus()
  if (pending) return <span className="text-xs text-slate-400">{pendingLabel}</span>
  return (
    <button type="submit" className={BUTTON} onClick={(e) => confirm && !window.confirm(confirm) && e.preventDefault()}>
      {label}
    </button>
  )
}

// Puts a booking's Tidy Pro payout on hold before it goes out, e.g. while looking into a
// customer's complaint (lib/adminPayout). Nothing is sent while it's held.
export function HoldPayoutButton({ bookingId }: { bookingId: string }) {
  const [state, formAction] = useActionState<BookingAdminState, FormData>(holdPayoutAction.bind(null, bookingId), {})
  const [open, setOpen] = useState(false)

  if (state.message) return <span role="status" className="text-xs text-amber-700 max-w-56 text-right inline-block">{state.message}</span>

  if (!open) {
    return (
      <button type="button" className={BUTTON} onClick={() => setOpen(true)}>
        Hold payout
      </button>
    )
  }

  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1.5 w-56">
      <textarea
        name="note"
        rows={2}
        maxLength={500}
        autoFocus
        aria-label="Why it's on hold (optional)"
        placeholder="Why it's on hold (optional, admins only)"
        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700"
      />
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:text-slate-600 px-2">
          Back
        </button>
        <Submit label="Hold payout" pendingLabel="Holding…" />
      </div>
      {state.error && <span role="alert" className="text-xs text-red-600 text-right">{state.error}</span>}
    </form>
  )
}

// Takes the hold off an accepted booking that hasn't completed, so it's paid as usual.
export function RemovePayoutHoldButton({ bookingId }: { bookingId: string }) {
  const [state, formAction] = useActionState<BookingAdminState, FormData>(removePayoutHoldAction.bind(null, bookingId), {})

  if (state.message) return <span role="status" className="text-xs text-green-700 max-w-56 text-right inline-block">{state.message}</span>

  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <Submit label="Remove hold" pendingLabel="Removing…" confirm="Remove the hold? The Tidy Pro is then paid as soon as the booking completes." />
      {state.error && <span role="alert" className="text-xs text-red-600 max-w-56 text-right">{state.error}</span>}
    </form>
  )
}
