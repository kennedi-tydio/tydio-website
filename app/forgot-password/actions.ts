'use server'

import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, emailShell } from '@/lib/email'

export type ForgotState = { error?: string; sent?: boolean }

export async function forgotPasswordAction(
  _prev: ForgotState,
  formData: FormData
): Promise<ForgotState> {
  const email = (formData.get('email') as string | null)?.trim().toLowerCase()
  const role = ((formData.get('role') as string | null) ?? 'USER') as 'USER' | 'TIDYPRO' | 'ADMIN'

  if (!email) return { error: 'Email is required.' }

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('id, first_name, email')
    .eq('email', email)
    .eq('role', role)
    .maybeSingle()

  // Always return success to avoid exposing whether an account exists
  if (!profile) return { sent: true }

  // Invalidate any existing unused tokens for this profile
  await admin
    .from('password_reset_tokens')
    .delete()
    .eq('profile_id', profile.id)
    .is('used_at', null)

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour

  await admin.from('password_reset_tokens').insert({
    profile_id: profile.id,
    token,
    expires_at: expiresAt,
  })

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const resetUrl = `${siteUrl}/reset-password?token=${token}`
  const firstName = profile.first_name ?? 'there'

  if (process.env.NODE_ENV === 'development') {
    console.log(`[DEV] Password reset URL: ${resetUrl}`)
  }

  try {
    await sendEmail({
      to: [{ email: profile.email, name: firstName }],
      subject: 'Reset your Tydio password',
      htmlContent: emailShell(`
        <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">Reset your password</h2>
        <p style="margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;">
          Hi ${firstName}, we received a request to reset your Tydio password.
          Click the button below — this link expires in 1 hour.
        </p>
        <a href="${resetUrl}"
           style="display:inline-block;margin:8px 0 20px;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">
          Reset password
        </a>
        <p style="margin:0;color:#94a3b8;font-size:13px;">
          If you didn't request this, you can safely ignore this email.
        </p>
      `),
    })
  } catch (err) {
    console.error('[Tydio] Password reset email failed:', err)
    if (process.env.NODE_ENV === 'development') {
      return { error: `Dev — email send failed: ${err instanceof Error ? err.message : String(err)}. Reset URL logged to console.` }
    }
  }

  return { sent: true }
}
