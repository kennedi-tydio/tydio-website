import { NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/auth/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { SIGNED_AGREEMENTS_BUCKET } from '@/lib/legal/contractorAgreement'

// Opens a cleaner's signed contractor agreement for the admin, through a short-lived
// link to the private bucket.
export async function GET(_req: Request, { params }: { params: Promise<{ signatureId: string }> }) {
  if (!(await isAdminAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { signatureId } = await params
  const admin = createAdminClient()
  const { data: signature } = await admin
    .from('agreement_signatures')
    .select('signed_pdf_path')
    .eq('id', signatureId)
    .maybeSingle()
  if (!signature) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data } = await admin.storage.from(SIGNED_AGREEMENTS_BUCKET).createSignedUrl(signature.signed_pdf_path, 300)
  if (!data?.signedUrl) return NextResponse.json({ error: 'Signed agreement file not found' }, { status: 404 })
  return NextResponse.redirect(data.signedUrl)
}
