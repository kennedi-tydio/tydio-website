'use client'

import Image from 'next/image'
import Link from 'next/link'

type Props = {
  titleId?: string
  // Shown only when we don't already have a number on file.
  showPhone: boolean
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
export default function SmsOptInPrompt({ titleId, showPhone, phone, onPhoneChange, error, working, onRespond }: Props) {
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
      {showPhone && (
        <input
          aria-label="Mobile phone number"
          type="tel"
          value={phone}
          onChange={(e) => onPhoneChange?.(e.target.value)}
          readOnly={!onPhoneChange}
          placeholder="Mobile phone number"
          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm mb-3"
        />
      )}
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
