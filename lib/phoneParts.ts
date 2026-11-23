import { COUNTRY_DIAL_CODES, DEFAULT_COUNTRY, findCountry } from '@/lib/countryDialCodes'

// Splits a saved phone into a country (from the dropdown list) and the rest,
// for forms that show them as two fields so clearing the number doesn't also
// clear the country code. Phones are saved as typed, so a number without a
// leading + is read as a US number. A +number is matched to the longest dial
// code in the list; one that matches none is left whole in the number field.
export function splitPhone(raw: string | null | undefined): { country: string; number: string } {
  const trimmed = raw?.trim() ?? ''
  if (!trimmed) return { country: DEFAULT_COUNTRY, number: '' }
  const digits = trimmed.replace(/\D/g, '')
  if (!trimmed.startsWith('+')) {
    if (digits.length === 11 && digits.startsWith('1')) return { country: DEFAULT_COUNTRY, number: digits.slice(1) }
    return { country: DEFAULT_COUNTRY, number: trimmed }
  }
  // The list's order breaks ties between countries sharing a code (US for +1).
  let match: { iso: string; dial: string } | null = null
  for (const c of COUNTRY_DIAL_CODES) {
    if (digits.startsWith(c.dial) && digits.length - c.dial.length >= 4 && (!match || c.dial.length > match.dial.length)) match = c
  }
  if (!match) return { country: DEFAULT_COUNTRY, number: trimmed }
  return { country: match.iso, number: digits.slice(match.dial.length) }
}

// Joins the two fields into one +<code><number> string. A number typed with
// its own leading + already carries its country code and is kept as is.
// Returns null for a country that isn't in the list.
export function joinPhone(country: string, number: string): string | null {
  const trimmed = number.trim()
  if (trimmed.startsWith('+')) return `+${trimmed.replace(/\D/g, '')}`
  const dial = findCountry(country)?.dial
  if (!dial) return null
  return `+${dial}${trimmed.replace(/\D/g, '')}`
}

// A saved phone as shown in a plain phone field: the number without its
// country code, so "+15551234567" shows as "(555) 123-4567". Editing a field
// that starts with "+1" is how Tidy Pros ended up saving invalid numbers.
// The country code lives on the SMS opt-in pop-up (PhoneWithCountryInput).
export function localPhone(raw: string | null | undefined): string {
  const { country, number } = splitPhone(raw)
  const digits = number.replace(/\D/g, '')
  if (country !== DEFAULT_COUNTRY || number.startsWith('+') || digits.length !== 10) return number
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

// For phone fields with no country-code picker (signup): drops a leading "+"
// or "+1", and the 1 from an 11-digit "1 555 123 4567", as the number is
// typed or autofilled. A Tidy Pro once typed a number that couldn't be used
// because autofill put "+1" in front of it.
export function withoutCountryCode(value: string): string {
  const stripped = value.replace(/^\s*\+\s*1?[\s.-]*/, '')
  const digits = stripped.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return stripped.replace(/^\s*1[\s.-]*/, '')
  return stripped
}
