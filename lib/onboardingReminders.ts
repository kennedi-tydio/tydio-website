import type { createAdminClient } from '@/lib/supabase/admin'
import { TYDIO_ADMIN_EMAIL, emailShell, escapeHtml, sendEmail } from '@/lib/email'
import { backgroundCheckStage } from '@/lib/backgroundCheck'
import { missingOnboardingSteps } from '@/lib/cleanerOnboarding'
import { hasSignedCurrentAgreement } from '@/lib/legal/contractorAgreement'

type Admin = ReturnType<typeof createAdminClient>

// A cleaner who still has onboarding left 3 days after signing up gets an email listing
// what's left. At 7 days they get a second one, and the admin is emailed too. Each is
// sent once, recorded on tidypro_profiles (see 051_onboarding_reminders).

const DAY_MS = 24 * 60 * 60 * 1000
export const FIRST_REMINDER_DAYS = 3
export const FINAL_REMINDER_DAYS = 7
// Accounts older than this are left alone, so turning this on doesn't email every
// cleaner who stalled months ago, and a job that's been down doesn't send late reminders.
export const GIVE_UP_AFTER_DAYS = 14

export type OnboardingReminder = 'first' | 'final' | null

export function onboardingReminderDue(
  tidyPro: { created_at: string; onboarding_reminder_sent_at: string | null; onboarding_final_reminder_sent_at: string | null },
  now: Date = new Date()
): OnboardingReminder {
  const ageDays = (now.getTime() - new Date(tidyPro.created_at).getTime()) / DAY_MS
  if (ageDays < FIRST_REMINDER_DAYS || ageDays >= GIVE_UP_AFTER_DAYS) return null
  if (tidyPro.onboarding_final_reminder_sent_at) return null
  if (ageDays >= FINAL_REMINDER_DAYS) return 'final'
  return tidyPro.onboarding_reminder_sent_at ? null : 'first'
}

type Step = { label: string; href: string }

type CleanerRow = {
  id: string
  created_at: string
  onboarding_reminder_sent_at: string | null
  onboarding_final_reminder_sent_at: string | null
  terms_accepted: boolean
  cleaner_status: string | null
  email_notifications_enabled: boolean | null
  profile_photo_url: string | null
  bio: string | null
  availability: unknown
  stripe_onboarding_completed: boolean
  travel_radius_miles: number | null
  latitude: number | null
  longitude: number | null
}

type CheckRow = { status: string; requested_at: string | null; link_sent_at: string | null; submitted_at: string | null; denied_at: string | null }

// Everything the cleaner still has to do themself, in the order onboarding asks for it.
// Steps waiting on Tydio (a background check result, the admin's approval) aren't listed.
export function remainingSteps(cleaner: CleanerRow, check: CheckRow | null, signedAgreement: boolean): Step[] {
  const steps: Step[] = []
  if (!cleaner.terms_accepted || !signedAgreement) steps.push({ label: 'Sign your contractor agreement', href: '/pro/onboarding' })
  if (cleaner.cleaner_status !== 'approved') {
    const stage = backgroundCheckStage(check)
    if (stage === 'not_started') steps.push({ label: 'Start your background check', href: '/pro/onboarding/setup' })
    else if (stage === 'link_sent') steps.push({ label: 'Fill out your background check form', href: '/pro/onboarding/setup' })
  }
  return [...steps, ...missingOnboardingSteps(cleaner)]
}

function stepList(steps: Step[], siteUrl: string): string {
  const items = steps
    .map((s) => `<li style="margin:0 0 8px;"><a href="${siteUrl}${s.href}" style="color:#38C7CA;font-weight:600;text-decoration:none;">${escapeHtml(s.label)}</a></li>`)
    .join('')
  return `<ul style="margin:0 0 24px;padding-left:20px;font-size:15px;color:#475569;line-height:1.6;">${items}</ul>`
}

