import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAutomationAuthorized } from '@/lib/automationAuth'
import { BACKGROUND_CHECK_STAGES, backgroundCheckStage, type BackgroundCheckStage } from '@/lib/backgroundCheck'

// GET /api/automation/background-checks?stage=needs_link
// Authorization: Bearer <BACKGROUND_CHECK_AUTOMATION_KEY>
//
// Lets an automation see who needs what: `needs_link` is who to send a form to,
// and `link_sent` / `pending` is who to look up in the provider's dashboard.
export async function GET(req: NextRequest) {
  if (!isAutomationAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const stage = req.nextUrl.searchParams.get('stage')
  if (stage && !BACKGROUND_CHECK_STAGES.includes(stage as BackgroundCheckStage)) {
    return NextResponse.json({ error: `stage must be one of: ${BACKGROUND_CHECK_STAGES.join(', ')}` }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('background_checks')
    .select('pro_id, status, requested_at, link_sent_at, submitted_at, completed_at, fee_paid_at, fee_refunded_at')
  if (error) return NextResponse.json({ error: 'Failed to load background checks' }, { status: 500 })

  const rows = (data ?? []).filter((c) => !stage || backgroundCheckStage(c) === stage)
  const proIds = rows.map((r) => r.pro_id)
  const { data: profiles } = proIds.length
    ? await admin.from('profiles').select('id, first_name, last_name, email').in('id', proIds)
    : { data: [] }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  return NextResponse.json({
    checks: rows.map((row) => {
      const profile = profileById.get(row.pro_id)
      return {
        proId: row.pro_id,
        firstName: profile?.first_name ?? null,
        lastName: profile?.last_name ?? null,
        email: profile?.email ?? null,
        stage: backgroundCheckStage(row),
        needsReview: row.status === 'in_review',
        feePaid: Boolean(row.fee_paid_at) && !row.fee_refunded_at,
        requestedAt: row.requested_at,
        linkSentAt: row.link_sent_at,
        submittedAt: row.submitted_at,
        completedAt: row.completed_at,
      }
    }),
  })
}
