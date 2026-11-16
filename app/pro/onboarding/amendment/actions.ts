'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { clientIp } from '@/lib/rateLimit'
import { normalizeSignedName, safeReturnPath } from '@/lib/legal/contractorAgreement'
import { emailSignedAmendment, notifyAdminAmendmentSigned, pendingAmendment, signAmendment } from '@/lib/legal/agreementAmendments'

// The Tidy Pro's electronic signature on an amendment: their typed name, the checked
// box, and Agree and Continue. A failed email doesn't undo the signature.
export async function signAmendmentAction(formData: FormData): Promise<{ error: string } | void> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const next = safeReturnPath(formData.get('next')) ?? '/pro/dashboard'
  if (formData.get('agreed') !== 'on') return { error: 'Check the box to sign the amendment.' }
  const signedName = normalizeSignedName(formData.get('legal_name'))
  if (!signedName) return { error: 'Enter your full legal name as your signature.' }

  const admin = createAdminClient()
  const amendment = await pendingAmendment(admin, session.profileId)
  if (!amendment) redirect(next)

  const h = await headers()
  const result = await signAmendment(admin, session.profileId, amendment, signedName, {
    ipAddress: await clientIp(),
    userAgent: h.get('user-agent')?.slice(0, 500) ?? null,
  })
  if ('error' in result) return result

  if (!result.alreadySigned) {
    const emailed = await emailSignedAmendment(admin, amendment, result.signatureId)
    if ('error' in emailed) console.error(`Signed amendment ${result.signatureId} not emailed:`, emailed.error)
    try {
      await notifyAdminAmendmentSigned(admin, amendment, result.signatureId)
    } catch (err) {
      console.error(`Admin not told about signed amendment ${result.signatureId}:`, err)
    }
  }

  // Another amendment may still be waiting; the page sends them on when there isn't.
  redirect(`/pro/onboarding/amendment?next=${encodeURIComponent(next)}`)
}
