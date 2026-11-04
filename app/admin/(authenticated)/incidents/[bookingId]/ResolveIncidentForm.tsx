'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { resolveIncidentAction, type ResolveIncidentState } from '../../../actions'

type Option = { level: 'full' | 'half' | 'none'; label: string; refund: number; cleanerPay: number }

function money(value: number): string {
  return `$${value.toFixed(2)}`
}

function SubmitButton({ option }: { option: Option | undefined }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending || !option}
      onClick={(event) => {
        const message = option && `Refund the customer ${money(option.refund)} and pay the cleaner ${money(option.cleanerPay)}? Both will be emailed, and this can't be undone.`
        if (message && !window.confirm(message)) event.preventDefault()
      }}
      className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-brand transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? 'Settling…' : 'Settle and email both'}
    </button>
  )
}

export default function ResolveIncidentForm({
  bookingId,
  options,
  canPause,
  suggestPause,
}: {
  bookingId: string
  options: Option[]
  canPause: boolean
  suggestPause: boolean
}) {
  const [state, formAction] = useActionState<ResolveIncidentState, FormData>(resolveIncidentAction.bind(null, bookingId), {})
  const [level, setLevel] = useState<Option['level'] | null>(null)
  const selected = options.find((o) => o.level === level)

  if (state.message) {
    return (
      <p role="status" className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
        {state.message}
      </p>
    )
  }

  return (
    <form action={formAction} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-900">Settle this incident</h2>

      <fieldset className="space-y-2">
        <legend className="sr-only">Refund</legend>
        {options.map((o) => (
          <label
            key={o.level}
            className="flex items-center justify-between gap-4 border rounded-xl px-4 py-3 cursor-pointer transition-colors"
            style={{ borderColor: level === o.level ? 'var(--color-brand)' : '#e2e8f0' }}
          >
            <span className="flex items-center gap-3">
              <input type="radio" name="refund_level" value={o.level} checked={level === o.level} onChange={() => setLevel(o.level)} required />
              <span className="text-sm font-medium text-slate-800">{o.label}</span>
            </span>
            <span className="text-xs text-slate-500 text-right">
              Customer gets {money(o.refund)} · Cleaner paid {money(o.cleanerPay)}
            </span>
          </label>
        ))}
      </fieldset>

      <label className="block">
        <span className="text-sm text-slate-600">Note to include in both emails (optional)</span>
        <textarea
          name="note"
          rows={3}
          maxLength={1000}
          placeholder="Briefly explain what happened"
          className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
        />
      </label>

      {canPause && (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" name="pause_cleaner" defaultChecked={suggestPause} />
          Pause the cleaner (no new bookings until you approve them again)
        </label>
      )}

      {state.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}

      <SubmitButton option={selected} />
    </form>
  )
}
