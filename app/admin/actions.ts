'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { setAdminCookie, clearAdminCookie, isAdminAuthed, isAdminSecret } from '@/lib/auth/admin'
import { RATE_LIMITED_MESSAGE, RATE_LIMITS, clientIp, isRateLimited, recordRateLimitEvent } from '@/lib/rateLimit'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyIfOnboardingComplete } from '@/lib/onboardingComplete'
import { sendEmail, emailShell, escapeHtml } from '@/lib/email'
import { researchAreaMarketPrice, researchStateMedianPrice } from '@/lib/marketPricing'
import { canSendSms, sendSmsForPayload } from '@/lib/sms'
import { sendPush, sendPushForPayload } from '@/lib/push'
import { listPushRecipients, parseAdminPushForm, pickRecipients } from '@/lib/adminPush'
import { notifyInsuranceDenied } from '@/lib/notifications'
import { stripe } from '@/lib/stripe'
import { hasPaidFee, isFeeRefundReason } from '@/lib/backgroundCheckFee'
import { expirationDateError } from '@/lib/insuranceExpiration'
import {
  BackgroundCheckStateError,
  denyCleaner,
  sendBackgroundCheckFollowUp,
  passBackgroundCheck,
  sendBackgroundCheckLink,
} from '@/lib/backgroundCheck'
import { recordFeeRefund } from '@/lib/stripe/backgroundCheckFee'
import { FOLLOW_UP_KINDS, type FollowUpKind } from '@/lib/backgroundCheckFollowUp'
import { emailSignedAgreement } from '@/lib/legal/agreementSigning'
import { suspendAccounts, unsuspendAccounts } from '@/lib/accountSuspension'
import { OPEN_BOOKINGS_MESSAGE, UNPAID_PAYOUT_MESSAGE, deleteOwnAccount } from '@/lib/accountDeletion'
import { acceptBackgroundCheckAppeal, denyBackgroundCheckAppeal } from '@/lib/backgroundCheckAppeals'
import { ALREADY_BANNED_MESSAGE, BAN_APPEAL_DAYS, BanAppealError, acceptAppeal, banAccount, denyAppeal, liftBan } from '@/lib/banAccount'
import { pauseCleaner } from '@/lib/cleanerStatus'
import { isRefundLevel, resolveBookingIncident } from '@/lib/bookingIncidents'
import { ADMIN_REFUND_LABELS, cancelBookingAsAdmin, isAdminRefund } from '@/lib/bookingRequestGroups'

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function adminLoginAction(
  _prev: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const secret = formData.get('secret') as string
  const admin = createAdminClient()
  const ipKey = `admin-login:ip:${await clientIp()}`
  if (await isRateLimited(admin, ipKey, RATE_LIMITS.adminLoginPerIp)) return { error: RATE_LIMITED_MESSAGE }
  if (!isAdminSecret(secret)) {
    await recordRateLimitEvent(admin, ipKey)
    return { error: 'Invalid password' }
  }
  await setAdminCookie()
  redirect('/admin')
}

export async function adminLogoutAction(_formData: FormData): Promise<void> {
  await clearAdminCookie()
  redirect('/admin/login')
}

// ─── Service Areas ────────────────────────────────────────────────────────────

export async function createServiceAreaAction(
  _prev: { error?: string; success?: boolean },
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  if (!(await isAdminAuthed())) return { error: 'Unauthorized' }

  const name = (formData.get('name') as string)?.trim()
  const city = (formData.get('city') as string)?.trim() || null
  const statusRaw = (formData.get('status') as string) ?? 'waitlist_only'
  const status = statusRaw as 'waitlist_only' | 'beta_open' | 'paused_recruiting_cleaners' | 'closed'

  if (!name) return { error: 'Name is required' }

  const admin = createAdminClient()
  const { error } = await admin.from('service_areas').insert({ name, city, status })
  if (error) return { error: error.message }

  revalidatePath('/admin/service-areas')
  return { success: true }
}

export async function addZipCodeAction(
  _prev: { error?: string; success?: boolean },
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  if (!(await isAdminAuthed())) return { error: 'Unauthorized' }

  const serviceAreaId = formData.get('service_area_id') as string
  const zipCode = (formData.get('zip_code') as string)?.trim()

  if (!serviceAreaId || !zipCode) return { error: 'Missing fields' }
  if (!/^\d{5}$/.test(zipCode)) return { error: 'ZIP must be 5 digits' }

  const admin = createAdminClient()
  const { error } = await admin.from('service_area_zip_codes').insert({
    service_area_id: serviceAreaId,
    zip_code: zipCode,
  })

  if (error) {
    if (error.code === '23505') return { error: `ZIP ${zipCode} is already in this area` }
    return { error: error.message }
  }

  // If the area is already active, immediately grant access to waitlisted users in this ZIP
  const { data: area } = await admin
    .from('service_areas')
    .select('status')
    .eq('id', serviceAreaId)
    .single()

  if (area?.status === 'beta_open') {
    const { data: waitlistedUsers } = await admin
      .from('profiles')
      .select('id, email, first_name')
      .eq('zip_code', zipCode)
      .eq('booking_access_status', 'waitlisted')
      .eq('role', 'USER')

    const users = waitlistedUsers ?? []
    if (users.length > 0) {
      await admin.from('profiles').update({
        booking_access_status: 'booking_allowed',
        service_area_id: serviceAreaId,
        booking_access_granted_at: new Date().toISOString(),
        waitlisted: false,
      }).in('id', users.map(u => u.id))

      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
      await Promise.allSettled(users.map(user =>
        sendEmail({
          to: [{ email: user.email, name: user.first_name ?? undefined }],
          subject: 'Tydio is now available in your area!',
          htmlContent: emailShell(`
            <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">
              Great news, ${user.first_name ?? 'neighbor'}!
            </h2>
            <p style="margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;">
              Tydio Beta is now live in your area. You can now browse vetted Tidy Pros
              and book your first cleaning — right from the app or website!
            </p>
            <a href="${siteUrl}/dashboard"
               style="display:inline-block;margin:8px 0 20px;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">
              Book a cleaning
            </a>
            <p style="margin:0;color:#94a3b8;font-size:13px;">
              You were notified because you signed up for the Tydio waitlist.
            </p>
          `),
        })
      ))
    }

    revalidatePath('/admin')
  }

  revalidatePath('/admin/service-areas')
  return { success: true }
}

