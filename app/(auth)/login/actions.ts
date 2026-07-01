'use server'

import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyPassword } from '@/lib/auth/password'
import { createSession } from '@/lib/auth/session'
import { sendEmail, emailShell } from '@/lib/email'
import { redirect } from 'next/navigation'

export type LoginState = {
  error?: string
  unverified?: boolean
  unverifiedEmail?: string
  unverifiedRole?: string
  resentVerification?: boolean
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = (formData.get('email') as string).trim().toLowerCase()
  const password = formData.get('password') as string
  const next = formData.get('next') as string | null
  const role: 'USER' | 'TIDYPRO' = formData.get('role') === 'TIDYPRO' ? 'TIDYPRO' : 'USER'

  if (!email || !password) return { error: 'Email and password are required.' }

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('id, role, password_hash, email_verified_at')
    .eq('email', email)
    .eq('role', role)
    .maybeSingle()

  if (!profile) {
    await verifyPassword(password, '$2b$12$invalidhashpadding000000000000000000000000000000000000')
    const label = role === 'TIDYPRO' ? 'Tidy Pro' : 'customer'
    return { error: `No ${label} account found for that email. Check your role or sign up.` }
  }

  if (!profile.password_hash) {
    return { error: 'This account was created before our update. Please sign up again to set a password.' }
  }

  const valid = await verifyPassword(password, profile.password_hash)
  if (!valid) return { error: 'Incorrect password.' }

  if (!profile.email_verified_at) {
    return { unverified: true, unverifiedEmail: email, unverifiedRole: role }
  }

  await createSession({ profileId: profile.id, role: profile.role as 'USER' | 'TIDYPRO', email })

  if (next && next.startsWith('/')) redirect(next)
  redirect(role === 'TIDYPRO' ? '/' : '/dashboard')
}

export async function resendVerificationAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = (formData.get('email') as string | null)?.trim().toLowerCase()
  const role = ((formData.get('role') as string | null) ?? 'USER') as 'USER' | 'TIDYPRO' | 'ADMIN'

  if (!email) return { error: 'Email is required.' }

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('id, first_name, email, email_verified_at')
    .eq('email', email)
    .eq('role', role)
    .maybeSingle()

  // Always return success to avoid leaking account existence
  if (!profile || profile.email_verified_at) return { resentVerification: true }

  // Invalidate existing unused tokens
  await admin
    .from('email_verification_tokens')
    .delete()
    .eq('profile_id', profile.id)
    .is('verified_at', null)

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  await admin.from('email_verification_tokens').insert({
    profile_id: profile.id,
    token,
    expires_at: expiresAt,
  })

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const verifyUrl = `${siteUrl}/verify-email?token=${token}`

  if (process.env.NODE_ENV === 'development') {
    console.log(`[DEV] Resend verification URL: ${verifyUrl}`)
  }

  try {
    await sendEmail({
      to: [{ email: profile.email, name: profile.first_name ?? undefined }],
      subject: 'Verify your Tydio email',
      htmlContent: emailShell(`
        <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">Verify your email</h2>
        <p style="margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;">
          Click the button below to verify your email and sign in to Tydio.
          This link expires in 24 hours.
        </p>
        <a href="${verifyUrl}"
           style="display:inline-block;margin:8px 0 20px;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">
          Verify my email
        </a>
        <p style="margin:0;color:#94a3b8;font-size:13px;">
          If you didn't request this, you can safely ignore this email.
        </p>
      `),
    })
  } catch (err) {
    console.error('[Tydio] Resend verification email failed:', err)
  }

  return { resentVerification: true }
}
