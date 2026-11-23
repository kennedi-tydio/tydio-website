'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { completeBookingAction, type BookingAdminState } from '../../actions'

function Submit({ missingPhotos }: { missingPhotos: number }) {
  const { pending } = useFormStatus()
  if (pending) return <span className="text-xs text-slate-400">Completing…</span>
  return (
    <button
      type="submit"
      onClick={(e) => {
        const photos = missingPhotos > 0 ? ` ${missingPhotos} task${missingPhotos === 1 ? ' has' : 's have'} no after photo and will stay unticked.` : ''
        const ok = window.confirm(
          `Mark this booking complete for the Tidy Pro?${photos} The customer is asked for a review, and the Tidy Pro is paid now unless you’ve put their payout on hold. This can’t be undone.`
        )
        if (!ok) e.preventDefault()
      }}
      className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-green-300 text-green-700 hover:bg-green-50 transition-colors"
    >
      Mark complete
    </button>
  )
}

// For a Tidy Pro who did the job but can't finish it in the app (photos that
// won't upload, a dead phone). See lib/adminBookingCompletion.
export default function CompleteBookingButton({ bookingId, missingPhotos }: { bookingId: string; missingPhotos: number }) {
  const [state, formAction] = useActionState<BookingAdminState, FormData>(completeBookingAction.bind(null, bookingId), {})

  if (state.message) return <span role="status" className="text-xs text-green-700 max-w-56 text-right">{state.message}</span>

  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <Submit missingPhotos={missingPhotos} />
      {state.error && <span role="alert" className="text-xs text-red-600 max-w-48 text-right">{state.error}</span>}
    </form>
  )
}
