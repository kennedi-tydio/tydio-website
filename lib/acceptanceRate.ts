import type { createAdminClient } from '@/lib/supabase/admin'
import { TYDIO_ADMIN_EMAIL, emailShell, escapeHtml, sendEmail } from '@/lib/email'

type Admin = ReturnType<typeof createAdminClient>

// A Tidy Pro's acceptance rate: of the booking requests they answered, the share they
// accepted. Requests that expired, were canceled by the customer, or were taken by
// another cleaner first don't count either way (see 057_acceptance_rate).

// Below this, the cleaner and the admin are emailed.
export const ACCEPTANCE_RATE_THRESHOLD = 0.8

// One or two early declines shouldn't set off a warning, so the rate isn't judged
// until the cleaner has answered this many requests.
export const MIN_RESPONSES_FOR_ALERT = 5

export type AcceptanceStats = { accepted: number; declined: number }

export const NO_ACCEPTANCE_STATS: AcceptanceStats = { accepted: 0, declined: 0 }

export function acceptanceRate(stats: AcceptanceStats): number | null {
  const total = stats.accepted + stats.declined
  return total === 0 ? null : stats.accepted / total
}

// Whole percent, rounded down, so 79.9% never reads as "80%" while being flagged as low.
export function formatAcceptanceRate(stats: AcceptanceStats): string {
  const rate = acceptanceRate(stats)
  return rate == null ? '—' : `${Math.floor(rate * 100)}%`
}

export function isAcceptanceRateLow(stats: AcceptanceStats): boolean {
  const rate = acceptanceRate(stats)
  return rate != null && stats.accepted + stats.declined >= MIN_RESPONSES_FOR_ALERT && rate < ACCEPTANCE_RATE_THRESHOLD
}

export async function getAcceptanceStats(admin: Admin, proIds: string[]): Promise<Map<string, AcceptanceStats>> {
  const byId = new Map<string, AcceptanceStats>()
  if (proIds.length === 0) return byId
  const { data, error } = await admin
    .from('tidypro_acceptance_stats')
    .select('tidy_pro_id, accepted_count, declined_count')
    .in('tidy_pro_id', proIds)
  if (error) throw new Error(`Failed to load acceptance rates: ${error.message}`)
  for (const row of data ?? []) byId.set(row.tidy_pro_id, { accepted: row.accepted_count, declined: row.declined_count })
  return byId
}

export async function getAllAcceptanceStats(admin: Admin): Promise<Map<string, AcceptanceStats>> {
  const { data, error } = await admin.from('tidypro_acceptance_stats').select('tidy_pro_id, accepted_count, declined_count')
  if (error) throw new Error(`Failed to load acceptance rates: ${error.message}`)
  return new Map((data ?? []).map((row) => [row.tidy_pro_id, { accepted: row.accepted_count, declined: row.declined_count }]))
}

// Called after a cleaner accepts or declines. The first time the rate falls below the
// threshold, the cleaner and the admin are each emailed; that's recorded in
// low_acceptance_alerted_at, which is cleared once the rate is back up, so the next dip
// is emailed again. Never throws, so a failure here can't break the answer that set it off.
export async function checkAcceptanceRate(admin: Admin, proId: string): Promise<'alerted' | 'cleared' | null> {
  try {
    const stats = (await getAcceptanceStats(admin, [proId])).get(proId) ?? NO_ACCEPTANCE_STATS

    if (!isAcceptanceRateLow(stats)) {
      const { data: cleared, error } = await admin
        .from('tidypro_profiles')
        .update({ low_acceptance_alerted_at: null })
        .eq('id', proId)
        .not('low_acceptance_alerted_at', 'is', null)
        .select('id')
      if (error) throw new Error(error.message)
      return cleared && cleared.length > 0 ? 'cleared' : null
    }

    // Claimed before sending, so two answers landing together can't both email.
    const { data: claimed, error } = await admin
      .from('tidypro_profiles')
      .update({ low_acceptance_alerted_at: new Date().toISOString() })
      .eq('id', proId)
      .is('low_acceptance_alerted_at', null)
      .select('id')
    if (error) throw new Error(error.message)
    if (!claimed || claimed.length === 0) return null

    const { data: profile } = await admin.from('profiles').select('email, first_name, last_name').eq('id', proId).maybeSingle()
    const cleaner = {
      email: profile?.email ?? null,
      firstName: profile?.first_name ?? null,
      name: [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'A Tidy Pro',
    }

    const results = await Promise.allSettled([emailCleaner(cleaner, stats), emailAdmin(cleaner, stats)])
    for (const r of results) if (r.status === 'rejected') console.error('Low acceptance rate email failed', proId, r.reason)
    return 'alerted'
  } catch (err) {
    console.error('Acceptance rate check failed', proId, err)
    return null
  }
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

function summary(stats: AcceptanceStats): string {
  const total = stats.accepted + stats.declined
  return `${stats.declined} of ${total} booking request${total === 1 ? '' : 's'} declined`
}

const threshold = `${Math.round(ACCEPTANCE_RATE_THRESHOLD * 100)}%`
const p = 'margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;'
const button = 'display:inline-block;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;'

async function emailCleaner(cleaner: { email: string | null; firstName: string | null }, stats: AcceptanceStats): Promise<void> {
  if (!cleaner.email) return
  await sendEmail({
    to: [{ email: cleaner.email, name: cleaner.firstName ?? undefined }],
    subject: `Your acceptance rate is below ${threshold}`,
    htmlContent: emailShell(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">Hi ${escapeHtml(cleaner.firstName ?? 'there')},</h2>
      <p style="${p}">Your booking acceptance rate is now <strong>${formatAcceptanceRate(stats)}</strong> (${summary(stats)}). We ask Tidy Pros to keep it at ${threshold} or higher, so customers can count on getting a booking.</p>
      <p style="${p}">If you can't take jobs on certain days, add them as time off on your Availability page, or turn on Away. You won't get requests for those times, and they won't count against you.</p>
      <a href="${siteUrl()}/pro/profile/availability" style="${button}">Update availability</a>
    `),
  })
}

async function emailAdmin(cleaner: { email: string | null; name: string }, stats: AcceptanceStats): Promise<void> {
  const who = cleaner.email ? `${escapeHtml(cleaner.name)} (${escapeHtml(cleaner.email)})` : escapeHtml(cleaner.name)
  const adminLink = cleaner.email ? `${siteUrl()}/admin/users?search=${encodeURIComponent(cleaner.email)}` : `${siteUrl()}/admin/users?role=TIDYPRO&acceptance=low`
  await sendEmail({
    to: [{ email: TYDIO_ADMIN_EMAIL }],
    subject: `${cleaner.name}'s acceptance rate fell below ${threshold}`,
    htmlContent: emailShell(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">Low acceptance rate</h2>
      <p style="${p}">${who} now has an acceptance rate of <strong>${formatAcceptanceRate(stats)}</strong> (${summary(stats)}). They've been emailed too.</p>
      <a href="${adminLink}" style="${button}">View in admin</a>
    `),
  })
}
