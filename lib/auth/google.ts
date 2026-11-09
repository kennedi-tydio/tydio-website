import { createHash, randomBytes } from 'node:crypto'
import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose'
import { cookies } from 'next/headers'

// "Continue with Google" — OpenID Connect authorization-code flow with PKCE.
// Google only proves who the person is; the session is still Tydio's own
// cookie from lib/auth/session.ts, so the rest of the app can't tell the
// difference between a Google sign-in and a password one.

export type SignInRole = 'USER' | 'TIDYPRO'

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

export const OAUTH_STATE_COOKIE = 'tydio_google_oauth'
export const PENDING_SIGNUP_COOKIE = 'tydio_google_signup'
const OAUTH_STATE_MAX_AGE = 60 * 10 // 10 minutes to finish at Google
const PENDING_SIGNUP_MAX_AGE = 60 * 30 // 30 minutes to finish the signup form

// The button only shows once both are set, so deploying without them changes nothing.
export function isGoogleSignInEnabled(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

function clientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID
  if (!id) throw new Error('GOOGLE_CLIENT_ID is not set')
  return id
}

function clientSecret(): string {
  const secret = process.env.GOOGLE_CLIENT_SECRET
  if (!secret) throw new Error('GOOGLE_CLIENT_SECRET is not set')
  return secret
}

// A key separate from the session key, so a token from these cookies can
// never be passed off as a tydio_session token.
function oauthKey(): Uint8Array {
  const key = process.env.JWT_SECRET
  if (!key) throw new Error('JWT_SECRET is not set')
  return createHash('sha256').update(`${key}|google-oauth`).digest()
}

// Must be byte-for-byte the same in the authorize request, the token exchange
// and the Google Cloud console.
export function googleRedirectUri(requestOrigin: string): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || requestOrigin
  return `${site}/auth/google/callback`
}

function base64url(buf: Buffer): string {
  return buf.toString('base64url')
}

export function pkceChallenge(verifier: string): string {
  return base64url(createHash('sha256').update(verifier).digest())
}

// ── Step 1: the trip to Google ───────────────────────────

export type OAuthState = {
  state: string
  nonce: string
  verifier: string
  role: SignInRole
  next: string | null
  // Which page's Google button started this. Coming from /login means they
  // expected an account, so landing on signup comes with a "no account" error.
  from: 'login' | 'signup'
}

export function newOAuthState(role: SignInRole, next: string | null, from: 'login' | 'signup' = 'login'): OAuthState {
  return {
    state: base64url(randomBytes(24)),
    nonce: base64url(randomBytes(24)),
    verifier: base64url(randomBytes(32)),
    role,
    next,
    from,
  }
}

export function googleAuthorizeUrl(s: OAuthState, redirectUri: string): string {
  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set('client_id', clientId())
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('state', s.state)
  url.searchParams.set('nonce', s.nonce)
  url.searchParams.set('code_challenge', pkceChallenge(s.verifier))
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('prompt', 'select_account')
  return url.toString()
}

export async function sealOAuthState(s: OAuthState): Promise<string> {
  return new SignJWT({ ...s, typ: 'google-oauth-state' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${OAUTH_STATE_MAX_AGE}s`)
    .sign(oauthKey())
}

export async function openOAuthState(token: string | undefined): Promise<OAuthState | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, oauthKey())
    if (payload.typ !== 'google-oauth-state') return null
    const p = payload as unknown as OAuthState
    if (!p.state || !p.nonce || !p.verifier) return null
    if (p.role !== 'USER' && p.role !== 'TIDYPRO') return null
    return { state: p.state, nonce: p.nonce, verifier: p.verifier, role: p.role, next: p.next ?? null, from: p.from === 'signup' ? 'signup' : 'login' }
  } catch {
    return null
  }
}

export const oauthStateCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  // Lax so the cookie comes back on Google's top-level redirect to the callback.
  sameSite: 'lax' as const,
  path: '/auth/google',
  maxAge: OAUTH_STATE_MAX_AGE,
}

// ── Step 2: back from Google ─────────────────────────────

export type GoogleIdentity = {
  sub: string
  email: string
  firstName: string
  lastName: string
}

export class GoogleSignInError extends Error {
  constructor(public code: 'exchange_failed' | 'invalid_token' | 'email_unverified') {
    super(code)
  }
}

export async function exchangeCodeForIdentity(
  code: string,
  s: OAuthState,
  redirectUri: string,
): Promise<GoogleIdentity> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: s.verifier,
    }),
    cache: 'no-store',
  })
  if (!res.ok) {
    console.error('[Tydio] Google token exchange failed:', res.status, await res.text().catch(() => ''))
    throw new GoogleSignInError('exchange_failed')
  }
  const body = (await res.json()) as { id_token?: string }
  if (!body.id_token) throw new GoogleSignInError('exchange_failed')

  let claims: Record<string, unknown>
  try {
    claims = (await jwtVerify(body.id_token, googleKeys, { issuer: GOOGLE_ISSUERS, audience: clientId() })).payload
  } catch (err) {
    console.error('[Tydio] Google ID token rejected:', err)
    throw new GoogleSignInError('invalid_token')
  }
  return identityFromClaims(claims, s.nonce)
}

// Split out so the checks can be tested without calling Google.
export function identityFromClaims(claims: Record<string, unknown>, expectedNonce: string): GoogleIdentity {
  if (claims.nonce !== expectedNonce) throw new GoogleSignInError('invalid_token')
  if (typeof claims.sub !== 'string' || !claims.sub) throw new GoogleSignInError('invalid_token')
  if (typeof claims.email !== 'string' || !claims.email) throw new GoogleSignInError('invalid_token')
  // Linking to an existing account by email is only safe when Google vouches for the address.
  if (claims.email_verified !== true && claims.email_verified !== 'true') {
    throw new GoogleSignInError('email_unverified')
  }
  return {
    sub: claims.sub,
    email: claims.email.trim().toLowerCase(),
    firstName: typeof claims.given_name === 'string' ? claims.given_name.trim() : '',
    lastName: typeof claims.family_name === 'string' ? claims.family_name.trim() : '',
  }
}

// ── Step 3 (new people only): finishing signup ───────────
// Someone new to Tydio still has to give a ZIP code, phone and consent, so the
// verified Google identity waits in this cookie while they fill in /signup.

export type PendingGoogleSignup = GoogleIdentity & { role: SignInRole }

export async function sealPendingSignup(p: PendingGoogleSignup): Promise<string> {
  return new SignJWT({ ...p, typ: 'google-pending-signup' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${PENDING_SIGNUP_MAX_AGE}s`)
    .sign(oauthKey())
}

export async function openPendingSignup(token: string | undefined): Promise<PendingGoogleSignup | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, oauthKey())
    if (payload.typ !== 'google-pending-signup') return null
    const p = payload as unknown as PendingGoogleSignup
    if (!p.sub || !p.email || (p.role !== 'USER' && p.role !== 'TIDYPRO')) return null
    return { sub: p.sub, email: p.email, firstName: p.firstName ?? '', lastName: p.lastName ?? '', role: p.role }
  } catch {
    return null
  }
}

export const pendingSignupCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: PENDING_SIGNUP_MAX_AGE,
}

export async function getPendingGoogleSignup(): Promise<PendingGoogleSignup | null> {
  const store = await cookies()
  return openPendingSignup(store.get(PENDING_SIGNUP_COOKIE)?.value)
}

export async function clearPendingGoogleSignup(): Promise<void> {
  const store = await cookies()
  store.delete(PENDING_SIGNUP_COOKIE)
}
