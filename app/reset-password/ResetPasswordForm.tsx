'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { resetPasswordAction, type ResetState } from './actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-sky-500 hover:bg-sky-600 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors"
    >
      {pending ? 'Saving…' : 'Set new password'}
    </button>
  )
}

export default function ResetPasswordForm() {
  const [state, action] = useActionState<ResetState, FormData>(resetPasswordAction, {})
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  if (!token) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-slate-500">This reset link is invalid or has expired.</p>
        <Link href="/forgot-password" className="text-sm text-sky-600 hover:underline mt-3 inline-block">
          Request a new link
        </Link>
      </div>
    )
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      <p className="text-sm text-slate-500">Enter your new password below.</p>

      {state.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-slate-700" htmlFor="password">New password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="8+ characters"
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-slate-700" htmlFor="confirm">Confirm password</label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="Repeat password"
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
        />
      </div>

      <SubmitButton />
    </form>
  )
}
