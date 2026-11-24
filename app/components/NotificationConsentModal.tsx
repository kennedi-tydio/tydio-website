'use client'

import { useEffect, useRef, useState } from 'react'
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
import SmsOptInPrompt from './SmsOptInPrompt'
import SmsOptOutConfirm from './SmsOptOutConfirm'
import { PUSH_REQUIRED } from '@/lib/pushRequirement'
import AddToHomeScreenGuide from './AddToHomeScreenGuide'
import { dismissInstallGuide, snoozeInstallGuide, useInstallGuideDismissed, useInstallGuideSnoozed } from './installGuide'
import { joinPhone, splitPhone } from '@/lib/phoneParts'

type Props = {
  initialPhone: string | null
  smsConsent: 'opted_in' | 'declined' | null
  pushConsent: 'opted_in' | 'declined' | null
  // Ask "Are you sure?" before recording a text opt-out (customers).
  confirmSmsOptOut?: boolean
}

export default function NotificationConsentModal({ initialPhone, smsConsent, pushConsent, confirmSmsOptOut = false }: Props) {
  const router = useRouter()
  const standalone = useIsStandalone()
  const installDismissed = useInstallGuideDismissed()
  const installSnoozed = useInstallGuideSnoozed()
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
      : !standalone && !installDismissed && !installSnoozed
        ? 'install'
        : ((standalone && pushConsent === null) || newDevice) && permission !== null && permission !== 'granted'
          ? 'push'
          : null
  // Set after "I've added it" so the guide closes on a pointer to the
  // installed app, which is where the push step below appears.
  const [justInstalled, setJustInstalled] = useState(false)
  const [country, setCountry] = useState(() => splitPhone(initialPhone).country)
  const [phone, setPhone] = useState(() => splitPhone(initialPhone).number)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingOptOut, setConfirmingOptOut] = useState(false)

  async function handleSmsResponse(optIn: boolean, confirmed = false) {
    setError(null)
    if (!optIn && confirmSmsOptOut && !confirmed) {
      setConfirmingOptOut(true)
      return
    }
    // Opting in needs a number. Without one, go back to the opt-in screen,
    // where the phone field is, instead of saving from "Are you sure?".
    if (optIn && !phone.trim()) {
      setConfirmingOptOut(false)
      setError('Please enter a phone number.')
      return
    }
    const fullPhone = optIn ? joinPhone(country, phone) : null
    if (optIn && !fullPhone) {
      setConfirmingOptOut(false)
      setError('Please choose a country code.')
      return
    }
    setWorking(true)
    const result = await setSmsConsentAction(optIn ? 'opted_in' : 'declined', fullPhone ?? undefined)
    setWorking(false)
    // A failed save stays on the current screen with the error showing.
    if ('error' in result) {
      setError(result.error)
      return
    }
    setConfirmingOptOut(false)
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

  function handleInstallDone(added: boolean, dontShowAgain: boolean) {
    // Added, or skipped with "Don't show me this again": never ask on this
    // device again. A plain Skip only hides it until their next visit.
    if (added || dontShowAgain) dismissInstallGuide()
    else snoozeInstallGuide()
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
      {step === 'sms' && confirmingOptOut ? (
        <SmsOptOutConfirm
          titleId="consent-title"
          working={working}
          error={error}
          onConfirm={() => handleSmsResponse(false, true)}
          // "No, send me text updates": opt them in right here. Without a
          // phone number, this returns to the prompt asking for one.
          onCancel={() => handleSmsResponse(true)}
        />
      ) : step === 'sms' ? (
        <SmsOptInPrompt
          titleId="consent-title"
          country={country}
          onCountryChange={setCountry}
          phone={phone}
          onPhoneChange={setPhone}
          error={error}
          working={working}
          onRespond={handleSmsResponse}
        />
      ) : step === 'install' ? (
        <AddToHomeScreenGuide titleId="consent-title" onDone={handleInstallDone} offerDontShowAgain />
      ) : (
        <>
          <h2 id="consent-title" className="text-lg font-bold text-slate-900 mb-1">
            {newDevice ? 'Turn on push notifications here too?' : 'Turn on push notifications?'}
          </h2>
          <p className="text-sm text-slate-500 mb-4">
            {newDevice
              ? 'Push notifications are on for your account, but not on this device yet.'
              : `Get notified about booking updates right on your home screen.${PUSH_REQUIRED ? ' For now, you need these on to book or receive bookings.' : ''}`}
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
