import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as email from './email'
import { isGeorgiaZip } from './georgiaZip'
import { sendWelcomeEmail, welcomeEmailHtml, welcomeEmailSubject } from './welcomeEmail'

beforeAll(() => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://tydio.test'
})

describe('welcomeEmailHtml', () => {
  it('writes to customers about booking', () => {
    const html = welcomeEmailHtml({ firstName: 'Pat', role: 'USER' })
    expect(html).toContain('Welcome to Tydio, Pat!')
    expect(html).toContain('book your first cleaning')
    expect(html).not.toContain('payout setup')
  })

  it('writes to Tidy Pros about approval and onboarding', () => {
    const html = welcomeEmailHtml({ firstName: 'Pat', role: 'TIDYPRO' })
    expect(html).toContain('Welcome to the Tydio team, Pat!')
    expect(html).toContain('Tidy Pro')
    expect(html).toContain('payout setup')
    expect(html).not.toContain('book your first cleaning')
  })

  it('links to sign in', () => {
    expect(welcomeEmailHtml({ firstName: 'Pat', role: 'USER' })).toContain('href="https://tydio.test/login"')
  })

  it('escapes the name and falls back when it is empty', () => {
    expect(welcomeEmailHtml({ firstName: '<b>x</b>', role: 'USER' })).not.toContain('<b>x</b>')
    expect(welcomeEmailHtml({ firstName: '', role: 'USER' })).toContain('Welcome to Tydio, there!')
  })
})

describe('feature highlights', () => {
  it('shows customers what they can book and what is coming soon', () => {
    const html = welcomeEmailHtml({ firstName: 'Pat', role: 'USER' })
    expect(html).toContain('Baseboards')
    expect(html).toContain('Laundry')
    expect(html).toContain('Coming soon:</strong> standard and deep cleanings')
    expect(html).not.toContain('80%')
  })

  it('tells Tidy Pros what they keep, never what Tydio keeps', () => {
    const html = welcomeEmailHtml({ firstName: 'Pat', role: 'TIDYPRO' })
    expect(html).toContain('80%')
    expect(html).toContain('100% of your tips')
    expect(html).not.toContain('20%')
    expect(html.toLowerCase()).not.toMatch(/\bfee\b/)
    expect(html.toLowerCase()).not.toContain('coming soon')
  })
})

describe('sendWelcomeEmail', () => {
  afterEach(() => vi.restoreAllMocks())

  it('is not sent to accounts outside Georgia', async () => {
    const send = vi.spyOn(email, 'sendEmail').mockResolvedValue()
    await sendWelcomeEmail({ email: 'a@b.co', firstName: 'Pat', role: 'USER', zip: '10001' })
    await sendWelcomeEmail({ email: 'a@b.co', firstName: 'Pat', role: 'TIDYPRO', zip: null })
    expect(send).not.toHaveBeenCalled()
  })

  it('is sent to accounts in Georgia', async () => {
    const send = vi.spyOn(email, 'sendEmail').mockResolvedValue()
    await sendWelcomeEmail({ email: 'a@b.co', firstName: 'Pat', role: 'USER', zip: '30301' })
    expect(send).toHaveBeenCalledOnce()
  })
})

describe('isGeorgiaZip', () => {
  it('accepts Georgia ZIPs only', () => {
    expect(isGeorgiaZip('30301')).toBe(true)
    expect(isGeorgiaZip('39901')).toBe(true)
    expect(isGeorgiaZip('10001')).toBe(false)
    expect(isGeorgiaZip('3030')).toBe(false)
    expect(isGeorgiaZip(undefined)).toBe(false)
  })
})

describe('welcomeEmailSubject', () => {
  it('uses the first name when there is one', () => {
    expect(welcomeEmailSubject('Pat')).toBe('Welcome to Tydio, Pat!')
    expect(welcomeEmailSubject('')).toBe('Welcome to Tydio!')
  })
})
