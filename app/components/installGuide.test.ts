import { describe, expect, it } from 'vitest'
import { detectDevice, getInstallGuide } from './installGuide'

const UA = {
  iosSafari26: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  iosSafari17: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iosSafari15: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1',
  iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  iosChromeOld: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/108.0.5359.112 Mobile/15E148 Safari/604.1',
  iosInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0',
  iPadDesktopMode: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  androidSamsung: 'Mozilla/5.0 (Linux; Android 14; SM-S921U) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
  desktopChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
}

describe('detectDevice', () => {
  it('reads the iOS version from Safari 26, whose OS token is frozen at 18', () => {
    expect(detectDevice(UA.iosSafari26, 5)).toEqual({ platform: 'ios', iosVersion: { major: 26, minor: 0 }, iPad: false, browser: 'safari' })
  })

  it('detects Chrome on iOS from the OS token', () => {
    expect(detectDevice(UA.iosChrome, 5)).toMatchObject({ platform: 'ios', iosVersion: { major: 17, minor: 5 }, browser: 'chrome' })
  })

  it('treats a touch-capable Mac user agent as an iPad', () => {
    expect(detectDevice(UA.iPadDesktopMode, 5)).toMatchObject({ platform: 'ios', iPad: true, browser: 'safari' })
    expect(detectDevice(UA.iPadDesktopMode, 0).platform).toBeNull()
  })

  it('detects Android browsers', () => {
    expect(detectDevice(UA.androidChrome, 5)).toMatchObject({ platform: 'android', browser: 'chrome' })
    expect(detectDevice(UA.androidSamsung, 5)).toMatchObject({ platform: 'android', browser: 'samsung' })
    expect(detectDevice(UA.androidFirefox, 5)).toMatchObject({ platform: 'android', browser: 'firefox' })
  })

  it('detects in-app browsers and desktops', () => {
    expect(detectDevice(UA.iosInstagram, 5).browser).toBe('in-app')
    expect(detectDevice(UA.desktopChrome, 0).platform).toBeNull()
  })
})

describe('getInstallGuide', () => {
  const guide = (ua: string) => getInstallGuide(detectDevice(ua, 5))

  it('uses the ••• menu on iOS 26 and the Share button before it', () => {
    expect(guide(UA.iosSafari26).steps[0]).toContain('•••')
    expect(guide(UA.iosSafari17).steps[0]).toContain('Share button')
  })

  it('warns that push needs iOS 16.4+', () => {
    expect(guide(UA.iosSafari15).note).toContain('16.4')
    expect(guide(UA.iosSafari17).note).toBeUndefined()
  })

  it('sends older iOS Chrome users to Safari', () => {
    expect(guide(UA.iosChromeOld).intro).toContain('only Safari')
    expect(guide(UA.iosChrome).intro).toBeUndefined()
  })

  it('tells in-app browser users to open the page in a real browser first', () => {
    expect(guide(UA.iosInstagram).steps[0]).toContain('Open in Safari')
  })

  it('gives browser-specific Android steps', () => {
    expect(guide(UA.androidSamsung).steps[1]).toContain('Add page to')
    expect(guide(UA.androidChrome).steps[0]).toContain('⋮')
  })
})
