'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { acceptAgreementsAction } from '../actions'
import BackgroundCheckFeeTerms from '../BackgroundCheckFeeTerms'

function CustomCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
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
const INPUT_CLASS =
  'w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-400'
const AGREEMENT_HREF = '/pro/onboarding/agreements/document'

type Props = {
  feeCents: number | null
  agreementTitle: string
  consentText: string
  email: string
  defaultName: string
  next: string | null
  signedToday: string
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
        {hint && <span className="font-normal text-slate-400"> {hint}</span>}
      </label>
      {children}
    </div>
  )
}

export default function AgreementsView({ feeCents, agreementTitle, consentText, email, defaultName, next, signedToday }: Props) {
  const [agreed, setAgreed] = useState(false)
  const [legalName, setLegalName] = useState(defaultName)
  const [address, setAddress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const ready = agreed && legalName.trim().length >= 2 && address.trim().length >= 8

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!ready || isPending) return
    const formData = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      const result = await acceptAgreementsAction(formData)
      if (result?.error) setError(result.error)
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
            <a href={AGREEMENT_HREF} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
              {agreementTitle}
            </a>{' '}
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

        <form onSubmit={handleSubmit} className="flex flex-col">
          {next && <input type="hidden" name="next" value={next} />}

          <p className="text-base font-bold mb-1" style={{ color: 'var(--color-brand)' }}>
            Sign the agreement
          </p>
          <p className="text-sm text-slate-500 leading-relaxed mb-4">
            These details fill in the Provider section of the{' '}
            <a href={AGREEMENT_HREF} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
              agreement
            </a>
            . Your typed legal name is your signature.
          </p>

          <div className="flex flex-col gap-4 mb-6">
            <Field id="legal_name" label="Legal name">
              <input
                id="legal_name"
                name="legal_name"
                required
                autoComplete="name"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                className={INPUT_CLASS}
              />
            </Field>
            <Field id="business_entity" label="Business entity" hint="(if applicable)">
              <input id="business_entity" name="business_entity" autoComplete="organization" placeholder="e.g. Rivera Cleaning LLC" className={INPUT_CLASS} />
            </Field>
            <Field id="authorized_representative" label="Authorized representative" hint="(if applicable)">
              <input id="authorized_representative" name="authorized_representative" className={INPUT_CLASS} />
            </Field>
            <Field id="address" label="Address">
              <input
                id="address"
                name="address"
                required
                autoComplete="street-address"
                placeholder="Street address, city, state, ZIP"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className={INPUT_CLASS}
              />
            </Field>
            <Field id="email" label="Email" hint="(from your account)">
              <input id="email" value={email} readOnly className={`${INPUT_CLASS} bg-slate-50 text-slate-500`} />
            </Field>
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
              className="sr-only peer"
            />
            <span className="rounded-md peer-focus-visible:ring-2 peer-focus-visible:ring-sky-400">
              <CustomCheckbox checked={agreed} />
            </span>
            <span className="text-sm text-slate-700 leading-relaxed">{consentText}</span>
          </label>
          <p className="text-xs text-slate-400 leading-relaxed mb-6 pl-8">
            A signed copy will be emailed to you and to Tydio, and you can download it from your profile.
          </p>

          {error && (
            <p role="alert" className="text-sm text-red-600 mb-4">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!ready || isPending}
            className="w-full py-4 rounded-2xl text-white font-semibold text-base tracking-wide disabled:opacity-40 transition-opacity"
            style={{ backgroundColor: 'var(--color-brand)' }}
          >
            {isPending ? 'Signing…' : 'Agree and Continue'}
          </button>
        </form>
      </div>
    </main>
  )
}
