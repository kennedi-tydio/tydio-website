import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/stripe', () => ({ stripe: {} }))

import { bookingIdFromUrl, linksToBookingList, textBody } from './manualTextEmail'

const ID = '3f2b8c1e-4d5a-4b6c-9e7f-0a1b2c3d4e5f'

describe('bookingIdFromUrl', () => {
  it.each([
    `https://tydioapp.com/pro/messages/${ID}`,
    `https://tydioapp.com/dashboard/bookings/${ID}`,
    `https://tydioapp.com/dashboard/bookings/${ID}/replace`,
    `https://tydioapp.com/dashboard/messages/${ID}?x=1`,
  ])('finds the booking in %s', (url) => {
    expect(bookingIdFromUrl(url)).toBe(ID)
  })

  it('ignores a recurring series link and pages with no booking', () => {
    expect(bookingIdFromUrl(`https://tydioapp.com/dashboard/bookings/recurring/${ID}/tidy-pro`)).toBeNull()
    expect(bookingIdFromUrl('https://tydioapp.com/dashboard')).toBeNull()
  })
})

describe('linksToBookingList', () => {
  it('is true for the pages a booking text without an ID links to', () => {
    expect(linksToBookingList('https://tydioapp.com/dashboard')).toBe(true)
    expect(linksToBookingList('https://tydioapp.com/pro/messages')).toBe(true)
    expect(linksToBookingList('https://tydioapp.com/dashboard/bookings/')).toBe(true)
  })

  it('is false for texts that are not about a booking', () => {
    expect(linksToBookingList('https://tydioapp.com/pro/profile/insurance')).toBe(false)
    expect(linksToBookingList('https://tydioapp.com/pro/onboarding')).toBe(false)
  })
})

it('builds the same text Twilio would send', () => {
  expect(textBody({ title: 'T', body: 'Hello.', url: 'https://x.co/a' })).toBe('Tydio: Hello. https://x.co/a')
})
