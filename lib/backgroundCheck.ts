import type { createAdminClient } from '@/lib/supabase/admin'
import { TYDIO_ADMIN_EMAIL, emailShell, escapeHtml, sendEmail } from '@/lib/email'
import { normalizePhone } from '@/lib/bannedUsers'
import { notifyBackgroundCheckLinkSent, notifyBackgroundCheckPassed, type NotificationPayload } from '@/lib/notifications'
import { canSendSms, sendSmsForPayload } from '@/lib/sms'
import { sendPushForPayload } from '@/lib/push'

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
async function emailAdminDecision(
  person: { first_name: string | null; last_name: string | null; email: string },
  decision: 'cleared' | 'denied',
  note?: string | null
): Promise<void> {
  const plainName = [person.first_name, person.last_name].filter(Boolean).join(' ') || 'A cleaner'
  const outcome =
    decision === 'cleared'
      ? 'was cleared, and they are now approved. They can receive bookings once the rest of their onboarding is done.'
      : 'was denied. Their account has been deleted and they have been added to the banned list.'

  await sendEmail({
    to: [{ email: TYDIO_ADMIN_EMAIL }],
    subject: `${plainName}'s background check was ${decision}`,
    htmlContent: emailShell(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">Background check ${decision}</h2>
      <p style="margin:0 0 12px;font-size:15px;color:#475569;line-height:1.6;">
        ${escapeHtml(plainName)} (${escapeHtml(person.email)})'s background check ${outcome}
      </p>
      ${note ? `<p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">Note: ${escapeHtml(note)}</p>` : ''}
    `),
  }).catch((err) => console.error('Background check decision email failed', err))
}

// Can be repeated to resend, or to replace an expired link. Email is sent as well
// as a text and push, since it doesn't depend on notification consent and this is
// a step the cleaner asked for.
export async function sendBackgroundCheckLink(admin: Admin, proId: string, rawLink: string | null | undefined): Promise<void> {
  const link = parseBackgroundCheckLink(rawLink)
  await requireStage(admin, proId, ['needs_link', 'link_sent'], 'send a form for')

  const { error } = await admin
    .from('background_checks')
    .update({ background_check_link: link, link_sent_at: new Date().toISOString() })
    .eq('pro_id', proId)
  if (error) throw new Error(error.message)

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
            ? `<a href="${link}" style="display:inline-block;padding:12px 24px;background:#38C7CA;color:white;border-radius:12px;text-decoration:none;font-weight:600;">Complete your background check</a>`
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

// Bans the cleaner and deletes their account, which can't be undone from the app.
// Refused while they have open bookings: deleting them would leave those customers,
// who may have paid, with no cleaner. The ban is written first so that if the delete
// fails they're still locked out, rather than deleted-but-able-to-return.
//
// Deliberately sends the cleaner nothing. The notices a denial requires come through
// the provider's adverse action process, and must be finished before this runs.
export async function denyCleaner(admin: Admin, proId: string, note: string | null): Promise<void> {
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

  const [{ data: profile }, { data: tidyPro }, { data: check }] = await Promise.all([
    admin.from('profiles').select('email, first_name, last_name, phone').eq('id', proId).maybeSingle(),
    admin.from('tidypro_profiles').select('phone').eq('id', proId).maybeSingle(),
    admin.from('background_checks').select('fee_amount_cents, stripe_payment_intent_id').eq('pro_id', proId).maybeSingle(),
  ])
  if (!profile) throw new BackgroundCheckStateError('This cleaner no longer has an account.')

  const phones = [profile.phone, tidyPro?.phone].filter((p): p is string => Boolean(p)).map(normalizePhone)

  const { error: banError } = await admin.from('banned_users').insert({
    email: profile.email.trim().toLowerCase(),
    phones_normalized: [...new Set(phones)],
    first_name: profile.first_name,
    last_name: profile.last_name,
    note,
    former_profile_id: proId,
    fee_amount_cents: check?.fee_amount_cents ?? null,
    stripe_payment_intent_id: check?.stripe_payment_intent_id ?? null,
  })
  if (banError) throw new Error(banError.message)

  const { error: deleteError } = await admin.from('profiles').delete().eq('id', proId)
  if (deleteError) throw new Error(deleteError.message)

  await emailAdminDecision(profile, 'denied', note)
}

// For a report an automation can't call clear, so a person makes the decision.
export async function flagBackgroundCheckForReview(admin: Admin, proId: string, note: string | null): Promise<void> {
  await requireStage(admin, proId, ['link_sent', 'pending'], 'flag for review')
  await admin
    .from('background_checks')
    .update({ status: 'in_review', submitted_at: new Date().toISOString(), manual_decision_note: note })
    .eq('pro_id', proId)
}
