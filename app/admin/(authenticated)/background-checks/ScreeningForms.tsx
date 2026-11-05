'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { FOLLOW_UP_KINDS, FOLLOW_UP_LABELS, type FollowUpKind } from '@/lib/backgroundCheckFollowUp'
import {
  decideBackgroundCheckAction,
  markScreeningSentAction,
  sendBackgroundCheckFollowUpAction,
  type BackgroundCheckFormState,
} from '../../actions'

const BUTTON = 'text-xs font-semibold px-2.5 py-1 rounded-lg self-start disabled:opacity-50 disabled:cursor-not-allowed'

function SubmitButton({ label, pendingLabel, className, style }: { label: string; pendingLabel: string; className: string; style?: React.CSSProperties }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className={`${BUTTON} ${className}`} style={style}>
      {pending ? pendingLabel : label}
    </button>
  )
}

function Result({ state }: { state: BackgroundCheckFormState }) {
  if (state.error) return <p role="alert" className="text-xs text-red-600 max-w-60">{state.error}</p>
  if (state.message) return <p role="status" className="text-xs text-green-700">{state.message}</p>
  return null
}

// Paid → sent. Checkr emails the cleaner the invitation when the check is ordered,
// so this only records that it went out.
export function MarkSentForm({ proId }: { proId: string }) {
  const [state, formAction] = useActionState<BackgroundCheckFormState, FormData>(markScreeningSentAction.bind(null, proId), {})
  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <label className="flex items-start gap-1.5 text-xs text-slate-600">
        <input type="checkbox" name="ordered" required className="mt-0.5" />
        <span>Background check and ID verification ordered in Checkr (Checkr emailed the cleaner)</span>
      </label>
      <SubmitButton label="Mark as sent" pendingLabel="Saving…" className="text-white" style={{ backgroundColor: 'var(--color-brand)' }} />
      <Result state={state} />
    </form>
  )
}

const PARTS = [
  { name: 'backgroundCheck', label: 'Background check' },
  { name: 'idVerification', label: 'ID verification' },
] as const

type Choice = 'approve' | 'deny' | null

// One line per part of the screening, then one reason for both. Denying either
// part denies the cleaner, so the reason and the adverse action confirmation are
// only asked for once something is denied.
export function DecisionForm({ proId }: { proId: string }) {
  const [state, formAction] = useActionState<BackgroundCheckFormState, FormData>(decideBackgroundCheckAction.bind(null, proId), {})
  const [choices, setChoices] = useState<Record<(typeof PARTS)[number]['name'], Choice>>({ backgroundCheck: null, idVerification: null })
  const denying = choices.backgroundCheck === 'deny' || choices.idVerification === 'deny'

  return (
    <form action={formAction} className="flex flex-col gap-2">
      {PARTS.map(({ name, label }) => (
        <fieldset key={name} className="flex items-center justify-between gap-3">
          <legend className="sr-only">{label}</legend>
          <span aria-hidden className="text-xs font-medium text-slate-700">
            {label}
          </span>
          <span className="flex gap-3">
            {(['approve', 'deny'] as const).map((value) => (
              <label key={value} className={`flex items-center gap-1 text-xs ${value === 'deny' ? 'text-red-600' : 'text-green-700'}`}>
                <input
                  type="radio"
                  name={name}
                  value={value}
                  required
                  checked={choices[name] === value}
                  onChange={() => setChoices((prev) => ({ ...prev, [name]: value }))}
                />
                {value === 'approve' ? 'Approve' : 'Deny'}
              </label>
            ))}
          </span>
        </fieldset>
      ))}

      <textarea
        aria-label={denying ? 'Reason, sent to the cleaner' : 'Reason (only needed when denying)'}
        name="reason"
        required={denying}
        placeholder={denying ? 'Reason, sent to the cleaner (required)…' : 'Reason (only needed when denying)…'}
        rows={2}
        className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-brand resize-none"
      />

      {denying && (
        <label className="flex items-start gap-1.5 text-xs text-slate-500">
          <input type="checkbox" name="noticesConfirmed" required className="mt-0.5" />
          <span>
            Checkr&apos;s pre-adverse notice has been sent, or this denial isn&apos;t based on the report. I understand the cleaner is
            emailed this reason and has 7 days to appeal, after which they&apos;re banned and their account is permanently deleted.
          </span>
        </label>
      )}

      <SubmitButton
        label="Submit"
        pendingLabel="Submitting…"
        className="text-white"
        style={{ backgroundColor: denying ? '#ef4444' : '#22c55e' }}
      />
      <Result state={state} />
    </form>
  )
}

// A reminder for a cleaner who's stalled. The reminder that fits their stage is
// picked to start with; the server refuses one that doesn't fit.
export function FollowUpForm({ proId, defaultKind }: { proId: string; defaultKind: FollowUpKind }) {
  const [state, formAction] = useActionState<BackgroundCheckFormState, FormData>(sendBackgroundCheckFollowUpAction.bind(null, proId), {})
  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <select
        aria-label="Which reminder to send"
        name="kind"
        defaultValue={defaultKind}
        className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-brand"
      >
        {FOLLOW_UP_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {FOLLOW_UP_LABELS[kind]}
          </option>
        ))}
      </select>
      <SubmitButton label="Send follow up email" pendingLabel="Sending…" className="text-slate-600 border border-slate-200 bg-white hover:bg-slate-50" />
      <Result state={state} />
    </form>
  )
}
