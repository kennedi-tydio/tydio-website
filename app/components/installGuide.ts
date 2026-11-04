import { useSyncExternalStore } from 'react'
import { createDeviceFlag } from './deviceFlag'

export type Platform = 'ios' | 'android'
export type Browser = 'safari' | 'chrome' | 'firefox' | 'edge' | 'samsung' | 'in-app' | 'other'
export type Device = {
  platform: Platform | null
  // iOS major.minor; null when unknown or not iOS. Android versions aren't
  // read: Chrome freezes them in the user agent ("Android 10; K"), and the
  // steps depend on the browser rather than the Android version anyway.
  iosVersion: { major: number; minor: number } | null
  iPad: boolean
  browser: Browser
}

const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|Snapchat|Line\/|musical_ly|BytedanceWebview|GSA\/|\bwv\)/

export function detectDevice(ua: string, maxTouchPoints: number): Device {
  // iPadOS 13+ Safari reports a Mac user agent; touch support gives it away.
  const iPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)
  const ios = iPad || /iPhone|iPod/.test(ua)
  const android = !ios && /Android/.test(ua)
  const platform: Platform | null = ios ? 'ios' : android ? 'android' : null

  let browser: Browser = 'other'
  if (IN_APP.test(ua)) browser = 'in-app'
  else if (/SamsungBrowser/.test(ua)) browser = 'samsung'
  else if (/EdgiOS|EdgA|Edg\//.test(ua)) browser = 'edge'
  else if (/FxiOS|Firefox/.test(ua)) browser = 'firefox'
  else if (/CriOS|Chrome/.test(ua)) browser = 'chrome'
  else if (ios && /Safari/.test(ua)) browser = 'safari'

  let iosVersion: Device['iosVersion'] = null
  if (ios) {
    // Safari 26 freezes the OS token at 18_6, but its Version/ token tracks
    // the iOS release, so prefer that. Other iOS browsers only have the OS token.
    const safari = browser === 'safari' ? ua.match(/Version\/(\d+)(?:\.(\d+))?/) : null
    const os = ua.match(/OS (\d+)_(\d+)/)
    const m = safari ?? os
    if (m) iosVersion = { major: Number(m[1]), minor: Number(m[2] ?? 0) }
  }

  return { platform, iosVersion, iPad, browser }
}

let cachedDevice: Device | null = null
function getDeviceSnapshot(): Device {
  cachedDevice ??= detectDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0)
  return cachedDevice
}
const noopSubscribe = () => () => {}

// Null during SSR and hydration, then the detected device.
export function useDevice(): Device | null {
  return useSyncExternalStore(noopSubscribe, getDeviceSnapshot, () => null)
}

// ---- "Already handled the install guide on this device" flag ----
// Kept in localStorage rather than the profile: installing is per device, so
// someone who added Tydio on their phone should still see the guide on a tablet.

const installGuideFlag = createDeviceFlag('tydio:install-guide-dismissed')
export const dismissInstallGuide = installGuideFlag.set
export const useInstallGuideDismissed = installGuideFlag.useFlag

// ---- Android/desktop Chromium one-tap install ----
// The browser fires beforeinstallprompt once, early in page load, so this
// module listens from import time (ServiceWorkerRegistration imports it from
// the root layout) and keeps the event for the guide to use later.

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let deferredPrompt: InstallPromptEvent | null = null
const listeners = new Set<() => void>()

function subscribe(callback: () => void) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e as InstallPromptEvent
    listeners.forEach((l) => l())
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    dismissInstallGuide()
  })
}

export function useCanPromptInstall(): boolean {
  return useSyncExternalStore(subscribe, () => deferredPrompt !== null, () => false)
}

export async function promptInstall(): Promise<boolean> {
  const event = deferredPrompt
  if (!event) return false
  deferredPrompt = null
  await event.prompt()
  const { outcome } = await event.userChoice
  listeners.forEach((l) => l())
  return outcome === 'accepted'
}

// ---- Step-by-step instructions ----

export type Guide = { intro?: string; steps: string[]; note?: string }

