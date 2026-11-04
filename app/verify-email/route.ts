import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createSession } from '@/lib/auth/session'
import { isBanned } from '@/lib/bannedUsers'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const expired = new URL('/verify-email/expired', req.url)

  if (!token) return NextResponse.redirect(expired)

  const admin = createAdminClient()

  const { data: tokenRow } = await admin
    .from('email_verification_tokens')
    .select('id, profile_id, expires_at, verified_at')
    .eq('token', token)
    .maybeSingle()

  if (!tokenRow) return NextResponse.redirect(expired)
  if (tokenRow.verified_at) return NextResponse.redirect(expired)
  if (new Date(tokenRow.expires_at) < new Date()) return NextResponse.redirect(expired)

  const { data: profile } = await admin
    .from('profiles')
    .select('id, role, email, phone')
    .eq('id', tokenRow.profile_id)
    .single()

  if (!profile) return NextResponse.redirect(expired)
  if (await isBanned(admin, { email: profile.email, phone: profile.phone })) {
    return NextResponse.redirect(new URL('/login?banned=1', req.url))
  }

  const now = new Date().toISOString()

  await Promise.all([
    admin
      .from('email_verification_tokens')
      .update({ verified_at: now })
      .eq('id', tokenRow.id),
    admin
      .from('profiles')
      .update({ email_verified_at: now })
      .eq('id', profile.id),
  ])

  await createSession({
    profileId: profile.id,
    role: profile.role as 'USER' | 'TIDYPRO' | 'ADMIN',
    email: profile.email,
  })

  const dest = profile.role === 'TIDYPRO' ? '/pro/onboarding' : '/dashboard'
  return NextResponse.redirect(new URL(dest, req.url))
}
