import { type NextRequest, NextResponse } from 'next/server'
import {
  OAUTH_STATE_COOKIE,
  googleAuthorizeUrl,
  googleRedirectUri,
  isGoogleSignInEnabled,
  newOAuthState,
  oauthStateCookieOptions,
  sealOAuthState,
} from '@/lib/auth/google'
import { safeRedirectPath } from '@/lib/safeRedirect'

// /auth/google?role=pro&next=/book&from=signup — sends the person to Google.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const isPro = params.get('role') === 'pro'

  if (!isGoogleSignInEnabled()) {
    const back = new URL('/login', req.url)
    if (isPro) back.searchParams.set('role', 'pro')
    back.searchParams.set('google_error', 'unavailable')
    return NextResponse.redirect(back)
  }

  const state = newOAuthState(
    isPro ? 'TIDYPRO' : 'USER',
    safeRedirectPath(params.get('next')),
    params.get('from') === 'signup' ? 'signup' : 'login',
  )

  const res = NextResponse.redirect(googleAuthorizeUrl(state, googleRedirectUri(req.nextUrl.origin)))
  res.cookies.set(OAUTH_STATE_COOKIE, await sealOAuthState(state), oauthStateCookieOptions)
  return res
}