async function emailCleaner(
  to: { email: string; firstName: string | null },
  kind: 'first' | 'final',
  steps: Step[],
  siteUrl: string
): Promise<void> {
  const hi = to.firstName ? `Hi ${escapeHtml(to.firstName)},` : 'Hi,'
  const subject = kind === 'first' ? 'Finish setting up your Tydio profile' : "You're almost ready to take Tydio jobs"
  const intro =
    kind === 'first'
      ? "You're a few steps away from being bookable on Tydio. Here's what's left:"
      : "Customers can't book you until your profile is finished. Here's what's still left:"
  await sendEmail({
    to: [{ email: to.email, name: to.firstName ?? undefined }],
    subject,
    htmlContent: emailShell(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">${escapeHtml(subject)}</h2>
      <p style="margin:0 0 12px;font-size:15px;color:#475569;line-height:1.6;">${hi}</p>
      <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">${intro}</p>
      ${stepList(steps, siteUrl)}
      <a href="${siteUrl}/pro/onboarding" style="display:inline-block;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">Continue setup</a>
      <p style="margin:24px 0 0;font-size:13px;color:#94a3b8;line-height:1.6;">Questions? Just reply to this email.</p>
    `),
  })
}

async function emailAdmin(
  cleaner: { email: string; firstName: string | null; lastName: string | null; createdAt: string },
  steps: Step[],
  siteUrl: string
): Promise<void> {
  const name = [cleaner.firstName, cleaner.lastName].filter(Boolean).join(' ') || 'A cleaner'
  const signedUp = new Date(cleaner.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/New_York' })
  const items = steps.map((s) => `<li style="margin:0 0 4px;">${escapeHtml(s.label)}</li>`).join('')
  await sendEmail({
    to: [{ email: TYDIO_ADMIN_EMAIL }],
    subject: `${name} hasn't finished onboarding after 7 days`,
    htmlContent: emailShell(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">Onboarding stalled</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
        ${escapeHtml(name)} (${escapeHtml(cleaner.email)}) signed up on ${escapeHtml(signedUp)} and still hasn't finished onboarding. They've been reminded twice. Still to do:
      </p>
      <ul style="margin:0 0 24px;padding-left:20px;font-size:15px;color:#475569;line-height:1.6;">${items}</ul>
      <a href="${siteUrl}/admin/users?search=${encodeURIComponent(cleaner.email)}" style="display:inline-block;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">View in admin</a>
    `),
  })
}

// Run on a schedule. Each reminder is recorded with a conditional update before it's
// sent, so however often this runs nobody gets the same one twice. Each cleaner is
// handled on their own, so one failure doesn't hold up the rest.
export async function sendOnboardingReminders(
  admin: Admin,
  now: Date = new Date()
): Promise<{ first: number; final: number; failed: number }> {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

  const { data: candidates, error } = await admin
    .from('tidypro_profiles')
    .select(
      'id, created_at, onboarding_reminder_sent_at, onboarding_final_reminder_sent_at, terms_accepted, cleaner_status, email_notifications_enabled, profile_photo_url, bio, availability, stripe_onboarding_completed, travel_radius_miles, latitude, longitude'
    )
    .lte('created_at', new Date(now.getTime() - FIRST_REMINDER_DAYS * DAY_MS).toISOString())
    .gt('created_at', new Date(now.getTime() - GIVE_UP_AFTER_DAYS * DAY_MS).toISOString())
    .is('onboarding_final_reminder_sent_at', null)
  if (error) throw new Error(error.message)

  const due = ((candidates ?? []) as CleanerRow[])
    .map((c) => ({ cleaner: c, kind: onboardingReminderDue(c, now) }))
    .filter((d): d is { cleaner: CleanerRow; kind: 'first' | 'final' } => d.kind !== null)
  if (due.length === 0) return { first: 0, final: 0, failed: 0 }

  const ids = due.map((d) => d.cleaner.id)
  const [{ data: profiles }, { data: checks }] = await Promise.all([
    admin.from('profiles').select('id, email, first_name, last_name, email_verified_at, booking_access_status, suspended_at, banned_at').in('id', ids),
    admin.from('background_checks').select('pro_id, status, requested_at, link_sent_at, submitted_at, denied_at').in('pro_id', ids),
  ])
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))
  const checkById = new Map((checks ?? []).map((c) => [c.pro_id, c as CheckRow & { pro_id: string }]))

  let first = 0
  let final = 0
  let failed = 0

  for (const { cleaner, kind } of due) {
    const profile = profileById.get(cleaner.id)
    const check = checkById.get(cleaner.id) ?? null
    // Not someone we should be nudging: never verified their email, turned away, or
    // their background check didn't pass.
    if (!profile?.email || !profile.email_verified_at || profile.suspended_at || profile.banned_at) continue
    if (['waitlisted', 'denied', 'closed'].includes(profile.booking_access_status)) continue
    if (cleaner.cleaner_status === 'paused' || check?.denied_at || check?.status === 'failed') continue

    try {
      const steps = remainingSteps(cleaner, check, await hasSignedCurrentAgreement(admin, cleaner.id))
      if (steps.length === 0) continue

      const column = kind === 'first' ? 'onboarding_reminder_sent_at' : 'onboarding_final_reminder_sent_at'
      const stamp = kind === 'first' ? { onboarding_reminder_sent_at: now.toISOString() } : { onboarding_final_reminder_sent_at: now.toISOString() }
      const { data: marked, error: markError } = await admin
        .from('tidypro_profiles')
        .update(stamp)
        .eq('id', cleaner.id)
        .is(column, null)
        .select('id')
      if (markError) throw new Error(markError.message)
      if (!marked || marked.length === 0) continue

      if (cleaner.email_notifications_enabled !== false) {
        await emailCleaner({ email: profile.email, firstName: profile.first_name }, kind, steps, siteUrl).catch((err) =>
          console.error('Onboarding reminder email failed', cleaner.id, err)
        )
      }
      if (kind === 'final') {
        await emailAdmin(
          { email: profile.email, firstName: profile.first_name, lastName: profile.last_name, createdAt: cleaner.created_at },
          steps,
          siteUrl
        ).catch((err) => console.error('Onboarding stalled admin email failed', cleaner.id, err))
        final++
      } else {
        first++
      }
    } catch (err) {
      console.error('Failed to send onboarding reminder', cleaner.id, err)
      failed++
    }
  }

  return { first, final, failed }
}
