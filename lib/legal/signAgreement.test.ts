import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildSignedAgreement, formatSignedAt, signedDate, type SignatureDetails } from './signAgreement'
import {
  ICA_SIGNATURE_LAYOUT,
  normalizeAddress,
  normalizeOptionalField,
  normalizeSignedName,
  safeReturnPath,
  sha256Hex,
} from './contractorAgreement'

async function blankPdf(pages: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  for (let i = 0; i < pages; i++) pdf.addPage([612, 792])
  return pdf.save()
}
const twoPagePdf = () => blankPdf(2)

const details: SignatureDetails = {
  signatureId: '7f1d9a52-0000-4000-8000-000000000001',
  title: 'Tidy Pro Independent Contractor Agreement',
  version: '2026-11-04',
  documentSha256: 'a'.repeat(64),
  signedName: 'Jordan Rivera',
  businessEntity: null,
  authorizedRepresentative: null,
  address: '123 Peachtree St NE, Atlanta, GA 30303',
  accountName: 'Jordan Rivera',
  accountEmail: 'jordan@example.com',
  signedAt: new Date('2026-11-04T15:30:00Z'),
  timeZone: 'America/New_York',
  ipAddress: '203.0.113.7',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  consentText: 'I have read and agree to the Tidy Pro Independent Contractor Agreement.',
}

describe('buildSignedAgreement', () => {
  it('keeps the original pages and adds one certificate page', async () => {
    const original = await twoPagePdf()
    const signed = await PDFDocument.load(await buildSignedAgreement(original, details))
    expect(signed.getPageCount()).toBe(3)
    expect(signed.getSubject()).toBe('Signed by Jordan Rivera')
    expect(signed.getTitle()).toBe('Tidy Pro Independent Contractor Agreement (signed)')
  })

  it('fills the signature blocks of an agreement-length document', async () => {
    const signed = await PDFDocument.load(
      await buildSignedAgreement(await blankPdf(9), { ...details, businessEntity: 'Rivera Cleaning LLC' }, ICA_SIGNATURE_LAYOUT)
    )
    expect(signed.getPageCount()).toBe(10)
  })

  it("doesn't fail on a name the standard fonts can't draw", async () => {
    const signed = await buildSignedAgreement(await twoPagePdf(), { ...details, signedName: 'Zoë 王 Rivera', userAgent: null })
    expect((await PDFDocument.load(signed)).getPageCount()).toBe(3)
  })
})

describe('formatSignedAt', () => {
  it('gives UTC and the signer’s local time', () => {
    const { utc, local } = formatSignedAt(details.signedAt, 'America/New_York')
    expect(utc).toContain('November 4, 2026')
    expect(utc).toContain('3:30:00')
    expect(local).toContain('10:30:00')
  })

  it('skips local time for an unknown zone', () => {
    expect(formatSignedAt(details.signedAt, 'Not/AZone').local).toBeNull()
  })
})

describe('signedDate', () => {
  it('uses the signer’s calendar date', () => {
    expect(signedDate(new Date('2026-11-05T02:00:00Z'), 'America/New_York')).toBe('November 4, 2026')
    expect(signedDate(new Date('2026-11-05T02:00:00Z'), null)).toBe('November 5, 2026')
  })
})

describe('normalizeAddress and normalizeOptionalField', () => {
  it('needs a real-looking address', () => {
    expect(normalizeAddress(' 123  Peachtree St NE, Atlanta, GA 30303 ')).toBe('123 Peachtree St NE, Atlanta, GA 30303')
    expect(normalizeAddress('Atlanta')).toBeNull()
    expect(normalizeAddress('')).toBeNull()
  })

  it('treats blank optional fields as not applicable and rejects markup', () => {
    expect(normalizeOptionalField('  ')).toBeNull()
    expect(normalizeOptionalField('Rivera Cleaning LLC')).toBe('Rivera Cleaning LLC')
    expect(normalizeOptionalField('<b>x</b>')).toBe(false)
  })
})

describe('normalizeSignedName', () => {
  it('accepts real names and tidies spacing', () => {
    expect(normalizeSignedName('  Mary-Kate   O’Neil ')).toBe('Mary-Kate O’Neil')
    expect(normalizeSignedName('José Álvarez Jr.')).toBe('José Álvarez Jr.')
  })

  it('rejects blanks, single letters, and anything that isn’t a name', () => {
    expect(normalizeSignedName('')).toBeNull()
    expect(normalizeSignedName('J')).toBeNull()
    expect(normalizeSignedName('<script>')).toBeNull()
    expect(normalizeSignedName('Jordan 3')).toBeNull()
    expect(normalizeSignedName(undefined)).toBeNull()
  })
})

describe('safeReturnPath', () => {
  it('only allows Pro pages outside onboarding', () => {
    expect(safeReturnPath('/pro/dashboard')).toBe('/pro/dashboard')
    expect(safeReturnPath('/pro/onboarding/setup')).toBeNull()
    expect(safeReturnPath('https://evil.example')).toBeNull()
    expect(safeReturnPath('//evil.example/pro/')).toBeNull()
  })
})

describe('sha256Hex', () => {
  it('hashes bytes to hex', () => {
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
