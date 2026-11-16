import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { pendingAmendment, readAmendmentPdf } from '@/lib/legal/agreementAmendments'

// This Tidy Pro's own copy of the amendment waiting for their signature, opened in the
// browser's PDF viewer.
export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

  const amendment = await pendingAmendment(createAdminClient(), session.profileId)
  if (!amendment) return NextResponse.json({ error: 'No amendment to sign' }, { status: 404 })

  const pdf = await readAmendmentPdf(amendment, session.profileId)
  if (!pdf) return NextResponse.json({ error: 'No amendment to sign' }, { status: 404 })
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="Tydio-Agreement-Amendment.pdf"',
      'Cache-Control': 'private, no-store',
    },
  })
}
