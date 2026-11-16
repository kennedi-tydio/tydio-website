import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { TYDIO_ADMIN_EMAIL, emailShell, escapeHtml, sendEmail } from '@/lib/email'
import { userFacingError } from '@/lib/userFacingError'
import { ICA_TITLE, ICA_VERSION, SIGNED_AGREEMENTS_BUCKET, sha256Hex } from './contractorAgreement'
import { buildSignedAgreement, signedDate, type PartialSignatureLayout } from './signAgreement'

// Server-side only.
//
// Amendments to the Independent Contractor Agreement that named Tidy Pros sign in the
// app, without re-signing the whole agreement. Tydio's signature and date are already
// in the amendment PDF. Each signature is a row in agreement_signatures with the
// amendment's `version`, so it sits next to the agreement signature it amends (the
// unique index is per pro and version).

type Admin = ReturnType<typeof createAdminClient>

export type AgreementAmendment = {
  version: string
  number: number
  title: string
  consentText: string
  // Who it applies to. Each signer gets their own copy of the amendment naming only
  // them, so no one sees another Tidy Pro's name or signature. `layout` is where their
  // signature and date lines are in that copy.
  signers: Record<string, { legalName: string; file: string; layout: PartialSignatureLayout; test?: boolean }>
}

const AMENDMENT_1_TITLE = `Amendment No. 1 to the ${ICA_TITLE}`
const legalFile = (name: string) => path.join(process.cwd(), 'lib', 'legal', name)

// Both copies share one layout: the signature page (page 3, 0-based index 2) is laid
// out at fixed positions by scripts/build-amendment-1-pdfs.mjs, which builds the PDFs.
// Change both together.
const AMENDMENT_1_LAYOUT: PartialSignatureLayout = {
  providerSignature: { page: 2, x: 216, y: 396 },
  providerDate: { page: 2, x: 216, y: 374 },
}

// Two Schedule A changes, for the two Tidy Pros who signed the agreement before them,
// each in a copy naming only them: the no-access wait (15 to 10 minutes, 2026-11-14),
// and late customer cancellations (12 hours / 40% of the Service Price to the Tidy Pro,
// now 2 hours / still 50% of their payout, i.e. 40% of the Service Price, 2026-11-16). The late-cancel change was folded in because neither
// had signed No. 1 yet; a Tidy Pro who has already signed an amendment gets any later
// change as a new amendment instead, since their signed copy can't change. Tydio's
// signature and date are already in each PDF.
export const AMENDMENT_1: AgreementAmendment = {
  version: `${ICA_VERSION}+amendment-1`,
  number: 1,
  title: AMENDMENT_1_TITLE,
  consentText:
    `I have read and agree to ${AMENDMENT_1_TITLE}. By checking this box and selecting Agree and Continue, ` +
    'I intend to sign this Amendment electronically.',
  signers: {
    '160e087e-70f6-4d2b-8876-ea9d59367c90': {
      legalName: 'Charonda Winfield',
      file: legalFile('amendment-1-charonda.pdf'),
      layout: AMENDMENT_1_LAYOUT,
    },
    '478e7d80-f3b7-4668-a891-2e9290573bd8': {
      legalName: 'LaShauna Young',
      file: legalFile('amendment-1-lashauna.pdf'),
      layout: AMENDMENT_1_LAYOUT,
    },
    // Kennedi's Tidy Pro test account, to try the signing flow and the admin status.
    // Left out of "still to sign" in the admin email.
    '853ac2a7-a148-4521-bf4a-b250319abc8e': {
      legalName: 'Kennedi Coats',
      file: legalFile('amendment-1-test.pdf'),
      layout: AMENDMENT_1_LAYOUT,
      test: true,
    },
  },
}

export const AMENDMENTS: AgreementAmendment[] = [AMENDMENT_1]
export const AMENDMENT_PATH = '/pro/onboarding/amendment'

// This Tidy Pro's own copy, or null if the amendment doesn't name them.
export async function readAmendmentPdf(amendment: AgreementAmendment, profileId: string): Promise<Uint8Array | null> {
  const signer = amendment.signers[profileId]
  return signer ? new Uint8Array(await readFile(signer.file)) : null
}

async function amendmentSignature(admin: Admin, profileId: string, amendment: AgreementAmendment) {
  const { data } = await admin
    .from('agreement_signatures')
    .select('id, signed_at, signed_pdf_path')
    .eq('pro_id', profileId)
    .eq('agreement_version', amendment.version)
    .maybeSingle()
  return data
}

export type AmendmentStatus = {
  number: number
  title: string
  signatureId: string | null
  signedAt: string | null
}

