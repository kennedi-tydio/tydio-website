'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { forgotPasswordAction, type ForgotState } from './actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-sky-500 hover:bg-sky-600 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors"
    >
      {pending ? 'Sending…' : 'Send reset link'}
    </button>
  )
}

export default function ForgotPasswordForm() {
  const [state, action] = useActionState<ForgotState, FormData>(forgotPasswordAction, {})
  const searchParams = useSearchParams()
  const isPro = searchParams.get('role') === 'pro'

  if (state.sent) {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: '#e8f9fa' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#38C7CA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>
          </svg>
        </div>
        <div>
          <p className="font-bold text-slate-900 text-lg">Check your email</p>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed">
            If an account exists for that email, we&apos;ve sent a password reset link. It expires in 1 hour.
          </p>
        </div>
        <Link href="/login" className="text-sm text-sky-600 hover:underline mt-2">Back to sign in</Link>
      </div>
    )
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="role" value={isPro ? 'TIDYPRO' : 'USER'} />

      <p className="text-sm text-slate-500">Enter your email and we&apos;ll send you a reset link.</p>

      {state.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-slate-700" htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
        />
      </div>

      <SubmitButton />

      <p className="text-center text-sm text-slate-500">
        <Link href="/login" className="text-sky-600 hover:underline">Back to sign in</Link>
      </p>
    </form>
  )
}
