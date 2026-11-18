'use client'

import Image from 'next/image'
import Link from 'next/link'
import PhoneWithCountryInput from './form/PhoneWithCountryInput'

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
      <PhoneWithCountryInput
        country={country}
        onCountryChange={onCountryChange}
        number={phone}
        onNumberChange={onPhoneChange}
        className="mb-3"
      />
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