// For the admin: every amendment naming each of these Tidy Pros, and whether they've
// signed it (with the signature, to open their signed copy).
export async function amendmentStatuses(admin: Admin, proIds: string[]): Promise<Map<string, AmendmentStatus[]>> {
  const statuses = new Map<string, AmendmentStatus[]>()
  const named = proIds.filter((id) => AMENDMENTS.some((a) => a.signers[id]))
  if (named.length === 0) return statuses

  const { data, error } = await admin
    .from('agreement_signatures')
    .select('id, pro_id, agreement_version, signed_at')
    .in('pro_id', named)
    .in('agreement_version', AMENDMENTS.map((a) => a.version))
  if (error) throw new Error(`Failed to load amendment signatures: ${error.message}`)
  const signed = new Map((data ?? []).map((s) => [`${s.pro_id}|${s.agreement_version}`, s]))

  for (const proId of named) {
    statuses.set(
      proId,
      AMENDMENTS.filter((a) => a.signers[proId]).map((a) => {
        const signature = signed.get(`${proId}|${a.version}`)
        return { number: a.number, title: a.title, signatureId: signature?.id ?? null, signedAt: signature?.signed_at ?? null }
      })
    )
  }
  return statuses
}

// The first amendment naming this Tidy Pro that they haven't signed yet.
export async function pendingAmendment(admin: Admin, profileId: string): Promise<AgreementAmendment | null> {
  for (const amendment of AMENDMENTS) {
    if (!amendment.signers[profileId]) continue
    if (!(await amendmentSignature(admin, profileId, amendment))) return amendment
  }
  return null
}

// For Pro pages outside onboarding, after the agreement itself is signed.
export async function requireSignedAmendments(profileId: string, returnTo: string): Promise<void> {
  if (await pendingAmendment(createAdminClient(), profileId)) {
    redirect(`${AMENDMENT_PATH}?next=${encodeURIComponent(returnTo)}`)
  }
}

export async function signAmendment(
  admin: Admin,
  profileId: string,
  amendment: AgreementAmendment,
  signedName: string,
  request: { ipAddress: string | null; userAgent: string | null }
): Promise<{ signatureId: string; alreadySigned: boolean } | { error: string }> {
  const signer = amendment.signers[profileId]
  if (!signer) return { error: 'This amendment doesn’t apply to your account.' }

  const existing = await amendmentSignature(admin, profileId, amendment)
  if (existing) return { signatureId: existing.id, alreadySigned: true }

  // The address and business entity come from the agreement signature this amends.
  const [{ data: profile }, { data: tidyPro }, { data: agreement }] = await Promise.all([
    admin.from('profiles').select('email, first_name, last_name').eq('id', profileId).maybeSingle(),
    admin.from('tidypro_profiles').select('time_zone').eq('id', profileId).maybeSingle(),
    admin
      .from('agreement_signatures')
      .select('address, business_entity, authorized_representative')
      .eq('pro_id', profileId)
      .eq('agreement_version', ICA_VERSION)
      .maybeSingle(),
  ])
  if (!profile) return { error: 'Account not found.' }
  if (!agreement) return { error: 'Sign the contractor agreement first.' }

  const original = await readAmendmentPdf(amendment, profileId)
  if (!original) return { error: 'This amendment doesn’t apply to your account.' }
  const documentSha256 = sha256Hex(original)
  const signatureId = randomUUID()
  const signedAt = new Date()
  const accountName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || null

  const signed = await buildSignedAgreement(
    original,
    {
      signatureId,
      title: amendment.title,
      version: amendment.version,
      documentSha256,
      signedName,
      businessEntity: agreement.business_entity,
      authorizedRepresentative: agreement.authorized_representative,
      address: agreement.address,
      accountName,
      accountEmail: profile.email,
      signedAt,
      timeZone: tidyPro?.time_zone ?? null,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
      consentText: amendment.consentText,
      certificateNote:
        'The signer reviewed the amendment above and signed it electronically in the Tydio app by typing their ' +
        'name, checking the acceptance box, and selecting “Agree and Continue.” Tydio LLC’s signature and date were ' +
        'applied to the amendment by its authorized representative before it was presented. The SHA-256 value ' +
        'identifies the exact amendment document presented at the time of signing, including Tydio LLC’s ' +
        'signature. A copy of this signed amendment was emailed to the signer and to Tydio LLC.',
    },
    signer.layout
  )

  const filePath = `${signatureId}.pdf`
  const { error: uploadError } = await admin.storage
    .from(SIGNED_AGREEMENTS_BUCKET)
    .upload(filePath, signed, { contentType: 'application/pdf', upsert: false })
  if (uploadError) return { error: 'We couldn’t save your signed amendment. Please try again.' }

  const { error: insertError } = await admin.from('agreement_signatures').insert({
    id: signatureId,
    pro_id: profileId,
    agreement_version: amendment.version,
    document_sha256: documentSha256,
    signed_name: signedName,
    business_entity: agreement.business_entity,
    authorized_representative: agreement.authorized_representative,
    address: agreement.address,
    account_name: accountName,
    account_email: profile.email,
    ip_address: request.ipAddress,
    user_agent: request.userAgent,
    consent_text: amendment.consentText,
    signed_pdf_path: filePath,
    signed_at: signedAt.toISOString(),
  })
  if (insertError) {
    await admin.storage.from(SIGNED_AGREEMENTS_BUCKET).remove([filePath])
    // A second tab signing at the same moment hits the unique index; theirs counts.
    const raced = await amendmentSignature(admin, profileId, amendment)
    if (raced) return { signatureId: raced.id, alreadySigned: true }
    return { error: 'We couldn’t record your signature. Please try again.' }
  }

  return { signatureId, alreadySigned: false }
}

