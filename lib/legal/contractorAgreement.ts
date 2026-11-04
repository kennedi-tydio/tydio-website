import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SignatureLayout } from './signAgreement'

// Server-side only — reads the agreement from disk.
//
// The Independent Contractor Agreement every Tidy Pro e-signs on
// /pro/onboarding/agreements. To publish a new version, replace the PDF and bump
// ICA_VERSION: everyone who signed an older version is sent back to sign again
// (see requireCurrentAgreement).
export const ICA_VERSION = '2026-11-04.2'
export const ICA_TITLE = 'Tidy Pro Independent Contractor and Platform Agreement'
export const ICA_FILE = path.join(process.cwd(), 'lib', 'legal', 'independent-contractor-agreement.pdf')
export const SIGNED_AGREEMENTS_BUCKET = 'signed-agreements'

// The acceptance text from Section 14 of the agreement, word for word. Shown next to
// the checkbox and stored with each signature, so the record holds exactly what the
// cleaner agreed to.
export const ICA_CONSENT_TEXT =
  `I have read and agree to the ${ICA_TITLE}, including Schedule A. By checking this box and selecting Agree and ` +
  'Continue, I intend to sign this Agreement electronically.'

// The signature blocks in the agreement PDF: Tydio's date line (the PDF already
// carries Tydio's handwritten signature) and the Provider block, both on page 9
// (0-based page index 8). Each spot sits just past the printed label, on its
// underscore line, as measured from the PDF's text positions. Re-measure if the
// PDF changes.
export const ICA_SIGNATURE_LAYOUT: SignatureLayout = {
  tydioDate: { page: 8, x: 88, y: 418 },
  providerLegalName: { page: 8, x: 118, y: 365 },
  providerBusinessEntity: { page: 8, x: 190, y: 338 },
  providerAuthorizedRepresentative: { page: 8, x: 241, y: 311 },
  providerAddress: { page: 8, x: 103, y: 284 },
  providerEmail: { page: 8, x: 92, y: 257 },
  providerSignature: { page: 8, x: 110, y: 230 },
  providerDate: { page: 8, x: 88, y: 203 },
}

export async function readAgreementPdf(): Promise<Uint8Array> {
  return new Uint8Array(await readFile(ICA_FILE))
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

// A legal name as typed: letters (accented ones too), spaces, hyphens, apostrophes
// and periods, with at least two letters. Returns the trimmed name or null.
export function normalizeSignedName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim().replace(/\s+/g, ' ')
  if (name.length > 100) return null
  if (!/^[\p{L}][\p{L} .'’-]*$/u.test(name)) return null
  if ((name.match(/\p{L}/gu) ?? []).length < 2) return null
  return name
}

// The optional "if applicable" fields: blank means not applicable.
export function normalizeOptionalField(value: unknown, max = 120): string | null | false {
  if (typeof value !== 'string') return null
  const text = value.trim().replace(/\s+/g, ' ')
  if (!text) return null
  if (text.length > max || /[<>]/.test(text)) return false
  return text
}

export function normalizeAddress(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim().replace(/\s+/g, ' ')
  if (text.length < 8 || text.length > 200 || /[<>]/.test(text) || !/\d/.test(text) || !/\p{L}/u.test(text)) return null
  return text
}

type Admin = ReturnType<typeof createAdminClient>

export async function currentAgreementSignature(admin: Admin, profileId: string) {
  const { data } = await admin
    .from('agreement_signatures')
    .select('id, signed_at, signed_pdf_path, emailed_at')
    .eq('pro_id', profileId)
    .eq('agreement_version', ICA_VERSION)
    .maybeSingle()
  return data
}

export async function hasSignedCurrentAgreement(admin: Admin, profileId: string): Promise<boolean> {
  return (await currentAgreementSignature(admin, profileId)) != null
}

// For Pro pages outside onboarding: anyone who hasn't signed the current version
// signs it first, then comes back to `returnTo`. Onboarding pages check this
// themselves, so the agreements page can never redirect to itself.
export async function requireCurrentAgreement(profileId: string, returnTo: string): Promise<void> {
  if (!(await hasSignedCurrentAgreement(createAdminClient(), profileId))) {
    redirect(`/pro/onboarding/agreements?next=${encodeURIComponent(returnTo)}`)
  }
}

// Only same-site Pro paths, so ?next= can't send anyone off-site after signing.
export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/pro/') || value.startsWith('//')) return null
  if (value.startsWith('/pro/onboarding')) return null
  return value
}
