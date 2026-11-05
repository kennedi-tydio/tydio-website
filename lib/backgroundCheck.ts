import { randomBytes } from 'node:crypto'
import type { createAdminClient } from '@/lib/supabase/admin'
import { TYDIO_ADMIN_EMAIL, emailShell, escapeHtml, sendEmail } from '@/lib/email'
import { notifyBackgroundCheckLinkSent, notifyBackgroundCheckPassed, type NotificationPayload } from '@/lib/notifications'
import { canSendSms, sendSmsForPayload } from '@/lib/sms'
import { sendPushForPayload } from '@/lib/push'
import { pauseCleaner } from '@/lib/cleanerStatus'
import { BAN_APPEAL_DAYS, appealDeadline, formatDeadline } from '@/lib/appealWindow'
import { backgroundCheckChargeCents, formatFeeCents } from '@/lib/backgroundCheckFee'
import { RATE_LIMITS, isRateLimited, recordRateLimitEvent } from '@/lib/rateLimit'
import type { FollowUpKind } from '@/lib/backgroundCheckFollowUp'

type Admin = ReturnType<typeof createAdminClient>

// There's no integration with the screening provider: an admin (or an automation
// using /api/automation/background-checks) sends the cleaner the form, checks the
// outcome in the provider's dashboard, and records each step here. So every state
// below means "someone recorded this", and nothing changes on its own.
//
//   not_started → needs_link (paid, or requested when there's no fee)
//               → link_sent → pending (form submitted) → passed / failed
//
// background_checks.status has a check constraint allowing only
// pending/in_review/passed/failed/expired, and stays 'pending' until there's an
// outcome, so the timestamps are what tell the earlier stages apart.
type BackgroundCheckRow = {
  status: string
  requested_at: string | null
  link_sent_at: string | null
  submitted_at: string | null
}

export function isBackgroundCheckSubmitted(check: BackgroundCheckRow | null | undefined): boolean {
  if (!check) return false
  return check.submitted_at != null || ['in_review', 'passed', 'failed'].includes(check.status)
}

export const BACKGROUND_CHECK_STAGES = ['not_started', 'needs_link', 'link_sent', 'pending', 'passed', 'failed'] as const
export type BackgroundCheckStage = (typeof BACKGROUND_CHECK_STAGES)[number]

// Needs-review checks count as pending, since they're still waiting on a decision.
export function backgroundCheckStage(check: BackgroundCheckRow | null | undefined): BackgroundCheckStage {
  if (!check) return 'not_started'
  if (check.status === 'passed') return 'passed'
  if (check.status === 'failed') return 'failed'
  if (isBackgroundCheckSubmitted(check)) return 'pending'
  if (check.link_sent_at) return 'link_sent'
  return check.requested_at ? 'needs_link' : 'not_started'
}

// The label on the onboarding checklist. in_review is an internal follow-up rather
// than a verdict, so to the cleaner it's still pending. "Pending" only ever
// appears once the form has been submitted.
export function backgroundCheckStatusLabel(check: BackgroundCheckRow | null | undefined): string {
  switch (backgroundCheckStage(check)) {
    case 'passed':
      return 'Passed'
    case 'failed':
      return 'Not passed'
    case 'pending':
      return 'Pending'
    case 'link_sent':
      return 'Form sent'
    case 'needs_link':
      return 'Form coming'
    default:
      return 'Not started'
  }
}

// The "You've Been Verified" screen is specifically about passing the
// background check, so an approval without one (an admin's approve on the Users
// page) doesn't trigger it.
export function shouldShowVerifiedScreen(
  tidyPro: { cleaner_status: string | null; verified_ack_at: string | null } | null | undefined,
  check: BackgroundCheckRow | null | undefined
): boolean {
  return check?.status === 'passed' && tidyPro?.cleaner_status === 'approved' && !tidyPro.verified_ack_at
}

// Once approved, a cleaner is past the setup and "almost there" screens for good.
// Those screens send them to /pro/onboarding, which shows the Verified screen if
// they haven't seen it yet and otherwise goes to the dashboard.
export function isPastBackgroundCheckScreens(
  cleanerStatus: string | null | undefined,
  check: BackgroundCheckRow | null | undefined
): boolean {
  return cleanerStatus === 'approved' || check?.status === 'passed'
}

