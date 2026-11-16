// Customers and Tidy Pros talk through Tydio's chat and masked calls only, so a message
// carrying a phone number or email address is refused. Catches the usual ways people slip
// one past a filter: spaces or dots between digits, spelled-out digits ("four oh four"),
// and "name at gmail dot com".

export type ContactInfoKind = 'phone' | 'email'

export const CONTACT_INFO_BLOCKED_MESSAGE =
  'For everyone’s safety, phone numbers and email addresses can’t be shared in chat. Keep talking here, or use the Call button. Your number stays private.'

const DIGIT_WORDS: Record<string, string> = {
  zero: '0',
  oh: '0',
  o: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
}

// Spelled-out digits become digits so "four zero four five five five..." reads as a number.
// A lone "one" or "oh" in a sentence is harmless: it only matters inside a run of ten.
function spelledDigitsToNumbers(text: string): string {
  return text.replace(/\b(zero|oh|o|one|two|three|four|five|six|seven|eight|nine)\b/gi, (word) => DIGIT_WORDS[word.toLowerCase()])
}

// Digits with only spacing or phone punctuation between them. Colons and slashes aren't
// allowed, so times ("10:30-12:30") and dates ("11/14/2026") don't count.
const DIGIT_RUN = /\+?\d(?:[\s().\-_*]{0,3}\d)+/g

function hasPhoneNumber(text: string): boolean {
  const normalized = spelledDigitsToNumbers(text)
  for (const match of normalized.match(DIGIT_RUN) ?? []) {
    const digits = match.replace(/\D/g, '')
    // A full US number, with or without the leading 1, or an international one.
    if (digits.length >= 10 && digits.length <= 15) return true
  }
  // A local number written the usual way: 555-1234 or 555.1234.
  return /(?<![\d$])\d{3}[-.]\d{4}(?!\d)/.test(normalized)
}

const EMAIL = /[a-z0-9._%+-]+\s*@\s*[a-z0-9-]+(?:\s*\.\s*[a-z0-9-]+)*\s*\.\s*[a-z]{2,}/i
const OBFUSCATED_EMAIL =
  /[a-z0-9._%+-]+\s*(?:\(at\)|\[at\]|\{at\}|\bat\b)\s*[a-z0-9-]+\s*(?:\(dot\)|\[dot\]|\{dot\}|\bdot\b|\.)\s*(?:com|net|org|edu|gov|io|co|us|me|info|biz)\b/i
// The big providers with the domain ending left off, e.g. "jane.doe at gmail".
const PROVIDER = /[a-z0-9._%+-]{3,}\s*(?:@|\bat\b)\s*(?:gmail|yahoo|hotmail|outlook|icloud|aol|protonmail)\b/i

function hasEmailAddress(text: string): boolean {
  return EMAIL.test(text) || OBFUSCATED_EMAIL.test(text) || PROVIDER.test(text)
}

export function detectContactInfo(text: string): ContactInfoKind | null {
  if (hasEmailAddress(text)) return 'email'
  if (hasPhoneNumber(text)) return 'phone'
  return null
}
