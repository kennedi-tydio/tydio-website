'use client'

import Image from 'next/image'
import Link from 'next/link'
import { COUNTRY_DIAL_CODES, findCountry } from '@/lib/countryDialCodes'

type Props = {
  titleId?: string
  // Prefilled with the number on file, if any, so the customer can confirm
  // or change where the texts will go. The country code is its own field so
  // clearing the number doesn't drop it.
  // An ISO code from COUNTRY_DIAL_CODES, e.g. 'US'.
  country: string
  onCountryChange?: (value: string) => void
  phone: string
  onPhoneChange?: (value: string) => void
  error?: string | null
  working?: boolean
  onRespond?: (optIn: boolean) => void
}

// The SMS consent step. Used by NotificationConsentModal and, without handlers,
// on the public /sms-opt-in page so carrier reviewers see the exact prompt.
// Keep the brand name and every disclosure here: toll-free verification
// rejects opt-ins that don't name Tydio or that omit frequency, rates, STOP/HELP.
export default function SmsOptInPrompt({ titleId, country, onCountryChange, phone, onPhoneChange, error, working, onRespond }: Props) {
  const selected = findCountry(country)
  return (
    <>
      <Image src="/Tydio Logo No Bkg.png" alt="Tydio" width={88} height={32} className="mb-3" />
      <h2 id={titleId} className="text-lg font-bold text-slate-900 mb-1">Get text updates from Tydio?</h2>
      <p className="text-sm text-slate-600 mb-4 leading-relaxed">
        By tapping <strong>Yes, text me</strong>, you agree to receive text messages from Tydio about booking requests,
        confirmations and changes, appointment reminders, service updates, new messages, and account alerts. Consent is
        not a condition of using Tydio. Message frequency varies. Msg &amp; data rates may apply. Reply STOP to opt out,
        HELP for help. See our{' '}
        <Link href="/terms#sms" className="text-sky-600 underline underline-offset-2">Terms</Link> and{' '}
        <Link href="/privacy" className="text-sky-600 underline underline-offset-2">Privacy Policy</Link>.
      </p>
      <div className="flex gap-2 mb-3">
        {/* The native select sits invisibly over a compact "US +1" label, so
            the closed field stays narrow while the open list shows full names. */}
        <div className="relative w-24 flex-shrink-0">
          <select
            aria-label="Country code"
            value={country}
            onChange={(e) => onCountryChange?.(e.target.value)}
            disabled={!onCountryChange}
            className="peer absolute inset-0 z-10 w-full h-full opacity-0 cursor-pointer disabled:cursor-default"
          >
            {COUNTRY_DIAL_CODES.map((c) => (
              <option key={c.iso} value={c.iso}>{c.name} (+{c.dial})</option>
            ))}
          </select>
          <div
            aria-hidden="true"
            className="h-full flex items-center justify-between gap-1 rounded-xl border border-slate-200 px-3 text-sm text-slate-800 peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-brand)]"
          >
            <span>{country} +{selected?.dial}</span>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round">
              <path d="M4 6l4 4 4-4" />
            </svg>
          </div>
        </div>
        <input
          aria-label="Mobile phone number"
          type="tel"
          autoComplete="tel-national"
          value={phone}
          onChange={(e) => onPhoneChange?.(e.target.value)}
          readOnly={!onPhoneChange}
          placeholder="Mobile phone number"
          className="flex-1 min-w-0 rounded-xl border border-slate-200 px-4 py-2.5 text-sm"
        />
      </div>
      {error && <p role="alert" className="text-xs text-red-600 mb-3">{error}</p>}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => onRespond?.(false)}
          disabled={working}
          className="flex-1 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600 disabled:opacity-50"
        >
          No thanks
        </button>
        <button
          type="button"
          onClick={() => onRespond?.(true)}
          disabled={working}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-brand)' }}
        >
          {working ? 'Saving…' : 'Yes, text me'}
        </button>
      </div>
    </>
  )
}
