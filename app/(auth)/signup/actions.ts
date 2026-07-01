'use server'

import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashPassword } from '@/lib/auth/password'
import { sendEmail, emailShell } from '@/lib/email'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

export type SignupState = {
  error?: string
  waitlisted?: boolean
  needsVerification?: boolean
}

type BookingAccess = {
  status: 'waitlisted' | 'booking_allowed' | 'paused'
  serviceAreaId: string | null
}

async function determineBookingAccess(
  admin: SupabaseClient<Database>,
  zip: string
): Promise<BookingAccess> {
  const { data: zipRow } = await admin
    .from('service_area_zip_codes')
    .select('service_area_id')
    .eq('zip_code', zip)
    .maybeSingle()

  if (!zipRow) return { status: 'waitlisted', serviceAreaId: null }

  const { data: area } = await admin
    .from('service_areas')
    .select('status')
    .eq('id', zipRow.service_area_id)
    .single()

  if (area?.status === 'beta_open') return { status: 'booking_allowed', serviceAreaId: zipRow.service_area_id }
  if (area?.status === 'paused_recruiting_cleaners') return { status: 'paused', serviceAreaId: zipRow.service_area_id }
  return { status: 'waitlisted', serviceAreaId: zipRow.service_area_id }
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
        <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">Almost there, ${firstName}!</h2>
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
  const role: 'USER' | 'TIDYPRO' | 'ADMIN' =
    formData.get('role') === 'TIDYPRO' ? 'TIDYPRO' : 'USER'

  if (!email || !password || !firstName || !lastName || !zip) {
    return { error: 'Please fill in all required fields.' }
  }
  if (!/^\d{5}$/.test(zip)) {
    return { error: 'Please enter a valid 5-digit zip code.' }
  }
  if (password.length < 8) {
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
  const now = new Date().toISOString()

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
      return { error: 'A Tidy Pro account already exists for this email. To create a customer account instead, click "Join as a customer".' }
    }
    return { error: 'A customer account already exists for this email. To sign up as a cleaner instead, click "Be a cleaner".' }
  }

  const passwordHash = await hashPassword(password)
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
      street_address: streetAddress,
      waitlisted: true,
      booking_access_status: 'waitlisted',
      email_verified_at: now, // auto-verify; they can't book until their area opens anyway
      waitlisted_at: now,
      terms_accepted_at: termsAccepted ? now : null,
      privacy_policy_accepted_at: privacyAccepted ? now : null,
    })

    if (insertError) return { error: `Something went wrong: ${insertError.message}` }
    return { waitlisted: true }
  }

  // Georgia user: determine booking access
  const { status: bookingStatus, serviceAreaId } = await determineBookingAccess(admin, zip)

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
      street_address: streetAddress,
      service_area_id: serviceAreaId,
      waitlisted: bookingStatus !== 'booking_allowed',
      booking_access_status: bookingStatus,
      booking_access_granted_at: bookingStatus === 'booking_allowed' ? now : null,
      email_verified_at: null, // must verify email before logging in
      waitlisted_at: now,
      terms_accepted_at: termsAccepted ? now : null,
      privacy_policy_accepted_at: privacyAccepted ? now : null,
    })
    .select('id')
    .single()

  if (insertError || !profile) {
    return { error: `Failed to create account: ${insertError?.message ?? 'unknown error'}` }
  }

  if (role === 'TIDYPRO') {
    await admin.from('tidypro_profiles').insert({ id: profile.id })
  }

  await sendVerificationEmail(email, firstName, profile.id, admin)

  return { needsVerification: true }
}
