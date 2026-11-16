'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { editBookingAction, requestUpchargeAction, withdrawUpchargeAction, type BookingAdminState } from '../../actions'

const BUTTON =
  'text-xs font-semibold px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
const PRIMARY =
  'text-xs font-semibold px-2.5 py-1 rounded-lg bg-brand text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed'
const INPUT = 'w-full border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700'
const LABEL = 'flex flex-col gap-0.5 w-full text-[11px] text-slate-500'

export type EditableBooking = {
  id: string
  date: string | null
  time: string | null
  durationMinutes: number | null
  notes: string | null
  entryInstructions: string | null
  // The time can only change before the Tidy Pro sets off.
  canChangeTime: boolean
  canUpcharge: boolean
  pendingUpcharge: { id: string; amount: number } | null
}

function Submit({ label, pendingLabel, className = PRIMARY, confirm }: { label: string; pendingLabel: string; className?: string; confirm?: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
      onClick={(e) => {
        if (!confirm) return
        // Let the browser flag missing fields first.
        if (e.currentTarget.form && !e.currentTarget.form.checkValidity()) return
        if (!window.confirm(confirm)) e.preventDefault()
      }}
    >
      {pending ? pendingLabel : label}
    </button>
  )
}

function Result({ state }: { state: BookingAdminState }) {
  if (state.error) return <span role="alert" className="text-xs text-red-600 text-right">{state.error}</span>
  if (state.message) return <span role="status" className="text-xs text-green-700 text-right">{state.message}</span>
  return null
}

function EditForm({ booking, onClose }: { booking: EditableBooking; onClose: () => void }) {
  const [state, formAction] = useActionState<BookingAdminState, FormData>(editBookingAction.bind(null, booking.id), {})
  return (
    <form action={formAction} className="flex flex-col items-end gap-1.5 w-64 text-left">
      <label className={LABEL}>
        Date
        <input name="date" type="date" required defaultValue={booking.date ?? ''} readOnly={!booking.canChangeTime} className={INPUT} />
      </label>
      <label className={LABEL}>
        Start time (the customer&apos;s time zone)
        <input name="time" type="time" required step={300} defaultValue={booking.time?.slice(0, 5) ?? ''} readOnly={!booking.canChangeTime} className={INPUT} />
      </label>
      <label className={LABEL}>
        Length in minutes
        <input
          name="duration"
          type="number"
          required
          min={15}
          max={720}
          step={1}
          defaultValue={booking.durationMinutes ?? 60}
          readOnly={!booking.canChangeTime}
          className={INPUT}
        />
      </label>
      {!booking.canChangeTime && <span className="text-[11px] text-slate-400 w-full">The Tidy Pro has set off, so only the notes can change.</span>}
      <label className={LABEL}>
        Notes for the Tidy Pro
        <textarea name="notes" rows={2} maxLength={2000} defaultValue={booking.notes ?? ''} className={INPUT} />
      </label>
      <label className={LABEL}>
        Entry instructions
        <textarea name="entry_instructions" rows={2} maxLength={2000} defaultValue={booking.entryInstructions ?? ''} className={INPUT} />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600 px-2">
          Close
        </button>
        <Submit label="Save changes" pendingLabel="Saving…" />
      </div>
      <Result state={state} />
    </form>
  )
}

function UpchargeForm({ booking, onClose }: { booking: EditableBooking; onClose: () => void }) {
  const [state, formAction] = useActionState<BookingAdminState, FormData>(requestUpchargeAction.bind(null, booking.id), {})
  if (state.message) return <Result state={state} />
  return (
    <form action={formAction} className="flex flex-col items-end gap-1.5 w-64 text-left">
      <label className={LABEL}>
        Upcharge ($, before the card fee)
        <input name="amount" type="number" inputMode="decimal" required min="0.01" max="1000" step="0.01" autoFocus className={INPUT} />
      </label>
      <label className={LABEL}>
        Tidy Pro&apos;s share ($)
        <input name="cleaner_pay" type="number" inputMode="decimal" min="0" step="0.01" placeholder="Leave blank for 80%" className={INPUT} />
      </label>
      <label className={LABEL}>
        Reason (the customer sees this)
        <textarea name="reason" required rows={3} maxLength={500} placeholder="e.g. The kitchen needed a deep clean, not a standard one." className={INPUT} />
      </label>
      <span className="text-[11px] text-slate-400 w-full">
        The booking is suspended until the customer pays in the app. They and the Tidy Pro are notified now.
      </span>
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600 px-2">
          Close
        </button>
        <Submit label="Send upcharge" pendingLabel="Sending…" confirm="Send this upcharge? The booking is suspended and the Tidy Pro can't work on it until the customer pays." />
      </div>
      <Result state={state} />
    </form>
  )
}

function WithdrawUpcharge({ bookingId, upcharge }: { bookingId: string; upcharge: { id: string; amount: number } }) {
  const [state, formAction] = useActionState<BookingAdminState, FormData>(withdrawUpchargeAction.bind(null, upcharge.id, bookingId), {})
  if (state.message) return <Result state={state} />
  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <Submit
        label="Remove upcharge"
        pendingLabel="Removing…"
        className={BUTTON}
        confirm={`Remove the $${upcharge.amount.toFixed(2)} upcharge? The customer won't owe it, and the booking goes back on.`}
      />
      <Result state={state} />
    </form>
  )
}

export default function BookingAdminControls({ booking }: { booking: EditableBooking }) {
  const [open, setOpen] = useState<'edit' | 'upcharge' | null>(null)

  if (open === 'edit') return <EditForm booking={booking} onClose={() => setOpen(null)} />
  if (open === 'upcharge') return <UpchargeForm booking={booking} onClose={() => setOpen(null)} />

  return (
    <div className="inline-flex flex-wrap justify-end gap-1.5">
      <button type="button" className={BUTTON} onClick={() => setOpen('edit')}>
        Edit
      </button>
      {booking.pendingUpcharge ? (
        <WithdrawUpcharge bookingId={booking.id} upcharge={booking.pendingUpcharge} />
      ) : (
        booking.canUpcharge && (
          <button type="button" className={BUTTON} onClick={() => setOpen('upcharge')}>
            Upcharge
          </button>
        )
      )}
    </div>
  )
}
