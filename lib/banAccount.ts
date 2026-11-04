import { randomBytes } from 'node:crypto'
import type { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/bannedUsers'
import { deleteOwnAccount } from '@/lib/accountDeletion'
import { suspendAccounts, unsuspendAccounts } from '@/lib/accountSuspension'
import { emailShell, escapeHtml, sendEmail } from '@/lib/email'
import { APPEAL_MAX_LENGTH, BAN_APPEAL_DAYS, BanAppealError, appealCutoff, appealDeadline, formatDeadline } from '@/lib/appealWindow'

type Admin = ReturnType<typeof createAdminClient>

export { BAN_APPEAL_DAYS, BanAppealError, appealDeadline, formatDeadline }

type BanRow = {
  id: string
  email: string
  first_name: string | null
  former_profile_id: string | null
  banned_at: string
  appeal_submitted_at: string | null
  appeal_denied_at: string | null
  account_deleted_at: string | null
}

const BAN_COLUMNS = 'id, email, first_name, former_profile_id, banned_at, appeal_submitted_at, appeal_denied_at, account_deleted_at'

// An appeal can be sent once, before the deadline, while the account still exists.
export function canAppeal(ban: Pick<BanRow, 'banned_at' | 'appeal_submitted_at' | 'account_deleted_at'>, now = new Date()): boolean {
  return !ban.appeal_submitted_at && !ban.account_deleted_at && now < appealDeadline(ban.banned_at)
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
}

// A failed email never undoes the decision it reports.
async function notify(to: { email: string; first_name: string | null }, subject: string, body: string): Promise<void> {
  try {
    await sendEmail({
      to: [{ email: to.email, name: to.first_name ?? undefined }],
      subject,
      htmlContent: emailShell(`
        <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">
          Hi ${escapeHtml(to.first_name ?? 'there')},
        </h2>
        ${body}
      `),
    })
  } catch (err) {
    console.error(`[Tydio] "${subject}" email failed:`, err)
  }
}

const P = 'margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;'

export const ALREADY_BANNED_MESSAGE = 'This user is already banned.'

type BanExtras = { fee_amount_cents?: number | null; stripe_payment_intent_id?: string | null }

// Writes the banned_users row (listed under Background Checks → Banned), which blocks
// signing in or up with the same email or phone. Then marks the profile banned, which
// ends their sessions, and suspends it, which pauses a Tidy Pro and blocks booking.
async function recordBan(
  admin: Admin,
  profileId: string,
  note: string | null,
  fields: { appeal_token?: string; appeal_denied_at?: string } & BanExtras
): Promise<{ id: string; banned_at: string; email: string; first_name: string | null }> {
  const [{ data: profile }, { data: tidyPro }] = await Promise.all([
    admin.from('profiles').select('email, first_name, last_name, phone').eq('id', profileId).maybeSingle(),
    admin.from('tidypro_profiles').select('phone').eq('id', profileId).maybeSingle(),
  ])
  if (!profile) throw new BanAppealError('This account no longer exists.')

  const email = profile.email.trim().toLowerCase()
  const { data: existing } = await admin.from('banned_users').select('id').eq('email', email).limit(1)
  if (existing?.length) throw new BanAppealError(ALREADY_BANNED_MESSAGE)

  const phones = [profile.phone, tidyPro?.phone].filter((p): p is string => Boolean(p)).map(normalizePhone)
  const { data: ban, error: banError } = await admin
    .from('banned_users')
    .insert({
      email,
      phones_normalized: [...new Set(phones)],
      first_name: profile.first_name,
      last_name: profile.last_name,
      note,
      former_profile_id: profileId,
      ...fields,
    })
    .select('id, banned_at')
    .single()
  if (banError) throw new Error(banError.message)

  const { error: markError } = await admin.from('profiles').update({ banned_at: ban.banned_at }).eq('id', profileId)
  if (markError) throw new Error(markError.message)
  await suspendAccounts(admin, [profileId])

  return { ...ban, email: profile.email, first_name: profile.first_name }
}

// Undoes recordBan for an account that still exists: sessions work again and the
// suspension is lifted. A Tidy Pro stays paused until an admin approves them.
export async function liftBan(admin: Admin, profileId: string): Promise<void> {
  const { error } = await admin.from('profiles').update({ banned_at: null }).eq('id', profileId)
  if (error) throw new Error(error.message)
  await unsuspendAccounts(admin, [profileId])
}

// A ban from /admin/users. Nothing is deleted yet: they're emailed a link to appeal,
// and the account is deleted BAN_APPEAL_DAYS after the ban unless an appeal has been
// accepted by then, or sooner if an appeal is denied. Refused if already banned.
export async function banAccount(admin: Admin, profileId: string, note: string | null): Promise<void> {
  const appealToken = randomBytes(32).toString('hex')
  const ban = await recordBan(admin, profileId, note, { appeal_token: appealToken })

  const deadline = formatDeadline(appealDeadline(ban.banned_at))
  await notify(ban, 'Your Tydio account has been banned', `
    <p style="${P}">
      Your Tydio account has been banned, and you've been signed out. You won't be able to sign in or
      create a new account.
    </p>
    ${note ? `<p style="margin:0 0 16px;padding:12px 16px;background:#fef2f2;border-radius:10px;color:#ef4444;font-size:14px;line-height:1.5;">${escapeHtml(note)}</p>` : ''}
    <p style="${P}">
      If you think this is a mistake, you can appeal by ${deadline}. Unless your appeal is accepted by
      then, your account and its data will be permanently deleted on that date.
    </p>
    <a href="${siteUrl()}/appeal?token=${appealToken}"
       style="display:inline-block;margin:8px 0 20px;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">
      Appeal this ban
    </a>
  `)
}

// A ban with no appeal, for when the person has already had their chance to appeal
// (a background check denial whose window has closed). The account is deleted now,
// or, if a booking or payout is still open, kept banned and retried hourly.
export async function banAndDeleteNow(
  admin: Admin,
  profileId: string,
  note: string | null,
  extras: BanExtras = {}
): Promise<{ deleted: boolean; deleteError?: string }> {
  // appeal_denied_at marks the appeal stage as over, which is what deleteExpiredBans retries.
  const ban = await recordBan(admin, profileId, note, { ...extras, appeal_denied_at: new Date().toISOString() })
  return deleteBannedAccount(admin, { id: ban.id, former_profile_id: profileId })
}

// For the public appeal page. Only one appeal per ban.
export async function submitAppeal(admin: Admin, token: string, message: string): Promise<void> {
  const text = message.trim()
  if (!text) throw new BanAppealError('Please tell us why the ban should be lifted.')
  if (text.length > APPEAL_MAX_LENGTH) throw new BanAppealError(`Please keep your appeal under ${APPEAL_MAX_LENGTH} characters.`)

  const { data: ban } = await admin.from('banned_users').select(BAN_COLUMNS).eq('appeal_token', token).maybeSingle()
  if (!ban) throw new BanAppealError('This appeal link is invalid.')
  if (ban.appeal_submitted_at) throw new BanAppealError('You have already sent an appeal. We will email you once it has been reviewed.')
  if (!canAppeal(ban)) throw new BanAppealError('The time to appeal this ban has passed.')

  const { error } = await admin
    .from('banned_users')
    .update({ appeal_message: text, appeal_submitted_at: new Date().toISOString() })
    .eq('id', ban.id)
    .is('appeal_submitted_at', null)
  if (error) throw new Error(error.message)
}

async function pendingAppeal(admin: Admin, banId: string): Promise<BanRow> {
  const { data: ban } = await admin.from('banned_users').select(BAN_COLUMNS).eq('id', banId).maybeSingle()
  if (!ban || !ban.appeal_submitted_at || ban.appeal_denied_at || ban.account_deleted_at) {
    throw new BanAppealError('This appeal has already been decided.')
  }
  return ban
}

// Lifts the ban and the suspension. A Tidy Pro stays paused until an admin approves them.
export async function acceptAppeal(admin: Admin, banId: string): Promise<void> {
  const ban = await pendingAppeal(admin, banId)

  const { error } = await admin.from('banned_users').delete().eq('id', ban.id)
  if (error) throw new Error(error.message)
  if (ban.former_profile_id) await liftBan(admin, ban.former_profile_id)

  await notify(ban, 'Your Tydio account has been reinstated', `
    <p style="${P}">We reviewed your appeal and lifted the ban on your account. You can sign in again.</p>
    <a href="${siteUrl()}/login"
       style="display:inline-block;margin:8px 0 20px;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">
      Sign in
    </a>
  `)
}

// Keeps the ban and deletes the account. If a booking or payout is still open the
// deletion is retried hourly by deleteExpiredBans until it goes through.
export async function denyAppeal(admin: Admin, banId: string): Promise<{ deleted: boolean; deleteError?: string }> {
  const ban = await pendingAppeal(admin, banId)

  const { error } = await admin.from('banned_users').update({ appeal_denied_at: new Date().toISOString() }).eq('id', ban.id)
  if (error) throw new Error(error.message)

  const result = await deleteBannedAccount(admin, ban)

  await notify(ban, 'Your Tydio appeal was not accepted', `
    <p style="${P}">
      We reviewed your appeal and the ban on your account will stay in place. Your account and its data
      ${result.deleted ? 'have been' : 'will be'} permanently deleted.
    </p>
  `)

  return result
}

async function deleteBannedAccount(admin: Admin, ban: Pick<BanRow, 'id' | 'former_profile_id'>): Promise<{ deleted: boolean; deleteError?: string }> {
  if (ban.former_profile_id) {
    const outcome = await deleteOwnAccount(admin, ban.former_profile_id)
    if ('error' in outcome) return { deleted: false, deleteError: outcome.error }
  }
  await admin.from('banned_users').update({ account_deleted_at: new Date().toISOString() }).eq('id', ban.id)
  return { deleted: true }
}

// Hourly (see 041_ban_appeals). Deletes every banned account BAN_APPEAL_DAYS after the
// ban, including any whose appeal is still waiting on a decision, and retries any
// denied appeal whose deletion was held up by an open booking or payout.
export async function deleteExpiredBans(admin: Admin, now = new Date()): Promise<{ deleted: number; held: number }> {
  const cutoff = appealCutoff(now)
  const { data: due, error } = await admin
    .from('banned_users')
    .select('id, former_profile_id')
    .is('account_deleted_at', null)
    .or(`banned_at.lt.${cutoff},appeal_denied_at.not.is.null`)
  if (error) throw new Error(error.message)

  let deleted = 0
  let held = 0
  for (const ban of due ?? []) {
    const result = await deleteBannedAccount(admin, ban)
    if (result.deleted) deleted++
    else held++
  }
  return { deleted, held }
}
