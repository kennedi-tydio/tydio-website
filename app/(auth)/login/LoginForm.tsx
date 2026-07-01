'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { loginAction, resendVerificationAction, type LoginState } from './actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-sky-500 hover:bg-sky-600 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors"
    >
      {pending ? 'Signing in…' : 'Sign in'}
    </button>
  )
}

function ResendButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-sm text-sky-600 hover:underline disabled:opacity-60"
    >
      {pending ? 'Sending…' : 'Resend verification email'}
    </button>
  )
}

export default function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState<LoginState, FormData>(loginAction, {})
  const [resendState, resendAction] = useActionState<LoginState, FormData>(resendVerificationAction, {})
  const searchParams = useSearchParams()
  const isPro = searchParams.get('role') === 'pro'

  // Unverified state — show resend option
  if (state.unverified) {
    return (
      <div className="flex flex-col gap-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-sm font-semibold text-amber-800 mb-0.5">Email not verified</p>
          <p className="text-sm text-amber-700 leading-relaxed">
            Please check your inbox for the verification link we sent when you signed up.
          </p>
        </div>

        {resendState.resentVerification ? (
          <p className="text-sm text-center text-emerald-600 font-medium">
            Verification email sent — check your inbox.
          </p>
        ) : (
          <form action={resendAction} className="text-center">
            <input type="hidden" name="email" value={state.unverifiedEmail ?? ''} />
            <input type="hidden" name="role" value={state.unverifiedRole ?? (isPro ? 'TIDYPRO' : 'USER')} />
            <ResendButton />
          </form>
        )}

        <Link
          href="/login"
          className="text-center text-sm text-slate-500 hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="role" value={isPro ? 'TIDYPRO' : 'USER'} />
      {next && <input type="hidden" name="next" value={next} />}

      <p className="text-sm text-slate-500">
        {isPro ? 'Welcome back, Tidy Pro.' : 'Welcome back to Tydio.'}
      </p>

      {state.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-slate-700" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-slate-700" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
        />
      </div>

      <SubmitButton />

      <p className="text-center text-sm text-slate-500">
        <a
          href={`/forgot-password${isPro ? '?role=pro' : ''}`}
          className="text-sky-600 hover:underline"
        >
          Forgot password?
        </a>
      </p>
    </form>
  )
}
