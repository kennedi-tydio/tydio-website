'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { TYDIO_ADMIN_EMAIL, emailShell, escapeHtml, sendEmail } from '@/lib/email'

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
const MAX_SIZE_BYTES = 10 * 1024 * 1024

async function emailAdminInsuranceUploaded(admin: ReturnType<typeof createAdminClient>, proId: string): Promise<void> {
  const { data: profile } = await admin.from('profiles').select('email, first_name, last_name').eq('id', proId).maybeSingle()
  if (!profile) return

  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'A cleaner'
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  await sendEmail({
    to: [{ email: TYDIO_ADMIN_EMAIL }],
    subject: `${name} uploaded their insurance for review`,
    htmlContent: emailShell(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">Insurance ready to review</h2>
      <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.6;">
        ${escapeHtml(name)} (${escapeHtml(profile.email)}) uploaded their proof of insurance. Please review it and approve or deny it in the admin dashboard.
      </p>
      <a href="${siteUrl}/admin/insurance" style="display:inline-block;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">Review insurance</a>
    `),
  })
}

export async function uploadInsuranceDocumentAction(
  formData: FormData
): Promise<{ error?: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const file = formData.get('document')
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Please choose a file to upload.' }
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { error: 'Please upload a PDF, JPG, or PNG file.' }
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { error: 'File is too large — please upload something under 10MB.' }
  }

  const admin = createAdminClient()
  const extension = file.name.split('.').pop() ?? 'pdf'
  const path = `${session.profileId}/${Date.now()}.${extension}`

  const { error: uploadError } = await admin.storage
    .from('insurance-documents')
    .upload(path, file, { contentType: file.type, upsert: true })

  if (uploadError) return { error: 'Upload failed — please try again.' }

  await admin
    .from('tidypro_profiles')
    .update({
      insurance_document_url: path,
      insurance_status: 'pending',
      insurance_submitted_at: new Date().toISOString(),
      insurance_denial_reason: null,
      insurance_policy_expiration_date: null,
      insurance_expiry_reminder_sent_at: null,
    })
    .eq('id', session.profileId)

  // Failing to send doesn't undo the upload, which still shows on the admin page.
  await emailAdminInsuranceUploaded(admin, session.profileId).catch((err) => console.error('Insurance admin email failed', err))

  revalidatePath('/pro/profile/insurance')
  revalidatePath('/pro/onboarding/setup')
  revalidatePath('/pro/onboarding/almost-there')
  return {}
}
