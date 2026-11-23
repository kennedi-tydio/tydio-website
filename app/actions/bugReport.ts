'use server'

import { headers } from 'next/headers'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { TYDIO_ADMIN_EMAIL, emailShell, escapeHtml, sendEmail } from '@/lib/email'
import { detailSection } from '@/lib/bookingIncidentEmail'
import { BUG_REPORT_DETAILS_MAX_LENGTH, bugReportCategoriesFor } from '@/lib/bugReportCategories'
import { RATE_LIMITS, RATE_LIMITED_MESSAGE, isRateLimited, recordRateLimitEvent } from '@/lib/rateLimit'

type Result = { success: true } | { error: string }

// Profile → Report a bug. Nothing is saved; the report is emailed to the admin.
export async function submitBugReportAction(input: { categoryId: string; details: string; page?: string }): Promise<Result> {
  const session = await getSession()
  if (!session || (session.role !== 'USER' && session.role !== 'TIDYPRO')) return { error: 'Please sign in again.' }

  const category = bugReportCategoriesFor(session.role).find((c) => c.id === input.categoryId)
  if (!category) return { error: 'Choose a category.' }

  const details = (input.details ?? '').trim()
  if (!details) return { error: 'Tell us what went wrong.' }
  if (details.length > BUG_REPORT_DETAILS_MAX_LENGTH) {
    return { error: `Keep it under ${BUG_REPORT_DETAILS_MAX_LENGTH} characters.` }
  }

  const admin = createAdminClient()
  const limitKey = `bug-report:${session.profileId}`
  if (await isRateLimited(admin, limitKey, RATE_LIMITS.bugReportPerUser)) return { error: RATE_LIMITED_MESSAGE }

  const { data: profile } = await admin
    .from('profiles')
    .select('first_name, last_name, email, phone')
    .eq('id', session.profileId)
    .maybeSingle()

  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Unknown'
  const roleLabel = session.role === 'USER' ? 'Customer' : 'Tidy Pro'
  const userAgent = (await headers()).get('user-agent')

  try {
    await sendEmail({
      to: [{ email: TYDIO_ADMIN_EMAIL }],
      subject: `Bug report (${roleLabel}): ${category.label}`,
      htmlContent: emailShell(`
        <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">New bug report</h2>
        <p style="margin:0 0 12px;font-size:15px;color:#475569;line-height:1.6;">
          ${escapeHtml(name)} (${roleLabel.toLowerCase()}) reported a problem with
          <strong>${escapeHtml(category.label)}</strong>.
        </p>
        ${detailSection('What happened', [['Details', details]])}
        ${detailSection(`Reported by (${roleLabel})`, [
          ['Name', name],
          ['Email', profile?.email ?? session.email],
          ['Phone', profile?.phone],
          ['Profile ID', session.profileId],
        ])}
        ${detailSection('Device', [
          ['Page', input.page?.slice(0, 300)],
          ['Browser', userAgent?.slice(0, 500)],
          ['Sent', `${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`],
        ])}
      `),
    })
  } catch (err) {
    console.error('[Tydio] Bug report email failed:', err)
    return { error: 'We couldn’t send your report. Please try again.' }
  }

  await recordRateLimitEvent(admin, limitKey)
  return { success: true }
}
