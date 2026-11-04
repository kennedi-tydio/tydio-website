'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { APPEAL_MAX_LENGTH } from '@/lib/appealWindow'
import { submitAppealAction } from './actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-60 transition-opacity"
      style={{ backgroundColor: 'var(--color-brand)' }}
    >
      {pending ? 'Sending…' : 'Send appeal'}
    </button>
  )
}

export default function AppealForm({ token }: { token: string }) {
  const [state, action] = useActionState(submitAppealAction, {})

  if (state.submitted) {
    return (
      <p role="status" className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
        Your appeal has been sent. We&apos;ll email you once it has been reviewed.
      </p>
    )
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      {state.error && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          {state.error}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="message" className="text-sm font-medium text-slate-700">
          Why should the ban be lifted?
        </label>
        <textarea
          id="message"
          name="message"
          required
          rows={6}
          maxLength={APPEAL_MAX_LENGTH}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand transition-colors"
        />
      </div>
      <SubmitButton />
    </form>
  )
}
