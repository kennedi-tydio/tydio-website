import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { SIGNED_AGREEMENTS_BUCKET, currentAgreementSignature, readAgreementPdf } from '@/lib/legal/contractorAgreement'

// The Independent Contractor Agreement, opened in the browser's PDF viewer: the blank
// agreement to review before signing, or with ?signed=1 the cleaner's own signed copy.
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

  if (req.nextUrl.searchParams.get('signed') === '1') {
    const admin = createAdminClient()
    const signature = await currentAgreementSignature(admin, session.profileId)
    if (!signature) return NextResponse.json({ error: 'No signed agreement yet' }, { status: 404 })
    const { data } = await admin.storage.from(SIGNED_AGREEMENTS_BUCKET).createSignedUrl(signature.signed_pdf_path, 300)
    if (!data?.signedUrl) return NextResponse.json({ error: 'Signed agreement not found' }, { status: 404 })
    return NextResponse.redirect(data.signedUrl)
  }

  const pdf = await readAgreementPdf()
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="Tydio-Independent-Contractor-Agreement.pdf"',
      'Cache-Control': 'private, no-store',
    },
  })
}
