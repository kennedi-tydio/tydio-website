'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { adminLoginAction } from '../actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-2.5 rounded-xl text-white font-semibold text-sm disabled:opacity-60 transition-opacity"
      style={{ backgroundColor: 'var(--color-brand)' }}
      // Browser extensions (e.g. Edge autofill) inject fdprocessedid before hydration.
      suppressHydrationWarning
    >
      {pending ? 'Signing in…' : 'Sign in'}
    </button>
  )
}

export default function AdminLoginPage() {
  const [state, action] = useActionState(adminLoginAction, {})

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <h1 className="sr-only">Admin login</h1>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span style={{ color: 'var(--color-brand)' }} className="text-2xl font-bold">Tydio</span>
          <p className="text-slate-500 text-sm mt-1">Admin Dashboard</p>
        </div>
        <form
          action={action}
          className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Admin Password
            </label>
            <input
              aria-label="Admin password"
              name="secret"
              type="password"
              required
              autoFocus
              placeholder="••••••••"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand transition-colors"
              // Browser extensions (e.g. Edge autofill) inject fdprocessedid before hydration.
              suppressHydrationWarning
            />
          </div>
          {state?.error && (
            <p role="alert" className="text-red-500 text-sm">{state.error}</p>
          )}
          <SubmitButton />
        </form>
      </div>
    </main>
  )
}
