import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { TYDIO_ADMIN_EMAIL, emailShell, escapeHtml, sendEmail } from '@/lib/email'
import {
  ICA_CONSENT_TEXT,
  ICA_SIGNATURE_LAYOUT,
  ICA_TITLE,
  ICA_VERSION,
  SIGNED_AGREEMENTS_BUCKET,
  readAgreementPdf,
  sha256Hex,
} from './contractorAgreement'
import { buildSignedAgreement, signedDate } from './signAgreement'
import { userFacingError } from '@/lib/userFacingError'

// Server-side only.

type Admin = ReturnType<typeof createAdminClient>

export type ProviderFields = {
  signedName: string
  businessEntity: string | null
  authorizedRepresentative: string | null
  address: string
}

// Signs the current agreement version for a Tidy Pro: builds the signed PDF, stores
// it privately, and records the signature. Signing a version they've already signed
// returns the existing signature rather than making a second one.
export async function signCurrentAgreement(
  admin: Admin,
  profileId: string,
  fields: ProviderFields,
  request: { ipAddress: string | null; userAgent: string | null }
): Promise<{ signatureId: string; alreadySigned: boolean } | { error: string }> {
  const { data: existing } = await admin
    .from('agreement_signatures')
    .select('id')
    .eq('pro_id', profileId)
    .eq('agreement_version', ICA_VERSION)
    .maybeSingle()
  if (existing) return { signatureId: existing.id, alreadySigned: true }

  const [{ data: profile }, { data: tidyPro }] = await Promise.all([
    admin.from('profiles').select('email, first_name, last_name').eq('id', profileId).maybeSingle(),
    admin.from('tidypro_profiles').select('time_zone').eq('id', profileId).maybeSingle(),
  ])
  if (!profile) return { error: 'Account not found.' }

  const original = await readAgreementPdf()
  const documentSha256 = sha256Hex(original)
  const signatureId = randomUUID()
  const signedAt = new Date()
  const accountName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || null

  const signed = await buildSignedAgreement(
    original,
    {
      signatureId,
      title: ICA_TITLE,
      version: ICA_VERSION,
      documentSha256,
      ...fields,
      accountName,
      accountEmail: profile.email,
      signedAt,
      timeZone: tidyPro?.time_zone ?? null,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
      consentText: ICA_CONSENT_TEXT,
    },
    ICA_SIGNATURE_LAYOUT
  )

  const path = `${signatureId}.pdf`
  const { error: uploadError } = await admin.storage
    .from(SIGNED_AGREEMENTS_BUCKET)
    .upload(path, signed, { contentType: 'application/pdf', upsert: false })
  if (uploadError) return { error: 'We couldn’t save your signed agreement. Please try again.' }

  const { error: insertError } = await admin.from('agreement_signatures').insert({
    id: signatureId,
    pro_id: profileId,
    agreement_version: ICA_VERSION,
    document_sha256: documentSha256,
    signed_name: fields.signedName,
    business_entity: fields.businessEntity,
    authorized_representative: fields.authorizedRepresentative,
    address: fields.address,
    account_name: accountName,
    account_email: profile.email,
    ip_address: request.ipAddress,
    user_agent: request.userAgent,
    consent_text: ICA_CONSENT_TEXT,
    signed_pdf_path: path,
    signed_at: signedAt.toISOString(),
  })
  if (insertError) {
    await admin.storage.from(SIGNED_AGREEMENTS_BUCKET).remove([path])
    // A second tab signing at the same moment hits the unique index; theirs counts.
    const { data: raced } = await admin
      .from('agreement_signatures')
      .select('id')
      .eq('pro_id', profileId)
      .eq('agreement_version', ICA_VERSION)
      .maybeSingle()
    if (raced) return { signatureId: raced.id, alreadySigned: true }
    return { error: 'We couldn’t record your signature. Please try again.' }
  }

  return { signatureId, alreadySigned: false }
}

function attachmentName(signedName: string, signedAt: string): string {
  const name = signedName.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'Provider'
  return `Tydio-Independent-Contractor-Agreement-${name}-${signedAt.slice(0, 10)}.pdf`
}

// Emails the signed copy to the cleaner, with Tydio on bcc, and records when it went.
// Used right after signing and by the admin's resend button.
export async function emailSignedAgreement(admin: Admin, signatureId: string): Promise<{ success: true } | { error: string }> {
  const { data: signature } = await admin
    .from('agreement_signatures')
    .select('id, pro_id, signed_name, account_email, agreement_version, signed_at, signed_pdf_path')
    .eq('id', signatureId)
    .maybeSingle()
  if (!signature) return { error: 'Signature not found.' }

  const { data: file, error: downloadError } = await admin.storage
    .from(SIGNED_AGREEMENTS_BUCKET)
    .download(signature.signed_pdf_path)
  if (downloadError || !file) return { error: 'Signed agreement file not found.' }
  const content = Buffer.from(await file.arrayBuffer()).toString('base64')

  let timeZone: string | null = null
  if (signature.pro_id) {
    const { data: tidyPro } = await admin.from('tidypro_profiles').select('time_zone').eq('id', signature.pro_id).maybeSingle()
    timeZone = tidyPro?.time_zone ?? null
  }
  const date = signedDate(new Date(signature.signed_at), timeZone)
  const name = escapeHtml(signature.signed_name)

  try {
    await sendEmail({
      to: [{ email: signature.account_email, name: signature.signed_name }],
      bcc: signature.account_email.toLowerCase() === TYDIO_ADMIN_EMAIL ? undefined : [{ email: TYDIO_ADMIN_EMAIL }],
      subject: `Your signed ${ICA_TITLE}`,
      htmlContent: emailShell(`
        <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">Your signed agreement</h2>
        <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
          Hi ${name}, thanks for signing the ${escapeHtml(ICA_TITLE)}. Your signed copy is attached. Please keep it
          for your records.
        </p>
        <table style="font-size:14px;color:#475569;line-height:1.6;">
          <tr><td style="padding-right:16px;color:#94a3b8;">Signed</td><td>${escapeHtml(date)}</td></tr>
          <tr><td style="padding-right:16px;color:#94a3b8;">Version</td><td>${escapeHtml(signature.agreement_version)}</td></tr>
          <tr><td style="padding-right:16px;color:#94a3b8;">Reference</td><td>${escapeHtml(signature.id)}</td></tr>
        </table>
        <p style="margin:16px 0 0;font-size:13px;color:#94a3b8;line-height:1.6;">
          You can also download it any time from your Tidy Pro profile.
        </p>
      `),
      attachment: [{ name: attachmentName(signature.signed_name, signature.signed_at), content }],
    })
  } catch (err) {
    console.error(`Signed agreement email for ${signatureId} failed`, err)
    return { error: userFacingError(err, 'Email failed.') }
  }

  await admin.from('agreement_signatures').update({ emailed_at: new Date().toISOString() }).eq('id', signatureId)
  return { success: true }
}
