import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAutomationAuthorized } from '@/lib/automationAuth'
import {
  BackgroundCheckStateError,
  flagBackgroundCheckForReview,
  markBackgroundCheckSubmitted,
  passBackgroundCheck,
  sendBackgroundCheckLink,
} from '@/lib/backgroundCheck'

// POST /api/automation/background-checks/:proId
// Authorization: Bearer <BACKGROUND_CHECK_AUTOMATION_KEY>
// Body: { "action": "send_link", "link": "https://…" }   link optional
//       { "action": "mark_submitted" }
//       { "action": "pass" }                              only for a clear report
//       { "action": "flag_for_review", "note": "…" }      anything else
//
// There's deliberately no "reject" action. Rejecting someone over a report needs
// a person, plus the pre-adverse and final notices, so an automation can only hand
// those cases over to the admin dashboard.
export async function POST(req: NextRequest, { params }: { params: Promise<{ proId: string }> }) {
  if (!isAutomationAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { proId } = await params
  const body = await req.json().catch(() => null)
  const admin = createAdminClient()

  try {
    switch (body?.action) {
      case 'send_link':
        await sendBackgroundCheckLink(admin, proId, body.link)
        break
      case 'mark_submitted':
        await markBackgroundCheckSubmitted(admin, proId)
        break
      case 'pass':
        await passBackgroundCheck(admin, proId)
        break
      case 'flag_for_review':
        await flagBackgroundCheckForReview(admin, proId, typeof body.note === 'string' ? body.note.trim() || null : null)
        break
      default:
        return NextResponse.json({ error: 'action must be one of: send_link, mark_submitted, pass, flag_for_review' }, { status: 400 })
    }
  } catch (err) {
    if (err instanceof BackgroundCheckStateError) return NextResponse.json({ error: err.message }, { status: 409 })
    console.error('Background check automation failed', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
