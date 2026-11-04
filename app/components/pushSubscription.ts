import { useSyncExternalStore } from 'react'
import { setPushConsentAction, subscribeToPushAction } from '@/app/actions/notificationConsent'

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

// Requests browser permission, subscribes via the service worker, and
// records both the subscription and the consent flag. Used by both the
// first-login consent modal and the Profile notifications settings page
// so the subscribe flow only lives in one place.
export async function enablePushNotifications(): Promise<{ success: true } | { error: string }> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { error: 'Push notifications are not supported on this device.' }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    await setPushConsentAction('declined')
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
    return { error: err instanceof Error ? err.message : 'Could not enable push notifications.' }
  }
}

export async function disablePushNotifications(): Promise<{ success: true } | { error: string }> {
  return setPushConsentAction('declined')
}
