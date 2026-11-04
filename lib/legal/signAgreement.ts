import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

export type SignatureDetails = {
  signatureId: string
  title: string
  version: string
  documentSha256: string
  signedName: string
  businessEntity: string | null
  authorizedRepresentative: string | null
  address: string
  accountName: string | null
  accountEmail: string
  signedAt: Date
  timeZone: string | null
  ipAddress: string | null
  userAgent: string | null
  consentText: string
}

// Where the agreement's own signature blocks are, in PDF points from the bottom-left
// of the page, measured against the agreement file. `x` is where the filled-in
// text starts, just past the printed label.
export type FieldSpot = { page: number; x: number; y: number }
export type SignatureLayout = {
  providerLegalName: FieldSpot
  providerBusinessEntity: FieldSpot
  providerAuthorizedRepresentative: FieldSpot
  providerAddress: FieldSpot
  providerEmail: FieldSpot
  providerSignature: FieldSpot
  providerDate: FieldSpot
  tydioDate: FieldSpot
}

const INK = rgb(0.1, 0.14, 0.2)
const MUTED = rgb(0.4, 0.45, 0.52)
const BRAND = rgb(0.22, 0.78, 0.79)

// Standard PDF fonts only cover Windows-1252, so anything outside it (a name in
// another script, an emoji in a user agent) is swapped for "?" rather than
// failing the whole signature.
function encodable(font: PDFFont, text: string): string {
  return Array.from(text)
    .map((ch) => {
      try {
        font.encodeText(ch)
        return ch
      } catch {
        return '?'
      }
    })
    .join('')
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of encodable(font, text).split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate
      continue
    }
    if (line) lines.push(line)
    // A single word wider than the line (a long hash or user agent) is broken by character.
    let rest = word
    while (font.widthOfTextAtSize(rest, size) > maxWidth) {
      let cut = rest.length - 1
      while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--
      lines.push(rest.slice(0, cut))
      rest = rest.slice(cut)
    }
    line = rest
  }
  if (line) lines.push(line)
  return lines
}

export function formatSignedAt(date: Date, timeZone: string | null): { utc: string; local: string | null } {
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  }
  const utc = new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(date)
  let local: string | null = null
  if (timeZone && timeZone !== 'UTC') {
    try {
      local = new Intl.DateTimeFormat('en-US', { ...options, timeZone }).format(date)
    } catch {
      local = null
    }
  }
  return { utc, local }
}

// The agreement as signed: the original pages, each with a one-line signature
// footer, followed by a Signature Certificate page recording who signed, when, from
// where, and a hash tying it to the exact document they were shown.
export async function buildSignedAgreement(
  original: Uint8Array,
  details: SignatureDetails,
  layout?: SignatureLayout
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(original)
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const signatureFont = await pdf.embedFont(StandardFonts.TimesRomanItalic)
  const { utc, local } = formatSignedAt(details.signedAt, details.timeZone)

  const footer = encodable(
    regular,
    `Signed electronically by ${details.signedName} on ${utc} · Ref ${details.signatureId}`
  )
  for (const page of pdf.getPages()) {
    const { width } = page.getSize()
    page.drawText(footer, { x: 36, y: 16, size: 7, font: regular, color: MUTED, maxWidth: width - 72 })
  }

  if (layout) fillSignatureBlocks(pdf.getPages(), { regular, signatureFont }, details, layout)

  const page = pdf.addPage([612, 792])
  drawCertificate(page, { regular, bold, signatureFont }, details, utc, local)

  pdf.setTitle(`${details.title} (signed)`)
  pdf.setSubject(`Signed by ${details.signedName}`)
  pdf.setModificationDate(details.signedAt)
  return pdf.save()
}

// The calendar date of signing as the signer saw it, used on both date lines.
export function signedDate(date: Date, timeZone: string | null): string {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' }
  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: timeZone ?? 'UTC' }).format(date)
  } catch {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(date)
  }
}

