'use client'

import { COUNTRY_DIAL_CODES, findCountry } from '@/lib/countryDialCodes'

type Props = {
  // An ISO code from COUNTRY_DIAL_CODES, e.g. 'US'.
  country: string
  onCountryChange?: (value: string) => void
  number: string
  onNumberChange?: (value: string) => void
  className?: string
}

// A country-code dropdown beside a phone number field. They're separate so
// clearing the number doesn't drop the country code; lib/phoneParts joins
// them into one +<code><number> string. Without handlers it's read-only.
export default function PhoneWithCountryInput({ country, onCountryChange, number, onNumberChange, className = '' }: Props) {
  const selected = findCountry(country)
  return (
    <div className={`flex gap-2 ${className}`}>
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
        value={number}
        onChange={(e) => onNumberChange?.(e.target.value)}
        readOnly={!onNumberChange}
        placeholder="Mobile phone number"
        className="flex-1 min-w-0 rounded-xl border border-slate-200 px-4 py-2.5 text-sm"
      />
    </div>
  )
}