export async function activateAreaAction(
  serviceAreaId: string,
  _formData: FormData
): Promise<void> {
  if (!(await isAdminAuthed())) return

  const admin = createAdminClient()

  const { data: area } = await admin
    .from('service_areas')
    .select('id, name, status')
    .eq('id', serviceAreaId)
    .single()

  if (!area) return

  const { data: zipRows } = await admin
    .from('service_area_zip_codes')
    .select('zip_code')
    .eq('service_area_id', serviceAreaId)

  const zips = (zipRows ?? []).map(r => r.zip_code)
  if (zips.length === 0) return

  if (area.status !== 'beta_open') {
    await admin
      .from('service_areas')
      .update({ status: 'beta_open', updated_at: new Date().toISOString() })
      .eq('id', serviceAreaId)
  }

  const { data: waitlistedUsers } = await admin
    .from('profiles')
    .select('id, email, first_name')
    .in('zip_code', zips)
    .eq('booking_access_status', 'waitlisted')
    .eq('role', 'USER')

  const users = waitlistedUsers ?? []

  if (users.length > 0) {
    await admin.from('profiles').update({
      booking_access_status: 'booking_allowed',
      service_area_id: serviceAreaId,
      booking_access_granted_at: new Date().toISOString(),
      waitlisted: false,
    }).in('id', users.map(u => u.id))

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
    await Promise.allSettled(users.map(user =>
      sendEmail({
        to: [{ email: user.email, name: user.first_name ?? undefined }],
        subject: 'Tydio is now available in your area!',
        htmlContent: emailShell(`
          <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">
            Great news, ${user.first_name ?? 'neighbor'}!
          </h2>
          <p style="margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;">
            Tydio Beta is now live in your area. You can now browse vetted Tidy Pros
            and book your first cleaning — right from the app.
          </p>
          <a href="${siteUrl}/dashboard"
             style="display:inline-block;margin:8px 0 20px;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">
            Book a cleaning
          </a>
          <p style="margin:0;color:#94a3b8;font-size:13px;">
            You were notified because you signed up for the Tydio waitlist.
          </p>
        `),
      })
    ))
  }

  await admin.from('service_area_activation_events').insert({
    service_area_id: serviceAreaId,
    previous_status: area.status,
    new_status: 'beta_open',
    users_notified_count: users.length,
  })

  revalidatePath('/admin/service-areas')
  revalidatePath('/admin')
}

export async function pauseAreaAction(
  serviceAreaId: string,
  _formData: FormData
): Promise<void> {
  if (!(await isAdminAuthed())) return

  const admin = createAdminClient()
  await admin.from('service_areas').update({
    status: 'paused_recruiting_cleaners',
    updated_at: new Date().toISOString(),
  }).eq('id', serviceAreaId)

  revalidatePath('/admin/service-areas')
}

export async function researchMarketPriceAction(
  serviceAreaId: string,
  _formData: FormData
): Promise<void> {
  if (!(await isAdminAuthed())) return

  const admin = createAdminClient()
  const { data: area } = await admin
    .from('service_areas')
    .select('name, city, state')
    .eq('id', serviceAreaId)
    .single()

  if (!area) return

  try {
    const { price, summary } = await researchAreaMarketPrice(area)
    await admin.from('service_areas').update({
      market_price: price,
      market_price_summary: summary,
      market_price_researched_at: new Date().toISOString(),
    }).eq('id', serviceAreaId)
  } catch (err) {
    console.error('Market price research failed', err)
  }

  revalidatePath('/admin/service-areas')
}

export async function deleteZipCodeAction(
  zipId: string,
  _formData: FormData
): Promise<void> {
  if (!(await isAdminAuthed())) return

  const admin = createAdminClient()
  await admin.from('service_area_zip_codes').delete().eq('id', zipId)
  revalidatePath('/admin/service-areas')
}

// ─── State Pricing ────────────────────────────────────────────────────────────

const PRICE_PATTERN = /^\d+(\.\d{1,2})?$/