// Whether onboarding's background check step is out of the way. Once it's paid for
// or requested, what happens next is out of the cleaner's hands until the form
// arrives, so they aren't held on the setup page in the meantime. An admin can also
// approve a cleaner directly, and that shouldn't trap them there either.
export function isBackgroundCheckStepDone(
  cleanerStatus: string | null | undefined,
  check: BackgroundCheckRow | null | undefined
): boolean {
  return cleanerStatus === 'approved' || backgroundCheckStage(check) !== 'not_started'
}

// The link is opened by the cleaner and put in emails, so only https gets through.
// Blank is allowed: ordering from the provider's dashboard can email the invitation
// to the cleaner directly, leaving no link to pass along.
export function parseBackgroundCheckLink(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new BackgroundCheckStateError('That link is not a valid URL.')
  }
  if (url.protocol !== 'https:') throw new BackgroundCheckStateError('The link must start with https://')
  return url.toString()
}

// A request that doesn't fit the check's current stage, as opposed to a system
// failure. Its message is safe to show the admin or automation that made it.
export class BackgroundCheckStateError extends Error {}

async function requireStage(admin: Admin, proId: string, allowed: BackgroundCheckStage[], action: string): Promise<void> {
  const { data: check } = await admin
    .from('background_checks')
    .select('status, requested_at, link_sent_at, submitted_at')
    .eq('pro_id', proId)
    .maybeSingle()

  const stage = backgroundCheckStage(check)
  if (!allowed.includes(stage)) {
    throw new BackgroundCheckStateError(`Can't ${action} a background check that is at the "${stage}" stage.`)
  }
}

async function notifyCleaner(admin: Admin, proId: string, payload: NotificationPayload): Promise<void> {
  const { data: tidyPro } = await admin
    .from('tidypro_profiles')
    .select('phone, sms_consent')
    .eq('id', proId)
    .maybeSingle()

  // A failed notification must never undo or block the step that triggered it.
  if (canSendSms(tidyPro?.sms_consent ?? null, tidyPro?.phone ?? null)) {
    await sendSmsForPayload(tidyPro!.phone!, payload).catch((err) => console.error('Background check SMS failed', err))
  }
  await sendPushForPayload(proId, payload).catch((err) => console.error('Background check push failed', err))
}

