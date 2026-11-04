import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clickStartsNavigation, isNavigating, leadsToNewPage, startNavigation, stopNavigation } from './navigationSpinner'

const CURRENT = 'https://tydio.com/pro/bookings?tab=past'
const PLAIN_CLICK = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }
const anchor = (href: string, overrides = {}) => ({ href, target: '', hasDownload: false, ...overrides })

describe('leadsToNewPage', () => {
  it('is true for another path or query string', () => {
    expect(leadsToNewPage('/pro/messages', CURRENT)).toBe(true)
    expect(leadsToNewPage('/pro/bookings?tab=today', CURRENT)).toBe(true)
  })

  it('is false for the current page, a hash change, another site, or a non-web link', () => {
    expect(leadsToNewPage('/pro/bookings?tab=past', CURRENT)).toBe(false)
    expect(leadsToNewPage('/pro/bookings?tab=past#top', CURRENT)).toBe(false)
    expect(leadsToNewPage('https://stripe.com/', CURRENT)).toBe(false)
    expect(leadsToNewPage('tel:+15555550100', CURRENT)).toBe(false)
  })
})

describe('clickStartsNavigation', () => {
  it('is true for a plain click on an internal link', () => {
    expect(clickStartsNavigation(PLAIN_CLICK, anchor('https://tydio.com/pro/messages'), CURRENT)).toBe(true)
  })

  it('is false when the click opens a new tab or saves a file', () => {
    const href = 'https://tydio.com/pro/messages'
    expect(clickStartsNavigation({ ...PLAIN_CLICK, ctrlKey: true }, anchor(href), CURRENT)).toBe(false)
    expect(clickStartsNavigation({ ...PLAIN_CLICK, button: 1 }, anchor(href), CURRENT)).toBe(false)
    expect(clickStartsNavigation(PLAIN_CLICK, anchor(href, { target: '_blank' }), CURRENT)).toBe(false)
    expect(clickStartsNavigation(PLAIN_CLICK, anchor(href, { hasDownload: true }), CURRENT)).toBe(false)
  })
})

describe('navigation state', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    stopNavigation()
    vi.useRealTimers()
  })

  it('stays hidden for a navigation that finishes quickly', () => {
    startNavigation()
    vi.advanceTimersByTime(100)
    stopNavigation()
    vi.advanceTimersByTime(1000)
    expect(isNavigating()).toBe(false)
  })

  it('shows for a slow navigation until it finishes', () => {
    startNavigation()
    vi.advanceTimersByTime(200)
    expect(isNavigating()).toBe(true)
    stopNavigation()
    expect(isNavigating()).toBe(false)
  })

  it('gives up if the navigation never finishes', () => {
    startNavigation()
    vi.advanceTimersByTime(30_000)
    expect(isNavigating()).toBe(false)
  })
})
