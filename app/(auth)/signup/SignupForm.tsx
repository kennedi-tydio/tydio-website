'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { signupAction, type SignupState } from './actions'
import type { FormEvent } from 'react'
import { GoogleButton, OrDivider } from '../GoogleButton'

function SubmitButton({ isPro, ready }: { isPro: boolean; ready: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending || !ready}
      className={`w-full text-white font-semibold py-3 rounded-xl transition-colors ${
        ready
          ? 'bg-sky-500 hover:bg-sky-600 disabled:opacity-60'
          : 'bg-slate-300 cursor-not-allowed'
      }`}
    >
      {pending
        ? isPro ? 'Submitting application…' : 'Creating account…'
        : isPro ? 'Apply as a Tidy Pro' : 'Create account'}
    </button>
  )
}

function CustomCheckbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={e => { e.stopPropagation(); onChange() }}
      className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
        checked ? 'bg-sky-500 border-sky-500' : 'border-slate-300'
      }`}
    >
      {checked && (
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
          <path d="M1.5 4.5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}

type GooglePrefill = { email: string; firstName: string; lastName: string }

export default function SignupForm({
  googleEnabled = false,
  google = null,
  googleNoAccount = false,
}: {
  googleEnabled?: boolean
  // Set when the person came back from Google without a Tydio account yet.
  google?: GooglePrefill | null
  // They tried to sign in with Google from the login page and had no account.
  googleNoAccount?: boolean
}) {
  const [state, action] = useActionState<SignupState, FormData>(signupAction, {})
  const searchParams = useSearchParams()
  const isPro = searchParams.get('role') === 'pro'
  const [agreed, setAgreed] = useState(false)
  // Optional and unticked by default: marketing email needs a clear opt-in.
  const [marketingOptIn, setMarketingOptIn] = useState(false)
  const [termsError, setTermsError] = useState(false)
  // Tracks whether every required field passes native validation, so the
  // submit button stays disabled until the form is complete.
  const [fieldsValid, setFieldsValid] = useState(false)

  function toggleAgreed() {
    const next = !agreed
    setAgreed(next)
    if (next) setTermsError(false)
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    if (!agreed) {
      e.preventDefault()
      setTermsError(true)
    }
  }

  if (state.needsVerification) {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: '#e8f9fa' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
        </div>
        <div>
          <p className="font-bold text-slate-900 text-lg">Check your email</p>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed">
            We sent a verification link to your inbox. Click it to activate your Tydio account.
          </p>
        </div>
      </div>
    )
  }

  if (state.waitlisted) {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: '#e8f9fa' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
            <path d="M22 4L12 14.01l-3-3"/>
          </svg>
        </div>
        <div>
          <p className="font-bold text-slate-900 text-lg">You&apos;re on the list!</p>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed">
            Tydio isn&apos;t available in your area yet. We&apos;ll notify you as soon as we launch near you.
          </p>
        </div>
      </div>
    )
  }

  return (
    <form
      action={action}
      onSubmit={handleSubmit}
      onInput={e => setFieldsValid(e.currentTarget.checkValidity())}
      onReset={() => setFieldsValid(false)}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="role" value={isPro ? 'TIDYPRO' : 'USER'} />
      {/* Submit both consent fields so the server action accepts the combined checkbox */}
      <input type="hidden" name="terms_accepted" value={agreed ? 'on' : ''} />
      <input type="hidden" name="privacy_accepted" value={agreed ? 'on' : ''} />
      <input type="hidden" name="marketing_opt_in" value={marketingOptIn ? 'on' : ''} />
      {google && <input type="hidden" name="google" value="1" />}

      <p className="text-sm text-slate-500">
        {isPro
          ? 'Apply to earn as a vetted Tidy Pro cleaner.'
          : 'Book a Tydio cleaning in minutes.'}
      </p>

      {google && googleNoAccount ? (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          No account exists with <span className="font-semibold">{google.email}</span>. Please create an account below.
        </p>
      ) : google ? (
        <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          Signing up with Google as <span className="font-semibold">{google.email}</span>. Fill in the rest to finish.
        </p>
      ) : googleEnabled && (
        <>
          <GoogleButton isPro={isPro} from="signup" />
          <OrDivider />
        </>
      )}

      {(state.error || termsError) && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          {state.error || 'You must agree to the Terms & Conditions and Privacy Policy to continue.'}
          {state.error && state.accountExists && (
            <>
              {' '}or{' '}
              <Link href={isPro ? '/login?role=pro' : '/login'} className="font-semibold underline underline-offset-2">
                Sign in
              </Link>
              .
            </>
          )}
        </p>
      )}

      {/* Name */}
      <div className="flex gap-3">
        <div className="flex-1 flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700" htmlFor="first_name">First name</label>
          <input id="first_name" name="first_name" type="text" autoComplete="given-name" required defaultValue={google?.firstName}
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
        </div>
        <div className="flex-1 flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700" htmlFor="last_name">Last name</label>
          <input id="last_name" name="last_name" type="text" autoComplete="family-name" required defaultValue={google?.lastName}
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
        </div>
      </div>

      {/* Email */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-slate-700" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required
          defaultValue={google?.email} readOnly={Boolean(google)}
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 read-only:bg-slate-50 read-only:text-slate-500" />
      </div>

      {/* Phone + Zip */}
      <div className="flex gap-3">
        <div className="flex-1 flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700" htmlFor="phone">Phone</label>
          <input id="phone" name="phone" type="tel" autoComplete="tel" required={isPro}
            placeholder="(555) 000-0000"
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
        </div>
        <div className="flex-1 flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700" htmlFor="zip_code">Zip code</label>
          <input id="zip_code" name="zip_code" type="text" inputMode="numeric" maxLength={5} required
            placeholder="30301"
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
        </div>
      </div>

      {/* Password (not needed when Google signs them in) */}
      {!google && <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-slate-700" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required
          minLength={8} placeholder="8+ characters"
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
      </div>}

      {/* Combined Terms & Privacy */}
      <label className="flex items-start gap-2.5 cursor-pointer" onClick={toggleAgreed}>
        <CustomCheckbox checked={agreed} onChange={toggleAgreed} />
        <span className="text-xs text-slate-500 leading-relaxed">
          I agree to the{' '}
          <Link href="/terms" className="text-sky-600 underline underline-offset-2" onClick={e => e.stopPropagation()}>
            Terms &amp; Conditions
          </Link>
          {' '}and{' '}
          <Link href="/privacy" className="text-sky-600 underline underline-offset-2" onClick={e => e.stopPropagation()}>
            Privacy Policy
          </Link>
        </span>
      </label>

      {/* Optional marketing email opt-in */}
      <label className="flex items-start gap-2.5 cursor-pointer" onClick={() => setMarketingOptIn(v => !v)}>
        <CustomCheckbox checked={marketingOptIn} onChange={() => setMarketingOptIn(v => !v)} />
        <span className="text-xs text-slate-500 leading-relaxed">
          Email me Tydio news, tips, and offers (optional). You can unsubscribe at any time.
        </span>
      </label>

      <SubmitButton isPro={isPro} ready={fieldsValid && agreed} />

      {isPro && (
        <p className="text-xs text-slate-400 text-center leading-relaxed">
          Most background checks clear within 3–7 business days. You&apos;ll be notified once your report is complete, and Tydio will review your status before activating your cleaner profile.
        </p>
      )}
    </form>
  )
}