// Tells the admin a cleaner has paid and who to send a form to. Failing to send
// doesn't undo the payment, and the cleaner still appears in the admin console.
export async function emailAdminCleanerPaid(admin: Admin, proId: string): Promise<void> {
  const { data: profile } = await admin.from('profiles').select('email, first_name, last_name').eq('id', proId).maybeSingle()
  if (!profile) return

  const name = escapeHtml([profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'A cleaner')
  const email = escapeHtml(profile.email)

  await sendEmail({
    to: [{ email: TYDIO_ADMIN_EMAIL }],
    subject: `${[profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'A cleaner'} paid for their background check`,
    htmlContent: emailShell(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">Background check paid</h2>
      <p style="margin:0;font-size:15px;color:#475569;line-height:1.6;">
        ${name} has paid for their background check. Please send them a link at
        <a href="mailto:${email}">${email}</a>.
      </p>
    `),
  }).catch((err) => console.error('Background check admin email failed', err))
}

// Tells the admin the outcome, so a decision recorded by an automation or at another
// time doesn't go unseen. Failing to send doesn't undo the decision.
export async function emailAdminDecision(
  person: { first_name: string | null; last_name: string | null; email: string },
  decision: 'cleared' | 'denied' | 'banned',
  note?: string | null
): Promise<void> {
  const plainName = [person.first_name, person.last_name].filter(Boolean).join(' ') || 'A cleaner'
  const outcome =
    decision === 'cleared'
      ? 'was cleared, and they are now approved. They can receive bookings once the rest of their onboarding is done.'
      : decision === 'denied'
      ? `was denied. They have been emailed the reason and have ${BAN_APPEAL_DAYS} days to appeal (see Ban Appeals) before they are banned and their account deleted.`
      : 'denial is final. They have been added to the banned list and their account deleted.'

  await sendEmail({
    to: [{ email: TYDIO_ADMIN_EMAIL }],
    subject: decision === 'banned' ? `${plainName} has been banned after a background check denial` : `${plainName}'s background check was ${decision}`,
    htmlContent: emailShell(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">Background check ${decision === 'banned' ? 'denial final' : decision}</h2>
      <p style="margin:0 0 12px;font-size:15px;color:#475569;line-height:1.6;">
        ${escapeHtml(plainName)} (${escapeHtml(person.email)})'s background check ${outcome}
      </p>
      ${note ? `<p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">Note: ${escapeHtml(note)}</p>` : ''}
    `),
  }).catch((err) => console.error('Background check decision email failed', err))
}

// Stops a double click or a quick resend from emailing the cleaner twice.
export const LINK_RESEND_COOLDOWN_MS = 60_000
export const LINK_RESEND_COOLDOWN_MESSAGE =
  'The background check was already sent. Wait 1 minute before trying again.'

// Can be repeated to resend, or to replace an expired link, once a minute has
// passed since the last send. Email is sent as well as a text and push, since it
// doesn't depend on notification consent and this is a step the cleaner asked
// for. The one link covers identity verification too.
export async function sendBackgroundCheckLink(admin: Admin, proId: string, rawLink: string | null | undefined): Promise<void> {
  const link = parseBackgroundCheckLink(rawLink)
  await requireStage(admin, proId, ['needs_link', 'link_sent'], 'send a form for')

  // The cooldown is part of the update, so two sends at once can't both pass it.
  const cutoff = new Date(Date.now() - LINK_RESEND_COOLDOWN_MS).toISOString()
  const { data: updated, error } = await admin
    .from('background_checks')
    .update({ background_check_link: link, link_sent_at: new Date().toISOString() })
    .eq('pro_id', proId)
    .or(`link_sent_at.is.null,link_sent_at.lt."${cutoff}"`)
    .select('pro_id')
  if (error) throw new Error(error.message)
  if (!updated?.length) throw new BackgroundCheckStateError(LINK_RESEND_COOLDOWN_MESSAGE)

  const payload = notifyBackgroundCheckLinkSent(link)
  await notifyCleaner(admin, proId, payload)

  const { data: profile } = await admin.from('profiles').select('email, first_name').eq('id', proId).maybeSingle()
  if (profile?.email) {
    await sendEmail({
      to: [{ email: profile.email, name: profile.first_name ?? undefined }],
      subject: 'Complete your Tydio background check',
      htmlContent: emailShell(`
        <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">Hi ${escapeHtml(profile.first_name ?? 'there')},</h2>
        <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">${payload.body}</p>
        ${
          link
            ? `<a href="${link}" style="display:inline-block;padding:12px 24px;background:#38C7CA;color:white;border-radius:12px;text-decoration:none;font-weight:600;">Complete your background check and ID verification</a>`
            : ''
        }
      `),
    }).catch((err) => console.error('Background check email failed', err))
  }
}

export async function markBackgroundCheckSubmitted(admin: Admin, proId: string): Promise<void> {
  await requireStage(admin, proId, ['needs_link', 'link_sent', 'pending'], 'mark as submitted')
  await admin
    .from('background_checks')
    .update({ submitted_at: new Date().toISOString() })
    .eq('pro_id', proId)
    .is('submitted_at', null)
}

// Passing also records it as submitted if that step was skipped, since a cleared
// report means the form was clearly submitted. Only the update that actually moves
// the check to 'passed' notifies, so repeating this can't contact a cleaner twice.
// Approval alone doesn't put them in search: see missingOnboardingSteps.
export async function passBackgroundCheck(admin: Admin, proId: string): Promise<void> {
  await requireStage(admin, proId, ['needs_link', 'link_sent', 'pending', 'failed'], 'pass')

  const now = new Date().toISOString()
  await admin.from('background_checks').update({ submitted_at: now }).eq('pro_id', proId).is('submitted_at', null)

  const { data: transitioned } = await admin
    .from('background_checks')
    .update({ status: 'passed', completed_at: now, manual_decision_at: now, manual_decision_note: null })
    .eq('pro_id', proId)
    .neq('status', 'passed')
    .select('pro_id')

  await admin
    .from('tidypro_profiles')
    .update({ cleaner_status: 'approved', active_for_booking: true, approved_at: now, paused_at: null, pause_reason: null })
    .eq('id', proId)

  if (transitioned && transitioned.length > 0) await sendApproval(admin, proId)
}

async function sendApproval(admin: Admin, proId: string): Promise<void> {
  const payload = notifyBackgroundCheckPassed()
  await notifyCleaner(admin, proId, payload)

  const [{ data: profile }, { data: tidyPro }] = await Promise.all([
    admin.from('profiles').select('email, first_name, last_name').eq('id', proId).maybeSingle(),
    admin.from('tidypro_profiles').select('email_notifications_enabled').eq('id', proId).maybeSingle(),
  ])
  if (!profile?.email) return

  await emailAdminDecision(profile, 'cleared')
  if (tidyPro?.email_notifications_enabled === false) return

  await sendEmail({
    to: [{ email: profile.email, name: profile.first_name ?? undefined }],
    subject: "You're approved to clean with Tydio!",
    htmlContent: emailShell(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">You're approved, ${escapeHtml(profile.first_name ?? 'there')}!</h2>
      <p style="margin:0 0 12px;font-size:15px;color:#475569;line-height:1.6;">
        You passed your background check. To start receiving bookings, make sure you've finished your:
      </p>
      <ul style="margin:0 0 20px;padding-left:20px;font-size:15px;color:#475569;line-height:1.6;">
        <li>Availability</li>
        <li>Profile picture</li>
        <li>Bio</li>
        <li>Payout method</li>
      </ul>
      <a href="${payload.url}" style="display:inline-block;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">Finish setting up</a>
    `),
  }).catch((err) => console.error('Background check approval email failed', err))
}

// Leaves the cleaner unapproved and paused, and emails them the reason with a link
// to appeal. They can still sign in. If no appeal is accepted within BAN_APPEAL_DAYS
// of the denial, expireBackgroundCheckDenials bans them and deletes the account.
// Refused while they have open bookings: banning them later would leave those
// customers, who may have paid, with no cleaner.
//
// The reason goes to the cleaner. Any notices the provider's adverse action process
// requires still come through the provider.
export async function denyCleaner(admin: Admin, proId: string, reason: string): Promise<void> {
  const trimmed = reason.trim()
  if (!trimmed) throw new BackgroundCheckStateError('Give a reason for the denial. It is sent to the cleaner.')
  await requireStage(admin, proId, ['needs_link', 'link_sent', 'pending', 'passed', 'failed'], 'deny')

  const { data: openBookings } = await admin
    .from('bookings')
    .select('id')
    .eq('tidy_pro_id', proId)
    .in('status', ['pending', 'scheduled'])
    .limit(1)
  if (openBookings && openBookings.length > 0) {
    throw new BackgroundCheckStateError('This cleaner has open bookings. Cancel or reassign them before denying.')
  }

  const { data: profile } = await admin.from('profiles').select('email, first_name, last_name').eq('id', proId).maybeSingle()
  if (!profile) throw new BackgroundCheckStateError('This cleaner no longer has an account.')

  const now = new Date()
  const appealToken = randomBytes(32).toString('hex')
  const { error } = await admin
    .from('background_checks')
    .update({
      status: 'failed',
      completed_at: now.toISOString(),
      manual_decision_at: now.toISOString(),
      manual_decision_note: trimmed,
      denied_at: now.toISOString(),
      denial_reason: trimmed,
      appeal_token: appealToken,
      appeal_message: null,
      appeal_submitted_at: null,
    })
    .eq('pro_id', proId)
  if (error) throw new Error(error.message)

  await pauseCleaner(admin, proId, 'Background check denied', now)

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  await sendEmail({
    to: [{ email: profile.email, name: profile.first_name ?? undefined }],
    subject: 'Your Tydio background check was not approved',
    htmlContent: emailShell(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">Hi ${escapeHtml(profile.first_name ?? 'there')},</h2>
      <p style="margin:0 0 12px;font-size:15px;color:#475569;line-height:1.6;">
        We weren't able to approve your background check, so you can't take bookings on Tydio:
      </p>
      <p style="margin:0 0 16px;padding:12px 16px;background:#fef2f2;border-radius:10px;color:#ef4444;font-size:14px;line-height:1.5;">${escapeHtml(trimmed)}</p>
      <p style="margin:0 0 12px;font-size:15px;color:#475569;line-height:1.6;">
        If you think this is a mistake, you can appeal by ${formatDeadline(appealDeadline(now.toISOString()))}. Unless your
        appeal is accepted by then, your account will be closed and its data permanently deleted.
      </p>
      <a href="${siteUrl}/appeal?token=${appealToken}" style="display:inline-block;margin:8px 0 20px;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">Appeal this decision</a>
    `),
  }).catch((err) => console.error('Background check denial email failed', err))

  await emailAdminDecision(profile, 'denied', trimmed)
}

// Reminder emails the admin sends by hand to a cleaner who's stalled. Each one is
// only sent at the stage it's about, so a cleaner who has since paid or finished
// isn't nagged by mistake, and only once a minute per cleaner.
const FOLLOW_UP_STAGES: Record<FollowUpKind, BackgroundCheckStage> = {
  not_paid: 'not_started',
  not_started: 'link_sent',
}

export const FOLLOW_UP_COOLDOWN_MESSAGE = 'A follow-up email was already sent to this cleaner. Wait 1 minute before sending another.'

export async function sendBackgroundCheckFollowUp(admin: Admin, proId: string, kind: FollowUpKind): Promise<void> {
  const { data: check } = await admin
    .from('background_checks')
    .select('status, requested_at, link_sent_at, submitted_at')
    .eq('pro_id', proId)
    .maybeSingle()
  const stage = backgroundCheckStage(check)
  if (stage !== FOLLOW_UP_STAGES[kind]) {
    throw new BackgroundCheckStateError(
      kind === 'not_paid'
        ? `This cleaner has already paid (their check is at the "${stage}" stage), so there's nothing to remind them to pay for.`
        : `"Not started" reminders are for cleaners whose check has been sent but not completed. This one is at the "${stage}" stage.`
    )
  }

  const { data: profile } = await admin.from('profiles').select('email, first_name').eq('id', proId).maybeSingle()
  if (!profile?.email) throw new BackgroundCheckStateError('This cleaner no longer has an account.')

  const rateKey = `background-check-follow-up:${proId}`
  if (await isRateLimited(admin, rateKey, RATE_LIMITS.backgroundCheckFollowUpPerCleaner)) {
    throw new BackgroundCheckStateError(FOLLOW_UP_COOLDOWN_MESSAGE)
  }
  await recordRateLimitEvent(admin, rateKey)

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const name = escapeHtml(profile.first_name ?? 'there')
  const paragraph = (text: string) => `<p style="margin:0 0 12px;font-size:15px;color:#475569;line-height:1.6;">${text}</p>`

  let subject: string
  let body: string
  if (kind === 'not_paid') {
    const feeCents = backgroundCheckChargeCents()
    subject = 'Finish your Tydio background check'
    body = `
      ${paragraph("You're almost ready to start cleaning with Tydio. Your next step is your background check, which also covers ID verification.")}
      ${paragraph(`It hasn't been paid for yet${feeCents != null ? `. The fee is ${formatFeeCents(feeCents)}` : ''}, and we can't start it until it is. Once it's paid, Checkr will email you a link to complete it.`)}
      <a href="${siteUrl}/pro/onboarding/setup/background-check" style="display:inline-block;margin:8px 0 20px;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">Pay for your background check</a>
    `
  } else {
    subject = 'Reminder: complete your Tydio background check'
    body = `
      ${paragraph('Checkr emailed you an invitation to complete your background check and ID verification, but it hasn’t been completed yet.')}
      ${paragraph('Look for an email from Checkr, checking your spam folder too, and follow its steps. We can’t approve you to take bookings until it’s done.')}
      ${paragraph('Can’t find the email? Reply to this message and we’ll help.')}
    `
  }

  await sendEmail({
    to: [{ email: profile.email, name: profile.first_name ?? undefined }],
    subject,
    htmlContent: emailShell(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">Hi ${name},</h2>
      ${body}
    `),
  })
}

// For a report an automation can't call clear, so a person makes the decision.
export async function flagBackgroundCheckForReview(admin: Admin, proId: string, note: string | null): Promise<void> {
  await requireStage(admin, proId, ['link_sent', 'pending'], 'flag for review')
  await admin
    .from('background_checks')
    .update({ status: 'in_review', submitted_at: new Date().toISOString(), manual_decision_note: note })
    .eq('pro_id', proId)
}
