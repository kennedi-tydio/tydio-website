'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { acceptAgreementsAction } from '../actions'
import BackgroundCheckFeeTerms from '../BackgroundCheckFeeTerms'

function CustomCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      role="checkbox"
      aria-checked={checked}
      className="w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 mt-0.5"
      style={{
        borderColor: checked ? 'var(--color-brand)' : '#cbd5e1',
        backgroundColor: checked ? 'var(--color-brand)' : 'white',
      }}
    >
      {checked && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </span>
  )
}

function IconBack() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  )
}

const LINK_CLASS = 'font-semibold text-slate-900 underline underline-offset-2'

export default function AgreementsView({ feeCents }: { feeCents: number | null }) {
  const [agreed, setAgreed] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleContinue() {
    if (!agreed || isPending) return
    startTransition(() => {
      acceptAgreementsAction()
    })
  }

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col px-6 pt-10 pb-10">
      <div className="max-w-sm mx-auto w-full flex-1 flex flex-col">
        <Link
          href="/pro/onboarding"
          aria-label="Back"
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-2 mb-6"
        >
          <IconBack />
        </Link>

        <h1 className="text-[2rem] font-bold text-slate-900 leading-tight mb-4">
          Agreements
          <br />
          &amp; Disclosures
        </h1>
        <p className="text-lg text-slate-700 leading-snug mb-8">
          Protect yourself on the job and gain customer trust
        </p>

        <p className="text-base font-bold mb-2" style={{ color: 'var(--color-brand)' }}>
          Please review the following:
        </p>

        <ol className="text-sm text-slate-700 leading-relaxed space-y-3 list-decimal pl-5 mb-8 marker:text-slate-700">
          <li>
            I understand I am an <strong className="text-slate-900">independent contractor,</strong> not an employee of Tydio.
          </li>
          <li>
            I am responsible for my own <strong className="text-slate-900">tools, taxes, and liability coverage.</strong>
          </li>
          <li>
            I acknowledge Tydio does <strong className="text-slate-900">not provide insurance</strong> and I am encouraged to obtain my own.
          </li>
          <li>
            I understand I will be responsible for covering the cost of{' '}
            <strong className="text-slate-900">background checks and insurance,</strong> if applicable.
          </li>
          {feeCents != null && (
            <li>
              I agree to the <strong className="text-slate-900">background-screening fee and refund terms</strong> below.
            </li>
          )}
          <li>
            I agree to{' '}
            <Link href="/terms#prohibited" className={LINK_CLASS}>
              abide by Tydio&apos;s Code of Conduct and Terms of Use.
            </Link>
          </li>
          <li>
            I have read and agree to the{' '}
            <Link href="/terms" className={LINK_CLASS}>
              Independent Contractor Agreement
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className={LINK_CLASS}>
              Privacy Policy
            </Link>
          </li>
        </ol>

        {feeCents != null && (
          <>
            <p className="text-sm font-bold text-slate-900 mb-2">Background-screening fee and refund terms</p>
            <div className="mb-8">
              <BackgroundCheckFeeTerms feeCents={feeCents} />
            </div>
          </>
        )}

        <div className="flex-1" />

        <label className="flex items-start gap-3 cursor-pointer mb-8" onClick={() => setAgreed((v) => !v)}>
          <CustomCheckbox checked={agreed} />
          <span className="text-sm text-slate-700 leading-relaxed">
            I have read and agree to the Tidy Pro Independent Contractor &amp; Platform Agreement. I understand
            that checking this box and selecting &ldquo;Agree &amp; Continue&rdquo; constitutes my electronic
            signature.
          </span>
        </label>

        <button
          type="button"
          onClick={handleContinue}
          disabled={!agreed || isPending}
          className="w-full py-4 rounded-2xl text-white font-semibold text-base tracking-wide disabled:opacity-40 transition-opacity"
          style={{ backgroundColor: 'var(--color-brand)' }}
        >
          {isPending ? 'Please wait…' : 'Agree & Continue'}
        </button>
      </div>
    </main>
  )
}
