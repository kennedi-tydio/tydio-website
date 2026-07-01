'use server'

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashPassword } from '@/lib/auth/password'
import { createSession } from '@/lib/auth/session'

export type ResetState = { error?: string }

export async function resetPasswordAction(
  _prev: ResetState,
  formData: FormData
): Promise<ResetState> {
  const token = (formData.get('token') as string | null)?.trim()
  const password = (formData.get('password') as string | null) ?? ''
  const confirm = (formData.get('confirm') as string | null) ?? ''

  if (!token) return { error: 'Invalid reset link.' }
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' }
  if (password !== confirm) return { error: 'Passwords do not match.' }

  const admin = createAdminClient()

  const { data: tokenRow } = await admin
    .from('password_reset_tokens')
    .select('id, profile_id, expires_at, used_at')
    .eq('token', token)
    .maybeSingle()

  if (!tokenRow) return { error: 'This reset link is invalid or has expired.' }
  if (tokenRow.used_at) return { error: 'This reset link has already been used.' }
  if (new Date(tokenRow.expires_at) < new Date()) return { error: 'This reset link has expired. Please request a new one.' }

  const { data: profile } = await admin
    .from('profiles')
    .select('id, role, email')
    .eq('id', tokenRow.profile_id)
    .single()

  if (!profile) return { error: 'Account not found.' }

  const passwordHash = await hashPassword(password)

  await Promise.all([
    admin.from('profiles').update({ password_hash: passwordHash }).eq('id', profile.id),
    admin.from('password_reset_tokens').update({ used_at: new Date().toISOString() }).eq('id', tokenRow.id),
  ])

  await createSession({ profileId: profile.id, role: profile.role as 'USER' | 'TIDYPRO' | 'ADMIN', email: profile.email })

  redirect('/dashboard')
}