const ADD_TO_HOME_IOS = 'Scroll down (tap View More if you see it) and tap Add to Home Screen.'

export function getInstallGuide(device: Device): Guide {
  return device.platform === 'android' ? androidGuide(device) : iosGuide(device)
}

function iosGuide({ iosVersion, iPad, browser }: Device): Guide {
  const v = iosVersion
  const atLeast = (major: number, minor = 0) => !v || v.major > major || (v.major === major && v.minor >= minor)
  const where = iPad ? 'at the top right of the screen' : 'at the bottom of the screen'

  const safariSteps = atLeast(26)
    ? [
        `Tap the ••• button next to the address bar ${where}.`,
        'Tap Share.',
        ADD_TO_HOME_IOS,
        'Leave Open as Web App turned on, then tap Add.',
      ]
    : [
        `Tap the Share button (a square with an arrow pointing up) ${where}.`,
        `${ADD_TO_HOME_IOS} If it's missing, tap Edit Actions and add it.`,
        'Tap Add in the top right corner.',
      ]
  const pushNote = atLeast(16, 4)
    ? undefined
    : 'Push notifications need iOS 16.4 or later. You can update in Settings → General → Software Update.'
  const versionNote = v ? undefined : 'On iOS 18 or earlier, the Share button is right in the toolbar instead of under •••.'

  if (browser === 'in-app') {
    return {
      intro: "You're viewing Tydio inside another app. Open it in Safari first:",
      steps: ['Tap the ••• or compass button in this app and choose Open in Safari (or copy the link and paste it into Safari).', ...safariSteps],
      note: pushNote ?? versionNote,
    }
  }
  if (browser !== 'safari' && browser !== 'other') {
    if (!atLeast(16, 4)) {
      return { intro: 'On your version of iOS, only Safari can add websites to the home screen. Open Tydio in Safari, then:', steps: safariSteps, note: pushNote }
    }
    return {
      steps: [
        browser === 'chrome'
          ? 'Tap the Share button in the address bar at the top right.'
          : 'Open the browser menu (☰ or •••) and tap Share.',
        ADD_TO_HOME_IOS,
        'Tap Add.',
      ],
    }
  }
  return { steps: safariSteps, note: pushNote ?? versionNote }
}

function androidGuide({ browser }: Device): Guide {
  switch (browser) {
    case 'samsung':
      return { steps: ['Tap the menu button (☰) at the bottom right.', 'Tap Add page to, then Home screen.', 'Tap Add.'] }
    case 'firefox':
      return { steps: ['Tap the menu button (⋮).', 'Tap Add app to Home screen (it may say Install).', 'Tap Add.'] }
    case 'edge':
      return { steps: ['Tap the ••• button at the bottom of the screen.', 'Tap Add to phone.', 'Tap Install.'] }
    case 'in-app':
      return {
        intro: "You're viewing Tydio inside another app. Open it in Chrome first:",
        steps: [
          'Tap the ⋮ menu in this app and choose Open in Chrome (or Open in browser).',
          'In Chrome, tap the ⋮ menu at the top right.',
          'Tap Add to Home screen (it may say Install app).',
          'Tap Install.',
        ],
      }
    default:
      return {
        steps: [
          'Tap the ⋮ menu at the top right of your browser.',
          'Tap Add to Home screen (it may say Install app).',
          'Tap Install, then Add if asked.',
        ],
      }
  }
}

export function describeDevice(device: Device): string {
  const name = device.platform === 'android' ? 'Android' : device.iPad ? 'iPad' : 'iPhone'
  const version = device.platform === 'ios' && device.iosVersion ? ` · iOS ${device.iosVersion.major}` : ''
  const browsers: Record<Browser, string> = {
    safari: 'Safari', chrome: 'Chrome', firefox: 'Firefox', edge: 'Edge', samsung: 'Samsung Internet', 'in-app': 'in-app browser', other: '',
  }
  const browser = browsers[device.browser] ? ` · ${browsers[device.browser]}` : ''
  return name + version + browser
}