function parsePrice(raw: FormDataEntryValue | null): { value?: number; error?: string } {
  const str = (raw as string)?.trim()
  if (!str) return { error: 'Median 4-hour price is required' }
  if (!PRICE_PATTERN.test(str)) return { error: 'Price must be a valid amount with at most 2 decimal places' }
  const value = Number(str)
  if (!Number.isFinite(value) || value <= 0) return { error: 'Price must be greater than zero' }
  return { value }
}

export async function createStatePriceAction(
  _prev: { error?: string; success?: boolean },
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  if (!(await isAdminAuthed())) return { error: 'Unauthorized' }

  const state = (formData.get('state') as string)?.trim()
  if (!state) return { error: 'State is required' }

  const { value: price, error: priceError } = parsePrice(formData.get('median_four_hour_price'))
  if (priceError) return { error: priceError }

  const admin = createAdminClient()
  const { error } = await admin.from('state_pricing').insert({
    state,
    median_four_hour_price: price as number,
    pricing_active: true,
  })

  if (error) {
    if (error.code === '23505') return { error: `${state} already has a price — edit it below instead` }
    return { error: error.message }
  }

  revalidatePath('/admin/state-pricing')
  return { success: true }
}

export async function updateStatePriceAction(
  statePricingId: string,
  _prev: { error?: string; success?: boolean },
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  if (!(await isAdminAuthed())) return { error: 'Unauthorized' }

  const { value: price, error: priceError } = parsePrice(formData.get('median_four_hour_price'))
  if (priceError) return { error: priceError }

  const admin = createAdminClient()
  const { error } = await admin
    .from('state_pricing')
    .update({ median_four_hour_price: price, updated_at: new Date().toISOString() })
    .eq('id', statePricingId)

  if (error) return { error: error.message }

  revalidatePath('/admin/state-pricing')
  return { success: true }
}

export async function activateStatePricingAction(
  statePricingId: string,
  _formData: FormData
): Promise<void> {
  if (!(await isAdminAuthed())) return

  const admin = createAdminClient()
  await admin
    .from('state_pricing')
    .update({ pricing_active: true, updated_at: new Date().toISOString() })
    .eq('id', statePricingId)

  revalidatePath('/admin/state-pricing')
}

export async function deactivateStatePricingAction(
  statePricingId: string,
  _formData: FormData
): Promise<void> {
  if (!(await isAdminAuthed())) return

  const admin = createAdminClient()
  await admin
    .from('state_pricing')
    .update({ pricing_active: false, updated_at: new Date().toISOString() })
    .eq('id', statePricingId)

  revalidatePath('/admin/state-pricing')
}

// AI-assisted suggestion for a state's median price (admin-triggered, not
// automatic) — creates or refreshes that state's state_pricing row.
export async function researchStatePriceAction(formData: FormData): Promise<void> {
  if (!(await isAdminAuthed())) return

  const state = (formData.get('state') as string)?.trim()
  if (!state) return

  const admin = createAdminClient()

  try {
    const { price } = await researchStateMedianPrice(state)

    const { data: existing } = await admin
      .from('state_pricing')
      .select('id')
      .eq('state', state)
      .maybeSingle()

    if (existing) {
      await admin
        .from('state_pricing')
        .update({ median_four_hour_price: price, pricing_active: true, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      await admin.from('state_pricing').insert({ state, median_four_hour_price: price, pricing_active: true })
    }
  } catch (err) {
    console.error('State price research failed', err)
  }

  revalidatePath('/admin/state-pricing')
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function grantAccessAction(
  profileId: string,
  _formData: FormData
): Promise<void> {
  if (!(await isAdminAuthed())) return

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').update({
    booking_access_status: 'booking_allowed',
    booking_access_granted_at: new Date().toISOString(),
    waitlisted: false,
  }).eq('id', profileId).select('role, email, first_name').single()

  // They're sitting on the /waitlist screen, so tell them they're in. A failed
  // email shouldn't undo the grant — they'll still get in on their next visit.
  if (profile) {
    const isPro = profile.role === 'TIDYPRO'
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
    try {
      await sendEmail({
        to: [{ email: profile.email, name: profile.first_name ?? undefined }],
        subject: "You're off the Tydio waitlist!",
        htmlContent: emailShell(`
          <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">
            You're in, ${escapeHtml(profile.first_name ?? 'there')}!
          </h2>
          <p style="margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;">
            ${isPro
              ? 'Your Tidy Pro account is ready. Sign in to finish setting up your cleaner profile and start accepting jobs.'
              : 'Your Tydio account is ready. Sign in to browse vetted Tidy Pros and book your first cleaning.'}
          </p>
          <a href="${siteUrl}${isPro ? '/pro/onboarding' : '/dashboard'}"
             style="display:inline-block;margin:8px 0 20px;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">
            ${isPro ? 'Get started' : 'Book a cleaning'}
          </a>
          <p style="margin:0;color:#94a3b8;font-size:13px;">
            You were notified because you signed up for Tydio.
          </p>
        `),
      })
    } catch (err) {
      console.error('[Tydio] Access granted email failed:', err)
    }
  }

  revalidatePath('/admin/users')
  revalidatePath('/admin')
}

// Turns down someone on the signup waitlist. Their account is kept (marked
// 'denied') so the decision can be reversed with Grant Access — unlike the
// background-check denial, nothing is banned or deleted.
export async function denyAccessAction(
  profileId: string,
  _formData: FormData
): Promise<void> {
  if (!(await isAdminAuthed())) return

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').update({
    booking_access_status: 'denied',
    booking_access_granted_at: null,
    waitlisted: true,
  }).eq('id', profileId).eq('booking_access_status', 'waitlisted').select('email, first_name').maybeSingle()

  if (profile) {
    try {
      await sendEmail({
        to: [{ email: profile.email, name: profile.first_name ?? undefined }],
        subject: 'An update on your Tydio account',
        htmlContent: emailShell(`
          <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">
            Hi ${escapeHtml(profile.first_name ?? 'there')},
          </h2>
          <p style="margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;">
            Thanks for your interest in Tydio. We're only able to bring a limited number of people on
            during early access, and we can't offer you access at this time.
          </p>
          <p style="margin:0;color:#94a3b8;font-size:13px;">
            You were notified because you signed up for Tydio.
          </p>
        `),
      })
    } catch (err) {
      console.error('[Tydio] Access denied email failed:', err)
    }
  }

  revalidatePath('/admin/users')
  revalidatePath('/admin')
}

