import { beforeAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import {
  GoogleSignInError,
  googleAuthorizeUrl,
  googleRedirectUri,
  identityFromClaims,
  newOAuthState,
  openOAuthState,
  openPendingSignup,
  pkceChallenge,
  sealOAuthState,
  sealPendingSignup,
} from './google'
import { SignJWT } from 'jose'

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret'
  process.env.GOOGLE_CLIENT_ID = 'client-123.apps.googleusercontent.com'
  process.env.GOOGLE_CLIENT_SECRET = 'shh'
})

const goodClaims = {
  sub: '1098',
  email: 'Pat@Example.com',
  email_verified: true,
  given_name: 'Pat',
  family_name: 'Lee',
  nonce: 'n1',
}

describe('identityFromClaims', () => {
  it('returns the identity with a lower-cased email', () => {
    expect(identityFromClaims(goodClaims, 'n1')).toEqual({ sub: '1098', email: 'pat@example.com', firstName: 'Pat', lastName: 'Lee' })
  })

  it('rejects a token issued for a different sign-in attempt', () => {
    expect(() => identityFromClaims(goodClaims, 'other')).toThrow(GoogleSignInError)
  })

  it('refuses an email Google has not verified, so it cannot be used to take over an account', () => {
    try {
      identityFromClaims({ ...goodClaims, email_verified: false }, 'n1')
      expect.unreachable()
    } catch (err) {
      expect((err as GoogleSignInError).code).toBe('email_unverified')
    }
  })

  it('rejects a token with no subject or email', () => {
    expect(() => identityFromClaims({ ...goodClaims, sub: undefined }, 'n1')).toThrow(GoogleSignInError)
    expect(() => identityFromClaims({ ...goodClaims, email: undefined }, 'n1')).toThrow(GoogleSignInError)
  })
})

describe('OAuth state cookie', () => {
  it('round-trips', async () => {
    const s = newOAuthState('TIDYPRO', '/pro/jobs')
    expect(await openOAuthState(await sealOAuthState(s))).toEqual(s)
  })

  it('rejects a tampered or missing cookie', async () => {
    const token = await sealOAuthState(newOAuthState('USER', null))
    expect(await openOAuthState(token.slice(0, -2) + 'xx')).toBeNull()
    expect(await openOAuthState(undefined)).toBeNull()
  })

  it('is not accepted as a pending signup, or the other way round', async () => {
    const state = await sealOAuthState(newOAuthState('USER', null))
    expect(await openPendingSignup(state)).toBeNull()
    const pending = await sealPendingSignup({ sub: '1', email: 'a@b.co', firstName: '', lastName: '', role: 'USER' })
    expect(await openOAuthState(pending)).toBeNull()
  })

  it('is not signed with the session key, so it cannot pose as a session token', async () => {
    const sessionKeyToken = await new SignJWT({ typ: 'google-pending-signup', sub: '1', email: 'a@b.co', role: 'USER' })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new TextEncoder().encode(process.env.JWT_SECRET))
    expect(await openPendingSignup(sessionKeyToken)).toBeNull()
  })
})

describe('googleAuthorizeUrl', () => {
  it('asks for OpenID with PKCE, state and nonce', () => {
    const s = newOAuthState('USER', null)
    const url = new URL(googleAuthorizeUrl(s, 'https://tydio.test/auth/google/callback'))
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('scope')).toBe('openid email profile')
    expect(url.searchParams.get('state')).toBe(s.state)
    expect(url.searchParams.get('nonce')).toBe(s.nonce)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBe(pkceChallenge(s.verifier))
    expect(url.searchParams.get('redirect_uri')).toBe('https://tydio.test/auth/google/callback')
  })

  it('computes the PKCE challenge as base64url(sha256(verifier))', () => {
    expect(pkceChallenge('abc')).toBe(createHash('sha256').update('abc').digest('base64url'))
  })
})

describe('googleRedirectUri', () => {
  it('prefers the configured site URL', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://www.tydioapp.com/'
    expect(googleRedirectUri('http://internal:3000')).toBe('https://www.tydioapp.com/auth/google/callback')
    delete process.env.NEXT_PUBLIC_SITE_URL
    expect(googleRedirectUri('http://localhost:3000')).toBe('http://localhost:3000/auth/google/callback')
  })
})
