'use client'

import { useState, useTransition } from 'react'
import { signAmendmentAction } from './actions'

const LINK_CLASS = 'font-semibold text-slate-900 underline underline-offset-2'
const INPUT_CLASS =
  'w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-400'
const DOCUMENT_HREF = '/pro/onboarding/amendment/document'

type Props = {
  title: string
  consentText: string
  defaultName: string
  next: string
  signedToday: string
}

export default function AmendmentView({ title, consentText, defaultName, next, signedToday }: Props) {
  const [agreed, setAgreed] = useState(false)
  const [legalName, setLegalName] = useState(defaultName)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const ready = agreed && legalName.trim().length >= 2

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!ready || isPending) return
    const formData = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      const result = await signAmendmentAction(formData)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col px-6 pt-10 pb-10">
      <div className="max-w-sm mx-auto w-full flex-1 flex flex-col">
        <h1 className="text-[2rem] font-bold text-slate-900 leading-tight mb-4">Agreement update</h1>
        <p className="text-base text-slate-700 leading-relaxed mb-6">
          We&apos;ve made two changes to your contractor agreement. Please review and sign them to keep using the app.
        </p>

        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 mb-4">
          <p className="text-sm font-bold text-slate-900 mb-1">What&apos;s changing</p>
          <p className="text-sm font-semibold text-slate-900 mt-2">No-access wait</p>
          <p className="text-sm text-slate-700 leading-relaxed">
            If you can&apos;t get into a customer&apos;s home, you now wait <strong>10 minutes</strong> (instead of 15)
            after the scheduled start time or your arrival, whichever is later, before you can report &ldquo;Customer
            unavailable&mdash;no access.&rdquo;
          </p>
          <p className="text-sm font-semibold text-slate-900 mt-3">Late customer cancellations</p>
          <p className="text-sm text-slate-700 leading-relaxed">
            A cancellation counts as late when the customer cancels less than <strong>2 hours</strong> before the start
            (instead of 12 hours). When that happens, you&apos;re still paid <strong>50% of what you would have earned</strong>{' '}
            for the booking, the same as before, and the customer gets 50% of what they paid back. For example, if you
            would have earned $100, you&apos;re paid $50.
          </p>
          <p className="text-sm text-slate-700 leading-relaxed mt-3">
            These apply to bookings you accept after you sign. Your pay for no-access bookings, your 80% on completed
            bookings, and everything else in your agreement stay the same.
          </p>
        </div>

        <a href={DOCUMENT_HREF} target="_blank" rel="noopener noreferrer" className={`text-sm mb-8 ${LINK_CLASS}`}>
          Read the full amendment (PDF)
        </a>

        <div className="flex-1" />

        <form onSubmit={handleSubmit} className="flex flex-col">
          <input type="hidden" name="next" value={next} />

          <p className="text-base font-bold mb-1" style={{ color: 'var(--color-brand)' }}>
            Sign the amendment
          </p>
          <p className="text-sm text-slate-500 leading-relaxed mb-4">Your typed legal name is your signature.</p>

          <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="legal_name" className="text-sm font-medium text-slate-700">
                Legal name
              </label>
              <input
                id="legal_name"
                name="legal_name"
                required
                autoComplete="name"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
              <div className="flex items-baseline gap-2">
                <span className="text-slate-500">Signature:</span>
                <span className="font-serif italic text-lg text-slate-900 truncate">
                  {legalName.trim() ? `/s/ ${legalName.trim()}` : '—'}
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-slate-500">Date:</span>
                <span className="text-slate-900">{signedToday}</span>
              </div>
            </div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer mb-3">
            <input
              type="checkbox"
              name="agreed"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 w-4 h-4 flex-shrink-0 accent-[var(--color-brand)]"
            />
            <span className="text-sm text-slate-700 leading-relaxed">{consentText}</span>
          </label>
          <p className="text-xs text-slate-400 leading-relaxed mb-6 pl-7">
            A signed copy of {title} will be emailed to you and to Tydio.
          </p>

          {error && (
            <p role="alert" className="text-sm text-red-600 mb-4">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!ready || isPending}
            className="w-full py-4 rounded-2xl text-white font-semibold text-base tracking-wide disabled:opacity-40 transition-opacity bg-brand"
          >
            {isPending ? 'Signing…' : 'Agree and Continue'}
          </button>
        </form>
      </div>
    </main>
  )
}
