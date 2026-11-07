'use server'

import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashPassword } from '@/lib/auth/password'
import { TYDIO_ADMIN_EMAIL, sendEmail, emailShell, escapeHtml } from '@/lib/email'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { BANNED_MESSAGE, isBanned, normalizePhone } from '@/lib/bannedUsers'
import { RATE_LIMITED_MESSAGE, RATE_LIMITS, clientIp, isRateLimited, recordRateLimitEvent } from '@/lib/rateLimit'
import { userFacingError } from '@/lib/userFacingError'
import { addMarketingContact } from '@/lib/marketingContacts'
import { sendWaitlistEmail } from '@/lib/waitlistEmail'
import { zipLocationColumns } from '@/lib/zipLocation'
import { clearPendingGoogleSignup, getPendingGoogleSignup } from '@/lib/auth/google'
import { linkGoogleIdentity } from '@/lib/auth/googleAccount'
import { createSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'

export type SignupState = {
  error?: string
  // Set with `error` when the email is already registered for this role, so the
  // form can follow the message with a link to the Sign in tab.
  accountExists?: boolean
  waitlisted?: boolean
  needsVerification?: boolean
}

async function findServiceAreaId(
  admin: SupabaseClient<Database>,
  zip: string
): Promise<string | null> {
  const { data: zipRow } = await admin
    .from('service_area_zip_codes')
    .select('service_area_id')
    .eq('zip_code', zip)
    .maybeSingle()

  return zipRow?.service_area_id ?? null
}

function isGeorgiaZip(zip: string): boolean {
  const n = parseInt(zip, 10)
  if (isNaN(n) || zip.length !== 5) return false
  return (n >= 30001 && n <= 31999) || (n >= 39800 && n <= 39901)
}

async function sendVerificationEmail(
  email: string,
  firstName: string,
  profileId: string,
  admin: SupabaseClient<Database>
): Promise<{ error: string } | void> {
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours

  await admin.from('email_verification_tokens').insert({
    profile_id: profileId,
    token,
    expires_at: expiresAt,
  })

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const verifyUrl = `${siteUrl}/verify-email?token=${token}`

  if (process.env.NODE_ENV === 'development') {
    console.log(`[DEV] Email verification URL: ${verifyUrl}`)
  }

  try {
    await sendEmail({
      to: [{ email, name: firstName }],
      subject: 'Verify your Tydio email',
      htmlContent: emailShell(`
        <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">Almost there, ${escapeHtml(firstName)}!</h2>
        <p style="margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;">
          Click the button below to verify your email and activate your Tydio account.
          This link expires in 24 hours.
        </p>
        <a href="${verifyUrl}"
           style="display:inline-block;margin:8px 0 20px;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">
          Verify my email
        </a>
        <p style="margin:0;color:#94a3b8;font-size:13px;">
          If you didn't create a Tydio account, you can safely ignore this email.
        </p>
      `),
    })
  } catch (err) {
    console.error('[Tydio] Verification email failed:', err)
    if (process.env.NODE_ENV === 'development') {
      // Surface the Brevo error on screen so you can diagnose it
      return { error: `Dev — email send failed: ${err instanceof Error ? err.message : String(err)}. Verify URL: ${verifyUrl}` }
    }
  }
}

// The checks above catch most duplicates; this covers two signups racing each other.
// Tells the admin a cleaner signed up, so new applicants don't go unseen. A
// failed send never blocks the signup itself.
async function emailAdminCleanerSignup(cleaner: {
  firstName: string
  lastName: string
  email: string
  phone: string | null
  zip: string
  inServiceArea: boolean
}): Promise<void> {
  const plainName = `${cleaner.firstName} ${cleaner.lastName}`.trim()
  const next = cleaner.inServiceArea
    ? 'They need to verify their email, then you can grant them access from Users.'
    : 'Their ZIP code is outside the service area, so they were added to the waitlist.'

  await sendEmail({
    to: [{ email: TYDIO_ADMIN_EMAIL }],
    subject: `New Tidy Pro signup: ${plainName}`,
    htmlContent: emailShell(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">New Tidy Pro signup</h2>
      <p style="margin:0 0 12px;font-size:15px;color:#475569;line-height:1.6;">
        ${escapeHtml(plainName)} created a Tidy Pro account.
      </p>
      <p style="margin:0 0 12px;font-size:14px;color:#475569;line-height:1.6;">
        Email: <a href="mailto:${escapeHtml(cleaner.email)}">${escapeHtml(cleaner.email)}</a><br/>
        Phone: ${escapeHtml(cleaner.phone ?? '—')}<br/>
        ZIP code: ${escapeHtml(cleaner.zip)}
      </p>
      <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">${next}</p>
    `),
  }).catch((err) => console.error('Tidy Pro signup admin email failed', err))
}

function signupInsertError(error: { code?: string; message: string } | null, role: 'USER' | 'TIDYPRO' | 'ADMIN'): string {
  const account = role === 'TIDYPRO' ? 'A Tidy Pro account' : 'A customer account'
  if (error?.code === '23505' && error.message.includes('phone')) return `${account} already exists with this phone number.`
  if (error?.code === '23505' && error.message.includes('email')) return `${account} already exists for this email.`
  return userFacingError(error, "We couldn't create your account. Please try again.")
}

export async function signupAction(
  _prev: SignupState,
  formData: FormData
): Promise<SignupState> {
  const email = (formData.get('email') as string).trim().toLowerCase()
  const password = formData.get('password') as string
  const firstName = (formData.get('first_name') as string).trim()
  const lastName = (formData.get('last_name') as string).trim()
  const phone = (formData.get('phone') as string | null)?.trim() || null
  const zip = (formData.get('zip_code') as string).trim()
  const streetAddress = (formData.get('street_address') as string | null)?.trim() || null
  const termsAccepted = formData.get('terms_accepted') === 'on'
  const privacyAccepted = formData.get('privacy_accepted') === 'on'
  const marketingOptIn = formData.get('marketing_opt_in') === 'on'
  const role: 'USER' | 'TIDYPRO' | 'ADMIN' =
    formData.get('role') === 'TIDYPRO' ? 'TIDYPRO' : 'USER'

  // Signing up with Google: Google has already proved the email, so there's no
  // password and no verification email. The identity comes from the signed
  // cookie set by /auth/google/callback, never from the form.
  const google = formData.get('google') === '1' ? await getPendingGoogleSignup() : null
  if (formData.get('google') === '1') {
    if (!google || google.role !== role) {
      return { error: 'Your Google sign-in expired. Please click "Continue with Google" again.' }
    }
    if (google.email !== email) {
      return { error: 'The email must match your Google account.' }
    }
  }

  if (!email || (!google && !password) || !firstName || !lastName || !zip) {
    return { error: 'Please fill in all required fields.' }
  }
  if (!/^\d{5}$/.test(zip)) {
    return { error: 'Please enter a valid 5-digit zip code.' }
  }
  if (!google && password.length < 8) {
    return { error: 'Password must be at least 8 characters.' }
  }
  if (role === 'TIDYPRO' && !phone) {
    return { error: 'Phone number is required for Tidy Pro applicants.' }
  }
  if (!termsAccepted) {
    return { error: 'You must agree to the Terms & Conditions.' }
  }
  if (!privacyAccepted) {
    return { error: 'You must agree to the Privacy Policy.' }
  }

  const admin = createAdminClient()

  // Each signup sends a verification email, so cap how many one caller can start.
  const ipKey = `signup:ip:${await clientIp()}`
  if (await isRateLimited(admin, ipKey, RATE_LIMITS.signupPerIp)) return { error: RATE_LIMITED_MESSAGE }
  await recordRateLimitEvent(admin, ipKey)
  const now = new Date().toISOString()

  if (await isBanned(admin, { email, phone })) return { error: BANNED_MESSAGE }

  const { data: existing } = await admin
    .from('profiles')
    .select('id, waitlisted, booking_access_status')
    .eq('email', email)
    .eq('role', role)
    .maybeSingle()

  if (existing) {
    if (existing.waitlisted || existing.booking_access_status === 'waitlisted') {
      return { waitlisted: true }
    }
    if (role === 'TIDYPRO') {
      return { error: 'A Tidy Pro account already exists for this email. To create a customer account instead, click "Join as a customer"', accountExists: true }
    }
    return { error: 'A customer account already exists for this email. To sign up as a cleaner instead, click "Be a cleaner"', accountExists: true }
  }

  if (phone) {
    const normalizedPhone = normalizePhone(phone)
    // Scoped to this role, same as the email check above — the same person
    // can hold both a customer and a Tidy Pro account with one phone number,
    // but not two accounts of the same role.
    const { data: existingPhones } = await admin
      .from('profiles')
      .select('phone')
      .eq('role', role)
      .not('phone', 'is', null)
    const phoneTaken = (existingPhones ?? []).some((p) => p.phone && normalizePhone(p.phone) === normalizedPhone)
    if (phoneTaken) {
      return {
        error:
          role === 'TIDYPRO'
            ? 'A Tidy Pro account already exists with this phone number.'
            : 'A customer account already exists with this phone number.',
      }
    }
  }

  const passwordHash = google ? null : await hashPassword(password)
  const newId = crypto.randomUUID()

  // Non-Georgia: save waitlisted profile (auto-verified since they can't log in yet)
  if (!isGeorgiaZip(zip)) {
    const { error: insertError } = await admin.from('profiles').insert({
      id: newId,
      role,
      email,
      password_hash: passwordHash,
      first_name: firstName,
      last_name: lastName,
      phone,
      zip_code: zip,
      ...zipLocationColumns(zip),
      street_address: streetAddress,
      waitlisted: true,
      booking_access_status: 'waitlisted',
      email_verified_at: now, // auto-verify; they can't book until their area opens anyway
      waitlisted_at: now,
      terms_accepted_at: termsAccepted ? now : null,
      privacy_policy_accepted_at: privacyAccepted ? now : null,
      marketing_opt_in_at: marketingOptIn ? now : null,
    })

    if (insertError) return { error: signupInsertError(insertError, role) }
    if (google) {
      await linkGoogleIdentity(admin, newId, google)
      await clearPendingGoogleSignup()
    }
    if (role === 'TIDYPRO') {
      await admin.from('tidypro_profiles').insert({ id: newId, phone })
      await emailAdminCleanerSignup({ firstName, lastName, email, phone, zip, inServiceArea: false })
    }
    // Waitlisted accounts skip email verification, so they join the marketing
    // list now. Everyone else joins once they verify (app/verify-email/route.ts).
    if (marketingOptIn) {
      await addMarketingContact({ email, firstName, lastName, role })
        .catch((err) => console.error('[Tydio] Adding Brevo marketing contact failed:', err))
    }
    // Confirms their spot; without the marketing box ticked it also offers a
    // link to sign up for Tydio emails while they wait.
    await sendWaitlistEmail({ email, firstName, profileId: newId, marketingOptedIn: marketingOptIn })
    return { waitlisted: true }
  }

  // Every new account (customer or Tidy Pro) starts on the waitlist until an
  // admin grants access from /admin/users — see /waitlist.
  const serviceAreaId = await findServiceAreaId(admin, zip)

  const { data: profile, error: insertError } = await admin
    .from('profiles')
    .insert({
      id: newId,
      role,
      email,
      password_hash: passwordHash,
      first_name: firstName,
      last_name: lastName,
      phone,
      zip_code: zip,
      ...zipLocationColumns(zip),
      street_address: streetAddress,
      service_area_id: serviceAreaId,
      waitlisted: true,
      booking_access_status: 'waitlisted',
      email_verified_at: google ? now : null, // password signups must verify email before logging in
      waitlisted_at: now,
      terms_accepted_at: termsAccepted ? now : null,
      privacy_policy_accepted_at: privacyAccepted ? now : null,
      marketing_opt_in_at: marketingOptIn ? now : null,
    })
    .select('id')
    .single()

  if (insertError || !profile) {
    return { error: signupInsertError(insertError, role) }
  }

  if (role === 'TIDYPRO') {
    await admin.from('tidypro_profiles').insert({ id: profile.id, phone })
    await emailAdminCleanerSignup({ firstName, lastName, email, phone, zip, inServiceArea: true })
  }

  if (!google) {
    await sendVerificationEmail(email, firstName, profile.id, admin)
    return { needsVerification: true }
  }

  // Google signup: already verified, so do what /verify-email does — join the
  // marketing list if they opted in, then sign them straight in.
  await linkGoogleIdentity(admin, profile.id, google)
  await clearPendingGoogleSignup()
  if (marketingOptIn) {
    await addMarketingContact({ email, firstName, lastName, role })
      .catch((err) => console.error('[Tydio] Adding Brevo marketing contact failed:', err))
  }
  await createSession({ profileId: profile.id, role, email })
  redirect(role === 'TIDYPRO' ? '/pro/onboarding' : '/dashboard')
}