function fillSignatureBlocks(
  pages: PDFPage[],
  fonts: { regular: PDFFont; signatureFont: PDFFont },
  details: SignatureDetails,
  layout: SignatureLayout
) {
  const date = signedDate(details.signedAt, details.timeZone)
  const put = (spot: FieldSpot, text: string, font = fonts.regular, size = 10) => {
    const page = pages[spot.page]
    if (!page) return
    page.drawText(encodable(font, text), { x: spot.x, y: spot.y, size, font, color: INK, maxWidth: page.getSize().width - spot.x - 36 })
  }
  put(layout.providerLegalName, details.signedName)
  put(layout.providerBusinessEntity, details.businessEntity ?? 'N/A')
  put(layout.providerAuthorizedRepresentative, details.authorizedRepresentative ?? 'N/A')
  put(layout.providerAddress, details.address, fonts.regular, details.address.length > 60 ? 8 : 10)
  put(layout.providerEmail, details.accountEmail)
  put(layout.providerSignature, `/s/ ${details.signedName}`, fonts.signatureFont, 14)
  put(layout.providerDate, date)
  put(layout.tydioDate, date)
}

function drawCertificate(
  page: PDFPage,
  fonts: { regular: PDFFont; bold: PDFFont; signatureFont: PDFFont },
  details: SignatureDetails,
  utc: string,
  local: string | null
) {
  const { regular, bold, signatureFont } = fonts
  const left = 56
  const width = page.getSize().width - left * 2
  let y = 736

  page.drawRectangle({ x: 0, y: 772, width: page.getSize().width, height: 20, color: BRAND })
  page.drawText('Signature Certificate', { x: left, y, size: 20, font: bold, color: INK })
  y -= 22
  for (const line of wrap(regular, details.title, 11, width)) {
    page.drawText(line, { x: left, y, size: 11, font: regular, color: MUTED })
    y -= 15
  }
  y -= 18

  page.drawText('Electronically signed by', { x: left, y, size: 9, font: regular, color: MUTED })
  y -= 30
  page.drawText(encodable(signatureFont, details.signedName), { x: left, y, size: 26, font: signatureFont, color: INK })
  y -= 10
  page.drawLine({ start: { x: left, y }, end: { x: left + 300, y }, thickness: 0.75, color: MUTED })
  y -= 28

  const rows: [string, string][] = [
    ['Typed legal name', details.signedName],
    ...(details.businessEntity ? ([['Business entity', details.businessEntity]] as [string, string][]) : []),
    ...(details.authorizedRepresentative
      ? ([['Authorized representative', details.authorizedRepresentative]] as [string, string][])
      : []),
    ['Address', details.address],
    ['Account name', details.accountName ?? '—'],
    ['Account email', details.accountEmail],
    ['Signed (UTC)', utc],
    ...(local ? ([['Signed (local time)', local]] as [string, string][]) : []),
    ['IP address', details.ipAddress ?? 'Not available'],
    ['Browser', details.userAgent ?? 'Not available'],
    ['Agreement version', details.version],
    ['Document SHA-256', details.documentSha256],
    ['Signature reference', details.signatureId],
  ]
  const labelWidth = 130
  for (const [label, value] of rows) {
    page.drawText(label, { x: left, y, size: 9, font: bold, color: INK })
    const lines = wrap(regular, value, 9, width - labelWidth)
    lines.forEach((line, i) => {
      page.drawText(line, { x: left + labelWidth, y: y - i * 12, size: 9, font: regular, color: INK })
    })
    y -= Math.max(1, lines.length) * 12 + 8
  }

  y -= 10
  page.drawText('Statement agreed to', { x: left, y, size: 9, font: bold, color: INK })
  y -= 14
  for (const line of wrap(regular, details.consentText, 9, width)) {
    page.drawText(line, { x: left, y, size: 9, font: regular, color: INK })
    y -= 12
  }

  y -= 16
  const note =
    'The signer reviewed the agreement above and signed it electronically in the Tydio app by typing their name, ' +
    'checking the acceptance box, and selecting “Agree and Continue.” Tydio LLC’s signature and date were applied ' +
    'by its authorized representative’s standing execution of this agreement version. The SHA-256 value ' +
    'identifies the exact agreement document presented at the time of signing. A copy of this signed agreement ' +
    'was emailed to the signer and to Tydio LLC.'
  for (const line of wrap(regular, note, 8, width)) {
    page.drawText(line, { x: left, y, size: 8, font: regular, color: MUTED })
    y -= 11
  }
}
