import { useEffect, useState, useSyncExternalStore } from 'react'
import { setPushConsentAction, subscribeToPushAction } from '@/app/actions/notificationConsent'
import { userFacingError } from '@/lib/userFacingError'
import { createDeviceFlag } from './deviceFlag'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

function getStandaloneSnapshot(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  )
}

function getStandaloneServerSnapshot(): boolean {
  return false
}

function subscribeToStandaloneChange(callback: () => void): () => void {
  const mql = window.matchMedia('(display-mode: standalone)')
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

// SSR-safe read of whether the app is running installed/standalone (added
// to the home screen) rather than in a regular browser tab — the only
// reliable signal available for "did they install the PWA."
export function useIsStandalone(): boolean {
  return useSyncExternalStore(subscribeToStandaloneChange, getStandaloneSnapshot, getStandaloneServerSnapshot)
}

function getPermissionSnapshot(): NotificationPermission | null {
  return typeof Notification === 'undefined' ? null : Notification.permission
}

function getPermissionServerSnapshot(): NotificationPermission | null {
  return null
}

// The page changes permission only through requestPermission, after which the
// callers refresh, so there's nothing to listen to.
function subscribeToPermissionChange(): () => void {
  return () => {}
}

// The browser's notification permission, or null on the server and where
// notifications aren't available.
export function useNotificationPermission(): NotificationPermission | null {
  return useSyncExternalStore(subscribeToPermissionChange, getPermissionSnapshot, getPermissionServerSnapshot)
}

// Requests browser permission, subscribes via the service worker, and
// records both the subscription and the consent flag. Used by both the
// first-login consent modal and the Profile notifications settings page
// so the subscribe flow only lives in one place.
// On a second device for an account that's already opted in, a refused
// permission prompt shouldn't turn push off for the account's other devices,
// so callers pass declineOnRefusal: false there.
export async function enablePushNotifications({ declineOnRefusal = true } = {}): Promise<{ success: true } | { error: string }> {
  if (typeof window === 'undefined') return { error: 'Push notifications are not supported on this device.' }
  // Push is only offered in the installed app: iOS has no push in a browser
  // tab at all, and keeping every platform the same avoids subscribing a
  // tab the person later closes for good.
  if (!getStandaloneSnapshot()) return { error: 'Add Tydio to your home screen first, then open it from there.' }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { error: 'Push notifications are not supported on this device.' }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    if (declineOnRefusal) await setPushConsentAction('declined')
    return { error: 'Permission was not granted.' }
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!publicKey) return { error: 'Push is not configured.' }

  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    })

    const result = await subscribeToPushAction({
      endpoint: subscription.endpoint,
      keys: {
        p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')!))),
        auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')!))),
      },
    })
    if ('error' in result) return result

    await setPushConsentAction('opted_in')
    return { success: true }
  } catch (err) {
    return { error: userFacingError(err, 'Could not enable push notifications.') }
  }
}

// "Not on this device" answer to the new-device push prompt, so it isn't
// asked again here while the account stays opted in elsewhere.
const pushPromptFlag = createDeviceFlag('tydio:push-prompt-dismissed')
export const dismissDevicePushPrompt = pushPromptFlag.set
export const useDevicePushPromptDismissed = pushPromptFlag.useFlag

// Unsubscribes this device in the browser; the server action then removes
// every stored subscription for the profile so no device gets pushes.
export async function disablePushNotifications(): Promise<{ success: true } | { error: string }> {
  try {
    const registration = await navigator.serviceWorker?.getRegistration()
    const subscription = await registration?.pushManager?.getSubscription()
    await subscription?.unsubscribe()
  } catch {
    // The server-side delete below is what actually stops sends.
  }
  return setPushConsentAction('declined')
}

// Whether this browser currently holds a push subscription. Null while
// checking, or when push isn't available here (e.g. not installed on iOS).
export function useDevicePushSubscribed(enabled: boolean): boolean | null {
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
  useEffect(() => {
    if (!enabled || !('serviceWorker' in navigator) || !('PushManager' in window)) return
    let cancelled = false
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (!cancelled) setSubscribed(subscription !== null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [enabled])
  return subscribed
}
