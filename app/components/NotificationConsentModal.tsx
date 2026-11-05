'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from '@/app/components/NavigationSpinner'
import { setSmsConsentAction, setPushConsentAction } from '@/app/actions/notificationConsent'
import {
  dismissDevicePushPrompt,
  enablePushNotifications,
  useDevicePushPromptDismissed,
  useDevicePushSubscribed,
  useIsStandalone,
  useNotificationPermission,
} from '@/app/components/pushSubscription'
import ModalShell from './ModalShell'
import AddToHomeScreenGuide from './AddToHomeScreenGuide'
import { dismissInstallGuide, useInstallGuideDismissed } from './installGuide'

type Props = {
  initialPhone: string | null
  smsConsent: 'opted_in' | 'declined' | null
  pushConsent: 'opted_in' | 'declined' | null
}

export default function NotificationConsentModal({ initialPhone, smsConsent, pushConsent }: Props) {
  const router = useRouter()
  const standalone = useIsStandalone()
  const installDismissed = useInstallGuideDismissed()
  const deviceSubscribed = useDevicePushSubscribed(standalone && pushConsent === 'opted_in')
  const devicePromptDismissed = useDevicePushPromptDismissed()
  const permission = useNotificationPermission()
  // The account opted in on another device (or this one lost its
  // subscription), so offer push here too — unless the browser has already
  // blocked notifications, where asking again can't succeed.
  const newDevice =
    standalone &&
    pushConsent === 'opted_in' &&
    deviceSubscribed === false &&
    !devicePromptDismissed &&
    permission !== 'denied'
  // Notifications are already allowed on this device, so there's nothing to
  // ask: subscribe quietly instead (requestPermission returns at once without a
  // prompt). Covers iOS dropping a subscription, and a second account (e.g.
  // their Tidy Pro one) on a phone where they already turned push on.
  const silentlySubscribe =
    standalone && permission === 'granted' && (pushConsent === null || (pushConsent === 'opted_in' && deviceSubscribed === false))
  const subscribingRef = useRef(false)
  useEffect(() => {
    if (!silentlySubscribe || subscribingRef.current) return
    subscribingRef.current = true
    enablePushNotifications({ declineOnRefusal: false }).then((result) => {
      if ('success' in result) dismissDevicePushPrompt()
      router.refresh()
    })
  }, [silentlySubscribe, router])
  // Derived fresh every render from the current consent props + the
  // standalone signal — after a response, the server action's
  // revalidatePath + router.refresh() bring back updated consent props,
  // which naturally advances to the next eligible step (or closes). The
  // install guide sits between SMS and push: push only works once Tydio is
  // opened from the home screen.
  const step: 'sms' | 'install' | 'push' | null =
    smsConsent === null
      ? 'sms'
      : !standalone && !installDismissed
        ? 'install'
        : ((standalone && pushConsent === null) || newDevice) && permission !== null && permission !== 'granted'
          ? 'push'
          : null
  // Set after "I've added it" so the guide closes on a pointer to the
  // installed app, which is where the push step below appears.
  const [justInstalled, setJustInstalled] = useState(false)
  const [phone, setPhone] = useState(initialPhone ?? '')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSmsResponse(optIn: boolean) {
    setError(null)
    if (optIn && !phone.trim()) {
      setError('Please enter a phone number.')
      return
    }
    setWorking(true)
    const result = await setSmsConsentAction(optIn ? 'opted_in' : 'declined', optIn ? phone.trim() : undefined)
    setWorking(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  async function handlePushYes() {
    setError(null)
    setWorking(true)
    const result = await enablePushNotifications({ declineOnRefusal: !newDevice })
    setWorking(false)
    if ('error' in result) {
      setError(result.error)
      // Here a refusal leaves the account as is, so the step stays open
      // with the error until they tap Not now.
      if (newDevice) return
    } else {
      // deviceSubscribed was read before subscribing; this keeps the
      // new-device prompt from reappearing after the refresh.
      dismissDevicePushPrompt()
    }
    router.refresh()
  }

  async function handlePushNo() {
    // Only this device is being declined; the account stays opted in.
    if (newDevice) return dismissDevicePushPrompt()
    setWorking(true)
    await setPushConsentAction('declined')
    setWorking(false)
    router.refresh()
  }

  function handleInstallDone(added: boolean) {
    dismissInstallGuide()
    if (added) setJustInstalled(true)
  }

  if (justInstalled && !standalone) {
    return (
      <ModalShell panelClassName="w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl px-6 pt-6 pb-8 shadow-2xl" labelledBy="consent-title" closeOnBackdrop={false}>
        <h2 id="consent-title" className="text-lg font-bold text-slate-900 mb-1">Now open Tydio from your home screen</h2>
        <p className="text-sm text-slate-500 mb-4">
          Tap the Tydio icon on your home screen. We&apos;ll ask there about turning on push notifications.
        </p>
        <button
          type="button"
          onClick={() => setJustInstalled(false)}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white"
          style={{ backgroundColor: 'var(--color-brand)' }}
        >
          Got it
        </button>
      </ModalShell>
    )
  }

  if (!step) return null

  return (
    <ModalShell panelClassName="w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl px-6 pt-6 pb-8 shadow-2xl" labelledBy="consent-title" closeOnBackdrop={false}>
      {step === 'sms' ? (
        <>
          <h2 id="consent-title" className="text-lg font-bold text-slate-900 mb-1">Stay updated by text?</h2>
          <p className="text-sm text-slate-500 mb-4">
            We&apos;ll text you about booking requests, updates, and messages. Message frequency varies. Msg &amp; data
            rates may apply. Reply STOP to opt out, HELP for help. See our{' '}
            <Link href="/terms#sms" className="text-sky-600 underline underline-offset-2">Terms</Link> and{' '}
            <Link href="/privacy" className="text-sky-600 underline underline-offset-2">Privacy Policy</Link>.
          </p>
          {/* Only ask for a number when we don't already have one on file */}
          {!initialPhone && (
            <input
              aria-label="Phone number"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm mb-3"
            />
          )}
          {error && <p role="alert" className="text-xs text-red-600 mb-3">{error}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => handleSmsResponse(false)}
              disabled={working}
              className="flex-1 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600 disabled:opacity-50"
            >
              No thanks
            </button>
            <button
              type="button"
              onClick={() => handleSmsResponse(true)}
              disabled={working}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-brand)' }}
            >
              {working ? 'Saving…' : 'Yes, text me'}
            </button>
          </div>
        </>
      ) : step === 'install' ? (
        <AddToHomeScreenGuide titleId="consent-title" onDone={handleInstallDone} />
      ) : (
        <>
          <h2 id="consent-title" className="text-lg font-bold text-slate-900 mb-1">
            {newDevice ? 'Turn on push notifications here too?' : 'Turn on push notifications?'}
          </h2>
          <p className="text-sm text-slate-500 mb-4">
            {newDevice
              ? 'Push notifications are on for your account, but not on this device yet.'
              : 'Get notified about booking updates right on your home screen.'}
          </p>
          {error && <p role="alert" className="text-xs text-red-600 mb-3">{error}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handlePushNo}
              disabled={working}
              className="flex-1 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600 disabled:opacity-50"
            >
              {newDevice ? 'Not now' : 'No thanks'}
            </button>
            <button
              type="button"
              onClick={handlePushYes}
              disabled={working}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-brand)' }}
            >
              {working ? 'Saving…' : 'Turn on'}
            </button>
          </div>
        </>
      )}
    </ModalShell>
  )
}
