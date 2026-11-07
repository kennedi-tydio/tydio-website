import { beforeAll, describe, expect, it } from 'vitest'
import { SignJWT } from 'jose'
import { createMarketingOptInToken, readMarketingOptInToken, waitlistEmailHtml } from './waitlistEmail'

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret'
  process.env.NEXT_PUBLIC_SITE_URL = 'https://tydio.test'
})

describe('marketing opt-in link', () => {
  it('round-trips the profile id', async () => {
    expect(await readMarketingOptInToken(await createMarketingOptInToken('p1'))).toBe('p1')
  })

  it('rejects tampered, missing, and session-key tokens', async () => {
    const token = await createMarketingOptInToken('p1')
    expect(await readMarketingOptInToken(token.slice(0, -2) + 'xx')).toBeNull()
    expect(await readMarketingOptInToken(null)).toBeNull()
    const sessionKeyToken = await new SignJWT({ typ: 'marketing-opt-in', pid: 'p1' })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new TextEncoder().encode(process.env.JWT_SECRET))
    expect(await readMarketingOptInToken(sessionKeyToken)).toBeNull()
  })
})

describe('waitlistEmailHtml', () => {
  it('offers the email sign-up link to people who did not opt in', async () => {
    const html = await waitlistEmailHtml({ firstName: 'Pat', profileId: 'p1', marketingOptedIn: false })
    expect(html).toContain('Click here to sign up for emails')
    expect(html).toContain('https://tydio.test/email-updates?token=')
  })

  it('leaves the link out for people who already opted in', async () => {
    const html = await waitlistEmailHtml({ firstName: 'Pat', profileId: 'p1', marketingOptedIn: true })
    expect(html).not.toContain('/email-updates')
    expect(html).toContain('signed up for Tydio emails')
  })

  it('escapes the name', async () => {
    const html = await waitlistEmailHtml({ firstName: '<b>x</b>', profileId: 'p1', marketingOptedIn: true })
    expect(html).not.toContain('<b>x</b>')
  })
})
