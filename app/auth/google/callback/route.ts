import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createSession } from '@/lib/auth/session'
import {
  GoogleSignInError,
  OAUTH_STATE_COOKIE,
  PENDING_SIGNUP_COOKIE,
  exchangeCodeForIdentity,
  googleRedirectUri,
  openOAuthState,
  oauthStateCookieOptions,
  pendingSignupCookieOptions,
  sealPendingSignup,
  type SignInRole,
} from '@/lib/auth/google'
import { resolveGoogleSignIn } from '@/lib/auth/googleAccount'

// Google sends the person back here with ?code=…&state=…
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const saved = await openOAuthState(req.cookies.get(OAUTH_STATE_COOKIE)?.value)

  const toLogin = (role: SignInRole | undefined, query: Record<string, string>) => {
    const url = new URL('/login', req.url)
    if (role === 'TIDYPRO') url.searchParams.set('role', 'pro')
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
    const res = NextResponse.redirect(url)
    res.cookies.set(OAUTH_STATE_COOKIE, '', { ...oauthStateCookieOptions, maxAge: 0 })
    return res
  }

  // A missing or mismatched state means this didn't start from our button
  // (or took longer than 10 minutes), so nothing from Google is trusted.
  if (!saved || params.get('state') !== saved.state) return toLogin(saved?.role, { google_error: 'expired' })
  if (params.get('error')) return toLogin(saved.role, { google_error: 'cancelled' })
  const code = params.get('code')
  if (!code) return toLogin(saved.role, { google_error: 'cancelled' })

  let identity
  try {
    identity = await exchangeCodeForIdentity(code, saved, googleRedirectUri(req.nextUrl.origin))
  } catch (err) {
    const reason = err instanceof GoogleSignInError ? err.code : 'exchange_failed'
    return toLogin(saved.role, { google_error: reason })
  }

  const outcome = await resolveGoogleSignIn(createAdminClient(), identity, saved.role)

  if (outcome.kind === 'banned') return toLogin(saved.role, { banned: '1' })
  if (outcome.kind === 'linked_elsewhere') return toLogin(saved.role, { google_error: 'linked_elsewhere' })

  if (outcome.kind === 'needs_signup') {
    // New to Tydio: they still need to give a ZIP code, phone and consent.
    const url = new URL('/signup', req.url)
    if (saved.role === 'TIDYPRO') url.searchParams.set('role', 'pro')
    url.searchParams.set('google', '1')
    const res = NextResponse.redirect(url)
    res.cookies.set(PENDING_SIGNUP_COOKIE, await sealPendingSignup({ ...identity, role: saved.role }), pendingSignupCookieOptions)
    res.cookies.set(OAUTH_STATE_COOKIE, '', { ...oauthStateCookieOptions, maxAge: 0 })
    return res
  }

  await createSession({ profileId: outcome.profile.id, role: outcome.profile.role, email: outcome.profile.email })

  const dest = saved.next ?? (outcome.profile.role === 'TIDYPRO' ? '/pro/onboarding' : '/dashboard')
  const res = NextResponse.redirect(new URL(dest, req.url))
  res.cookies.set(OAUTH_STATE_COOKIE, '', { ...oauthStateCookieOptions, maxAge: 0 })
  return res
}