export async function revokeAccessAction(
  profileId: string,
  _formData: FormData
): Promise<void> {
  if (!(await isAdminAuthed())) return

  const admin = createAdminClient()
  await admin.from('profiles').update({
    booking_access_status: 'waitlisted',
    booking_access_granted_at: null,
    waitlisted: true,
  }).eq('id', profileId)

  revalidatePath('/admin/users')
  revalidatePath('/admin')
}

// ─── Suspending, Deleting & Banning Accounts ────────────────────────────────

export type AccountActionState = { error?: string; message?: string }

const ACCOUNT_INTENTS = ['suspend', 'unsuspend', 'delete', 'ban'] as const
type AccountIntent = (typeof ACCOUNT_INTENTS)[number]

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

// One action for the row buttons and the bulk bar on /admin/users: `ids` holds one
// profile id or many. Admin accounts are always skipped. Deleting goes through the
// same rules as deleting your own account, so anyone with an open booking or an
// unpaid payout is left in place and named in the result. Banning suspends the
// account and emails them a link to appeal; see lib/banAccount.
export async function manageAccountsAction(
  _prev: AccountActionState,
  formData: FormData
): Promise<AccountActionState> {
  if (!(await isAdminAuthed())) return { error: 'Unauthorized' }

  const intent = formData.get('intent') as AccountIntent
  if (!ACCOUNT_INTENTS.includes(intent)) return { error: 'Unknown action.' }

  const requestedIds = [...new Set(formData.getAll('ids').map(String).filter(Boolean))]
  if (requestedIds.length === 0) return { error: 'Select at least one account.' }

  const admin = createAdminClient()
  const { data: profiles, error: lookupError } = await admin
    .from('profiles')
    .select('id, role, first_name, last_name, email')
    .in('id', requestedIds)
  if (lookupError) return { error: lookupError.message }

  const targets = (profiles ?? []).filter(p => p.role !== 'ADMIN')
  const skippedAdmins = (profiles ?? []).length - targets.length
  const adminNote = skippedAdmins > 0 ? ` Skipped ${plural(skippedAdmins, 'admin account')}.` : ''
  if (targets.length === 0) return { error: `No accounts to change.${adminNote}` }
  const ids = targets.map(p => p.id)

  let result: AccountActionState
  try {
    if (intent === 'suspend') {
      const count = await suspendAccounts(admin, ids)
      result = { message: `Suspended ${plural(count, 'account')}.${adminNote}` }
    } else if (intent === 'unsuspend') {
      const count = await unsuspendAccounts(admin, ids)
      const proNote = targets.some(p => p.role === 'TIDYPRO') ? ' Tidy Pros stay paused until you approve them.' : ''
      result = { message: `Unsuspended ${plural(count, 'account')}.${proNote}${adminNote}` }
    } else if (intent === 'delete') {
      result = await deleteAccounts(admin, targets, adminNote)
    } else {
      const note = (formData.get('note') as string | null)?.trim() || null
      result = await banAccounts(admin, targets, note, adminNote)
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Something went wrong.' }
  }

  revalidatePath('/admin/users')
  revalidatePath('/admin/background-checks')
  revalidatePath('/admin')
  return result
}

type AccountTarget = { id: string; role: string; first_name: string | null; last_name: string | null; email: string }

function displayName(profile: AccountTarget): string {
  return [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email
}

function deleteRefusalReason(error: string): string {
  return error === OPEN_BOOKINGS_MESSAGE ? 'open bookings'
    : error === UNPAID_PAYOUT_MESSAGE ? 'Tidy Pro payout still owed'
    : 'delete failed'
}

// One at a time, so a failure partway through still reports what was deleted.
// Each deleted account is logged for the Deleted Accounts list; a failed log
// doesn't undo the delete, it's only reported.
async function deleteAccounts(
  admin: ReturnType<typeof createAdminClient>,
  targets: AccountTarget[],
  adminNote: string
): Promise<AccountActionState> {
  let deleted = 0
  const refused: string[] = []
  for (const profile of targets) {
    const outcome = await deleteOwnAccount(admin, profile.id)
    if ('success' in outcome) {
      deleted++
      const { error: logError } = await admin.from('deleted_accounts').insert({
        former_profile_id: profile.id,
        email: profile.email,
        first_name: profile.first_name,
        last_name: profile.last_name,
        role: profile.role,
      })
      if (logError) console.error('[Tydio] Logging deleted account failed:', logError)
      continue
    }
    refused.push(`${displayName(profile)} (${deleteRefusalReason(outcome.error)})`)
  }

  const deletedNote = `Deleted ${plural(deleted, 'account')}.${adminNote}`
  if (refused.length === 0) return { message: deletedNote }
  return { error: `${deletedNote} Couldn't delete ${refused.length}: ${refused.join(', ')}.` }
}

// One at a time, so a failure partway through still reports who was banned.
async function banAccounts(
  admin: ReturnType<typeof createAdminClient>,
  targets: AccountTarget[],
  note: string | null,
  adminNote: string
): Promise<AccountActionState> {
  let banned = 0
  const failed: string[] = []
  for (const profile of targets) {
    try {
      await banAccount(admin, profile.id, note)
      banned++
    } catch (err) {
      failed.push(`${displayName(profile)} (${err instanceof Error ? err.message : 'ban failed'})`)
    }
  }

  // A single account that was already banned reads better as just the reason.
  if (targets.length === 1 && failed.length === 1) {
    return { error: failed[0].endsWith(`(${ALREADY_BANNED_MESSAGE})`) ? ALREADY_BANNED_MESSAGE : `Couldn't ban ${failed[0]}.` }
  }

  const message = `Banned ${plural(banned, 'account')}. They've been signed out and emailed a link to appeal; each account is deleted ${BAN_APPEAL_DAYS} days after its ban unless an appeal is accepted first.${adminNote}`
  if (failed.length > 0) return { error: `${message} Couldn't ban ${failed.length}: ${failed.join(', ')}.` }
  return { message }
}

// ─── Cleaners (Tidy Pros) ───────────────────────────────────────────────────

export async function approveCleanerAction(
  profileId: string,
  _formData: FormData
): Promise<void> {
  if (!(await isAdminAuthed())) return

  const admin = createAdminClient()
  await admin.from('tidypro_profiles').update({
    cleaner_status: 'approved',
    active_for_booking: true,
    approved_at: new Date().toISOString(),
    paused_at: null,
    pause_reason: null,
  }).eq('id', profileId)
  await notifyIfOnboardingComplete(admin, profileId)

  revalidatePath('/admin/users')
  revalidatePath('/admin')
}

// For a signed contractor agreement whose email didn't go out at signing.
const USER_NOTE_MAX_LENGTH = 2000

// Saves the admin's private note on a user. An empty note removes it.
export async function saveUserNoteAction(
  profileId: string,
  _prev: AccountActionState,
  formData: FormData
): Promise<AccountActionState> {
  if (!(await isAdminAuthed())) return { error: 'Unauthorized' }

  const note = String(formData.get('note') ?? '').trim()
  if (note.length > USER_NOTE_MAX_LENGTH) return { error: `Keep notes under ${USER_NOTE_MAX_LENGTH} characters.` }

  const admin = createAdminClient()
  const { error } = note
    ? await admin
        .from('admin_user_notes')
        .upsert({ profile_id: profileId, note, updated_at: new Date().toISOString() })
    : await admin.from('admin_user_notes').delete().eq('profile_id', profileId)
  if (error) return { error: `Couldn't save the note: ${error.message}` }

  revalidatePath('/admin/users')
  return { message: note ? 'Saved' : 'Note removed' }
}

export async function resendSignedAgreementAction(signatureId: string): Promise<void> {
  if (!(await isAdminAuthed())) return
  const result = await emailSignedAgreement(createAdminClient(), signatureId)
  if ('error' in result) throw new Error(result.error)
  revalidatePath('/admin/users')
}

// Only for the refund cases in the cleaner agreement, which the admin must pick
// from. A Stripe failure throws rather than returning quietly, so nobody assumes
// money went back when it didn't. Stripe's dashboard is the place for anything else.
export async function refundBackgroundCheckFeeAction(profileId: string, formData: FormData): Promise<void> {
  if (!(await isAdminAuthed())) return

  const reason = formData.get('reason')
  if (!isFeeRefundReason(reason)) throw new Error('Choose a refund reason.')

  const admin = createAdminClient()
  const { data: check } = await admin
    .from('background_checks')
    .select('fee_paid_at, fee_refunded_at, stripe_payment_intent_id')
    .eq('pro_id', profileId)
    .maybeSingle()

  if (!hasPaidFee(check) || !check?.stripe_payment_intent_id) throw new Error('This cleaner has no fee to refund.')

  const refund = await stripe.refunds.create(
    { payment_intent: check.stripe_payment_intent_id },
    { idempotencyKey: `fee-refund-${check.stripe_payment_intent_id}` }
  )
  await recordFeeRefund(admin, check.stripe_payment_intent_id, { reason, refundId: refund.id })

  revalidatePath('/admin/users')
}

export async function pauseCleanerAction(
  profileId: string,
  _formData: FormData
): Promise<void> {
  if (!(await isAdminAuthed())) return

  await pauseCleaner(createAdminClient(), profileId)

  revalidatePath('/admin/users')
  revalidatePath('/admin')
}

// ─── Background Checks ──────────────────────────────────────────────────────

function revalidateBackgroundCheckPages() {
  revalidatePath('/admin/background-checks')
  revalidatePath('/admin/users')
  revalidatePath('/admin')
}

export type BackgroundCheckFormState = { error?: string; message?: string }

// Problems come back as state rather than thrown, since production hides a
// thrown error's message and the admin needs to read it.
function stateError(err: unknown): BackgroundCheckFormState {
  if (err instanceof BackgroundCheckStateError) return { error: err.message }
  throw err
}

// Checkr emails the cleaner its own invitation when the admin orders the check,
// so there's no link to pass along: this records that it went out and tells the
// cleaner to look for Checkr's email.
export async function markScreeningSentAction(
  profileId: string,
  _prev: BackgroundCheckFormState,
  formData: FormData
): Promise<BackgroundCheckFormState> {
  if (!(await isAdminAuthed())) return { error: 'Unauthorized' }
  if (formData.get('ordered') !== 'on') {
    return { error: 'Confirm the background check and ID verification were ordered in Checkr first.' }
  }

  try {
    await sendBackgroundCheckLink(createAdminClient(), profileId, null)
  } catch (err) {
    return stateError(err)
  }

  revalidateBackgroundCheckPages()
  return { message: 'Marked as sent.' }
}

// A reminder email to a cleaner who's stalled before paying, or after Checkr's
// invitation went out. A send that fails is reported rather than thrown, so the
// admin knows to try again.
export async function sendBackgroundCheckFollowUpAction(
  profileId: string,
  _prev: BackgroundCheckFormState,
  formData: FormData
): Promise<BackgroundCheckFormState> {
  if (!(await isAdminAuthed())) return { error: 'Unauthorized' }

  const kind = formData.get('kind') as FollowUpKind | null
  if (!kind || !FOLLOW_UP_KINDS.includes(kind)) return { error: 'Choose which reminder to send.' }

  try {
    await sendBackgroundCheckFollowUp(createAdminClient(), profileId, kind)
  } catch (err) {
    if (err instanceof BackgroundCheckStateError) return { error: err.message }
    console.error('Background check follow-up email failed', err)
    return { error: "The email couldn't be sent. Try again in a moment." }
  }
  return { message: 'Follow-up email sent.' }
}

const DECISIONS = ['approve', 'deny'] as const
type Decision = (typeof DECISIONS)[number]

function denialLabel(backgroundCheck: Decision, idVerification: Decision): string {
  if (backgroundCheck === 'deny' && idVerification === 'deny') return 'Background check and ID verification not passed'
  return backgroundCheck === 'deny' ? 'Background check not passed' : 'ID verification not passed'
}

// One decision for each part of the screening, and one reason that covers both.
// Approving both approves the cleaner; denying either denies them, with the
// reason (led by which part failed) emailed to them. The confirmation is there
// because denying someone over a report has to go through Checkr's adverse
// action notices, which this doesn't send.
export async function decideBackgroundCheckAction(
  profileId: string,
  _prev: BackgroundCheckFormState,
  formData: FormData
): Promise<BackgroundCheckFormState> {
  if (!(await isAdminAuthed())) return { error: 'Unauthorized' }

  const backgroundCheck = formData.get('backgroundCheck') as Decision | null
  const idVerification = formData.get('idVerification') as Decision | null
  if (!backgroundCheck || !idVerification || !DECISIONS.includes(backgroundCheck) || !DECISIONS.includes(idVerification)) {
    return { error: 'Choose approve or deny for both the background check and ID verification.' }
  }

  const admin = createAdminClient()
  try {
    if (backgroundCheck === 'approve' && idVerification === 'approve') {
      await passBackgroundCheck(admin, profileId)
    } else {
      const reason = (formData.get('reason') as string | null)?.trim()
      if (!reason) return { error: 'Give a reason for the denial. It is sent to the cleaner.' }
      if (formData.get('noticesConfirmed') !== 'on') return { error: 'Confirm the adverse action requirement before denying.' }
      await denyCleaner(admin, profileId, `${denialLabel(backgroundCheck, idVerification)}: ${reason}`)
    }
  } catch (err) {
    return stateError(err)
  }

  revalidateBackgroundCheckPages()
  revalidatePath('/admin/appeals')
  return { message: backgroundCheck === 'approve' && idVerification === 'approve' ? 'Approved.' : 'Denied.' }
}

// Lets them sign up again. If their account hasn't been deleted yet (still in the
// appeal window), its suspension is lifted too.
export async function removeBanAction(banId: string, _formData: FormData): Promise<void> {
  if (!(await isAdminAuthed())) return

  const admin = createAdminClient()
  const { data: ban, error } = await admin
    .from('banned_users')
    .delete()
    .eq('id', banId)
    .select('former_profile_id, account_deleted_at')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (ban?.former_profile_id && !ban.account_deleted_at) await liftBan(admin, ban.former_profile_id)

  revalidateBackgroundCheckPages()
  revalidatePath('/admin/appeals')
}

// ─── Ban Appeals ────────────────────────────────────────────────────────────

function revalidateAppealPages() {
  revalidatePath('/admin/appeals')
  revalidateBackgroundCheckPages()
}

export async function acceptAppealAction(banId: string, _prev: AccountActionState, _formData: FormData): Promise<AccountActionState> {
  if (!(await isAdminAuthed())) return { error: 'Unauthorized' }

  try {
    await acceptAppeal(createAdminClient(), banId)
  } catch (err) {
    if (err instanceof BanAppealError) return { error: err.message }
    throw err
  }

  revalidateAppealPages()
  return { message: 'Appeal accepted. Their account is reinstated and they have been emailed.' }
}

export async function denyAppealAction(banId: string, _prev: AccountActionState, _formData: FormData): Promise<AccountActionState> {
  if (!(await isAdminAuthed())) return { error: 'Unauthorized' }

  let result: Awaited<ReturnType<typeof denyAppeal>>
  try {
    result = await denyAppeal(createAdminClient(), banId)
  } catch (err) {
    if (err instanceof BanAppealError) return { error: err.message }
    throw err
  }

  revalidateAppealPages()
  if (result.deleted) return { message: 'Appeal denied. Their account has been deleted and they have been emailed.' }
  return {
    message: `Appeal denied and they have been emailed. Their account is kept suspended until it can be deleted (${deleteRefusalReason(result.deleteError ?? '')}); this is retried hourly.`,
  }
}

// ─── Insurance ──────────────────────────────────────────────────────────────

// The expiration date comes from the policy itself, so it's required before approving:
// it's what later tells the cleaner and admin that an updated policy is needed.
export async function approveInsuranceAction(profileId: string, formData: FormData): Promise<void> {
  if (!(await isAdminAuthed())) return

  const expirationDate = formData.get('expirationDate')
  const dateError = expirationDateError(expirationDate)
  if (dateError) throw new Error(dateError)

  const admin = createAdminClient()
  const { error } = await admin.from('tidypro_profiles').update({
    insurance_status: 'approved',
    is_insured: true,
    insurance_denial_reason: null,
    insurance_verified_at: new Date().toISOString(),
    insurance_policy_expiration_date: expirationDate as string,
    insurance_expiry_reminder_sent_at: null,
  }).eq('id', profileId)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/insurance')
  revalidatePath('/admin')
}

// For correcting a date, or adding one to a policy approved before dates were required.
export async function updateInsuranceExpirationAction(profileId: string, formData: FormData): Promise<void> {
  if (!(await isAdminAuthed())) return

  const expirationDate = formData.get('expirationDate')
  const dateError = expirationDateError(expirationDate)
  if (dateError) throw new Error(dateError)

  const { error } = await createAdminClient()
    .from('tidypro_profiles')
    .update({ insurance_policy_expiration_date: expirationDate as string, insurance_expiry_reminder_sent_at: null })
    .eq('id', profileId)
    .eq('insurance_status', 'approved')
  if (error) throw new Error(error.message)

  revalidatePath('/admin/insurance')
}

export async function denyInsuranceAction(
  profileId: string,
  formData: FormData
): Promise<void> {
  if (!(await isAdminAuthed())) return

  const reason = (formData.get('reason') as string)?.trim()
  if (!reason) return

  const admin = createAdminClient()
  await admin.from('tidypro_profiles').update({
    insurance_status: 'denied',
    is_insured: false,
    insurance_denial_reason: reason,
    insurance_verified_at: new Date().toISOString(),
  }).eq('id', profileId)

  const { data: pro } = await admin
    .from('profiles')
    .select('email, first_name, phone')
    .eq('id', profileId)
    .maybeSingle()
  const { data: tidyPro } = await admin
    .from('tidypro_profiles')
    .select('sms_consent')
    .eq('id', profileId)
    .maybeSingle()

  if (pro) {
    const payload = notifyInsuranceDenied(reason)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

    await sendEmail({
      to: [{ email: pro.email, name: pro.first_name ?? undefined }],
      subject: 'Your insurance document needs attention',
      htmlContent: emailShell(`
        <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">
          Hi ${pro.first_name ?? 'there'},
        </h2>
        <p style="margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;">
          We reviewed the proof of insurance you submitted, and unfortunately we couldn't approve it:
        </p>
        <p style="margin:0 0 16px;padding:12px 16px;background:#fef2f2;border-radius:10px;color:#ef4444;font-size:14px;line-height:1.5;">
          ${reason}
        </p>
        <p style="margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;">
          Please upload another document, or get covered through our partner Next Insurance.
        </p>
        <a href="${siteUrl}/pro/profile/insurance"
           style="display:inline-block;margin:8px 0 20px;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">
          Upload Proof of Insurance
        </a>
      `),
    }).catch(() => {})

    if (canSendSms(tidyPro?.sms_consent ?? null, pro.phone ?? null)) {
      await sendSmsForPayload(pro.phone!, payload).catch(() => {})
    }
    await sendPushForPayload(profileId, payload).catch(() => {})
  }

  revalidatePath('/admin/insurance')
  revalidatePath('/admin')
}

// ─── Incidents (no access, no-show) ─────────────────────────────────────────

export type ResolveIncidentState = { error?: string; message?: string }

export async function resolveIncidentAction(
  bookingId: string,
  _prev: ResolveIncidentState,
  formData: FormData
): Promise<ResolveIncidentState> {
  if (!(await isAdminAuthed())) return { error: 'Unauthorized' }

  const level = String(formData.get('refund_level') ?? '')
  if (!isRefundLevel(level)) return { error: 'Choose a refund.' }
  const note = String(formData.get('note') ?? '').trim() || null
  const pause = formData.get('pause_cleaner') === 'on'

  const result = await resolveBookingIncident(createAdminClient(), bookingId, level, note, pause)
  if ('error' in result) return { error: result.error }

  revalidatePath('/admin/incidents')
  revalidatePath(`/admin/incidents/${bookingId}`)
  revalidatePath('/admin/users')
  return { message: result.warning ? `Settled. ${result.warning}` : 'Settled. The customer and cleaner have been emailed.' }
}

// ─── Bookings ───────────────────────────────────────────────────────────────

export type CancelBookingState = { error?: string; message?: string }

export async function cancelBookingAction(
  bookingId: string,
  _prev: CancelBookingState,
  formData: FormData
): Promise<CancelBookingState> {
  if (!(await isAdminAuthed())) return { error: 'Unauthorized' }

  const refund = String(formData.get('refund') ?? '')
  if (!isAdminRefund(refund)) return { error: 'Choose a refund.' }
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 1000) || null

  const result = await cancelBookingAsAdmin(createAdminClient(), bookingId, refund, reason)
  if ('error' in result) return { error: result.error }

  revalidatePath('/admin/bookings')
  revalidatePath(`/dashboard/bookings/${bookingId}`)
  revalidatePath(`/dashboard/messages/${bookingId}`)
  revalidatePath('/dashboard/messages')
  revalidatePath('/dashboard')
  revalidatePath(`/pro/messages/${bookingId}`)
  revalidatePath('/pro/messages')
  revalidatePath('/pro/bookings')
  return { message: `Canceled. ${ADMIN_REFUND_LABELS[refund]}. The customer has been emailed.` }
}

export async function acceptBackgroundCheckAppealAction(
  profileId: string,
  _prev: AccountActionState,
  _formData: FormData
): Promise<AccountActionState> {
  if (!(await isAdminAuthed())) return { error: 'Unauthorized' }

  try {
    await acceptBackgroundCheckAppeal(createAdminClient(), profileId)
  } catch (err) {
    if (err instanceof BanAppealError || err instanceof BackgroundCheckStateError) return { error: err.message }
    throw err
  }

  revalidateAppealPages()
  return { message: 'Appeal accepted. Their background check is approved and they have been emailed.' }
}

export async function denyBackgroundCheckAppealAction(
  profileId: string,
  _prev: AccountActionState,
  _formData: FormData
): Promise<AccountActionState> {
  if (!(await isAdminAuthed())) return { error: 'Unauthorized' }

  let result: Awaited<ReturnType<typeof denyBackgroundCheckAppeal>>
  try {
    result = await denyBackgroundCheckAppeal(createAdminClient(), profileId)
  } catch (err) {
    if (err instanceof BanAppealError || err instanceof BackgroundCheckStateError) return { error: err.message }
    throw err
  }

  revalidateAppealPages()
  if (result.deleted) return { message: 'Appeal denied. They have been banned, their account deleted, and they have been emailed.' }
  return {
    message: `Appeal denied. They have been banned and emailed. Their account is kept suspended until it can be deleted (${deleteRefusalReason(result.deleteError ?? '')}); this is retried hourly.`,
  }
}

// ─── Push Notifications ──────────────────────────────────────────────────────

export type AdminPushState = { error?: string; message?: string }

// Sends an admin-written push to everyone, all customers, all Tidy Pros, or the
// people ticked on /admin/push-notifications. Only subscribed devices get it.
export async function sendAdminPushAction(_prev: AdminPushState, formData: FormData): Promise<AdminPushState> {
  if (!(await isAdminAuthed())) return { error: 'Unauthorized' }

  const input = parseAdminPushForm(formData)
  if ('error' in input) return input

  const admin = createAdminClient()
  const recipients = pickRecipients(await listPushRecipients(admin), input.audience, input.selectedIds)
  if (recipients.length === 0) return { error: 'Nobody in that group has push notifications turned on.' }

  let people = 0
  let devices = 0
  // Small batches so a big audience doesn't open hundreds of connections at once.
  for (let i = 0; i < recipients.length; i += 20) {
    const counts = await Promise.all(
      recipients.slice(i, i + 20).map((r) => sendPush(r.id, input.title, input.body, input.url).catch(() => 0))
    )
    for (const n of counts) {
      if (n > 0) people++
      devices += n
    }
  }

  revalidatePath('/admin/push-notifications')
  const missed = recipients.length - people
  return {
    message:
      `Sent to ${people} ${people === 1 ? 'person' : 'people'} (${plural(devices, 'device')}).` +
      (missed > 0 ? ` ${missed} could not be reached; their devices may have unsubscribed.` : ''),
  }
}