// Emails the signed amendment to the Tidy Pro, with Tydio on bcc.
export async function emailSignedAmendment(
  admin: Admin,
  amendment: AgreementAmendment,
  signatureId: string
): Promise<{ success: true } | { error: string }> {
  const { data: signature } = await admin
    .from('agreement_signatures')
    .select('id, pro_id, signed_name, account_email, signed_at, signed_pdf_path')
    .eq('id', signatureId)
    .maybeSingle()
  if (!signature) return { error: 'Signature not found.' }

  const { data: file, error: downloadError } = await admin.storage.from(SIGNED_AGREEMENTS_BUCKET).download(signature.signed_pdf_path)
  if (downloadError || !file) return { error: 'Signed amendment file not found.' }
  const content = Buffer.from(await file.arrayBuffer()).toString('base64')

  let timeZone: string | null = null
  if (signature.pro_id) {
    const { data: tidyPro } = await admin.from('tidypro_profiles').select('time_zone').eq('id', signature.pro_id).maybeSingle()
    timeZone = tidyPro?.time_zone ?? null
  }
  const date = signedDate(new Date(signature.signed_at), timeZone)
  const fileName = `Tydio-Agreement-Amendment-${amendment.number}-${signature.signed_name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'Provider'}-${signature.signed_at.slice(0, 10)}.pdf`

  try {
    await sendEmail({
      to: [{ email: signature.account_email, name: signature.signed_name }],
      bcc: signature.account_email.toLowerCase() === TYDIO_ADMIN_EMAIL ? undefined : [{ email: TYDIO_ADMIN_EMAIL }],
      subject: `Your signed ${amendment.title}`,
      htmlContent: emailShell(`
        <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">Your signed amendment</h2>
        <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
          Hi ${escapeHtml(signature.signed_name)}, thanks for signing ${escapeHtml(amendment.title)}. Your signed copy
          is attached. Please keep it with your agreement.
        </p>
        <table style="font-size:14px;color:#475569;line-height:1.6;">
          <tr><td style="padding-right:16px;color:#94a3b8;">Signed</td><td>${escapeHtml(date)}</td></tr>
          <tr><td style="padding-right:16px;color:#94a3b8;">Reference</td><td>${escapeHtml(signature.id)}</td></tr>
        </table>
      `),
      attachment: [{ name: fileName, content }],
    })
  } catch (err) {
    console.error(`Signed amendment email for ${signatureId} failed`, err)
    return { error: userFacingError(err, 'Email failed.') }
  }

  await admin.from('agreement_signatures').update({ emailed_at: new Date().toISOString() }).eq('id', signatureId)
  return { success: true }
}

// Tells Tydio a Tidy Pro signed an amendment, separately from the bcc on their signed
// copy, so it stands out in the inbox.
export async function notifyAdminAmendmentSigned(
  admin: Admin,
  amendment: AgreementAmendment,
  signatureId: string
): Promise<void> {
  const { data: signature } = await admin
    .from('agreement_signatures')
    .select('id, pro_id, signed_name, business_entity, account_email, signed_at')
    .eq('id', signatureId)
    .maybeSingle()
  if (!signature) return

  const outstanding: string[] = []
  for (const [proId, signer] of Object.entries(amendment.signers)) {
    if (signer.test || proId === signature.pro_id) continue
    if (!(await amendmentSignature(admin, proId, amendment))) outstanding.push(signer.legalName)
  }
  const date = signedDate(new Date(signature.signed_at), 'America/New_York')
  const row = (label: string, value: string) =>
    `<tr><td style="padding-right:16px;color:#94a3b8;">${label}</td><td>${escapeHtml(value)}</td></tr>`

  await sendEmail({
    to: [{ email: TYDIO_ADMIN_EMAIL }],
    subject: `${signature.signed_name} signed ${amendment.title}`,
    htmlContent: emailShell(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">Amendment signed</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
        ${escapeHtml(signature.signed_name)} signed ${escapeHtml(amendment.title)}. Their signed copy was emailed to
        them, with you on bcc.
      </p>
      <table style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 16px;">
        ${row('Signed', date)}
        ${row('Business entity', signature.business_entity ?? 'N/A')}
        ${row('Email', signature.account_email)}
        ${row('Reference', signature.id)}
      </table>
      <p style="margin:0;font-size:14px;color:#475569;line-height:1.6;">
        ${outstanding.length === 0 ? 'Everyone named in this amendment has now signed it.' : `Still to sign: ${escapeHtml(outstanding.join(', '))}.`}
      </p>
    `),
  })
}
