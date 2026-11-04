'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from '@/app/components/NavigationSpinner'
import ToggleSwitch from '@/app/components/form/ToggleSwitch'
import { setEmailNotificationsAction, setSmsConsentAction } from '@/app/actions/notificationConsent'
import { enablePushNotifications, disablePushNotifications, useDevicePushSubscribed, useIsStandalone } from '@/app/components/pushSubscription'
import ModalShell from '@/app/components/ModalShell'
import AddToHomeScreenGuide from '@/app/components/AddToHomeScreenGuide'

function IconBack() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M10 12L6 8l4-4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}


type Props = {
  initialPhone: string | null
  initialSmsConsent: 'opted_in' | 'declined' | null
  initialPushConsent: 'opted_in' | 'declined' | null
  initialEmailEnabled: boolean
}

export default function NotificationsView({ initialPhone, initialSmsConsent, initialPushConsent, initialEmailEnabled }: Props) {
  const router = useRouter()
  const [smsConsent, setSmsConsent] = useState(initialSmsConsent)
  const [pushConsent, setPushConsent] = useState(initialPushConsent)
  const [emailEnabled, setEmailEnabled] = useState(initialEmailEnabled)
  const [phone, setPhone] = useState(initialPhone ?? '')
  const [askingForPhone, setAskingForPhone] = useState(false)
  const [working, setWorking] = useState<'sms' | 'push' | 'email' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showInstallGuide, setShowInstallGuide] = useState(false)
  const standalone = useIsStandalone()
  const deviceSubscribed = useDevicePushSubscribed(standalone)
  const [subscribedHere, setSubscribedHere] = useState<boolean | null>(null)
  // Push is per device: on only when the account is opted in and this
  // installed app holds a subscription. Outside the installed app it's off.
  const pushOn = standalone && pushConsent === 'opted_in' && (subscribedHere ?? deviceSubscribed) !== false

  async function handleSmsToggle() {
    setError(null)
    if (smsConsent === 'opted_in') {
      setWorking('sms')
      const result = await setSmsConsentAction('declined')
      setWorking(null)
      if ('error' in result) return setError(result.error)
      setSmsConsent('declined')
      return
    }

    if (!phone.trim() && !initialPhone) {
      setAskingForPhone(true)
      return
    }

    setWorking('sms')
    const result = await setSmsConsentAction('opted_in', phone.trim() || undefined)
    setWorking(null)
    if ('error' in result) return setError(result.error)
    setSmsConsent('opted_in')
    setAskingForPhone(false)
    router.refresh()
  }

  async function confirmPhoneAndOptIn() {
    if (!phone.trim()) {
      setError('Please enter a phone number.')
      return
    }
    setError(null)
    setWorking('sms')
    const result = await setSmsConsentAction('opted_in', phone.trim())
    setWorking(null)
    if ('error' in result) return setError(result.error)
    setSmsConsent('opted_in')
    setAskingForPhone(false)
    router.refresh()
  }

  async function handlePushToggle() {
    setError(null)
    setWorking('push')
    const result = pushOn ? await disablePushNotifications() : await enablePushNotifications()
    setWorking(null)
    if ('error' in result) {
      setError(result.error)
      // A refused permission prompt records the account as declined.
      if (!pushOn && typeof Notification !== 'undefined' && Notification.permission === 'denied') setPushConsent('declined')
      return
    }
    setPushConsent(pushOn ? 'declined' : 'opted_in')
    setSubscribedHere(!pushOn)
  }

  async function handleEmailToggle() {
    setError(null)
    setWorking('email')
    const result = await setEmailNotificationsAction(!emailEnabled)
    setWorking(null)
    if ('error' in result) return setError(result.error)
    setEmailEnabled(!emailEnabled)
  }

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-10 pb-16 max-w-sm mx-auto w-full">
        <Link
          href="/dashboard/profile"
          aria-label="Back to Profile"
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-2 mb-4"
        >
          <IconBack />
        </Link>

        <h1 className="text-3xl font-bold text-slate-900 mb-6">Notifications</h1>

        {error && <p role="alert" className="text-xs text-red-600 mb-4">{error}</p>}

        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm divide-y divide-slate-100 overflow-hidden mb-4">
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="font-semibold text-slate-900 text-sm">Text notifications</p>
              <p className="text-xs text-slate-400 mt-0.5">Booking updates and messages by text</p>
              {smsConsent !== 'opted_in' && (
                <p className="text-xs text-slate-400 mt-1">
                  If you replied STOP to one of our texts, reply START to that text to turn them back on.
                </p>
              )}
            </div>
            <ToggleSwitch on={smsConsent === 'opted_in'} onClick={handleSmsToggle} disabled={working === 'sms'} label="Text notifications" />
          </div>

          {askingForPhone && (
            <div className="px-5 py-4">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone number"
                aria-label="Phone number"
                autoComplete="tel"
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm mb-3"
              />
              <button
                type="button"
                onClick={confirmPhoneAndOptIn}
                disabled={working === 'sms'}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-brand)' }}
              >
                {working === 'sms' ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}

          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="font-semibold text-slate-900 text-sm">Push notifications</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Booking updates on your home screen. {!standalone && (
                  <>
                    Add Tydio to your home screen first, then open it from there to turn these on.{' '}
                    <button type="button" onClick={() => setShowInstallGuide(true)} className="text-sky-600 underline underline-offset-2">
                      Show me how
                    </button>
                  </>
                )}
              </p>
            </div>
            <ToggleSwitch on={pushOn} onClick={handlePushToggle} disabled={working === 'push' || !standalone} label="Push notifications" />
          </div>

          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="font-semibold text-slate-900 text-sm">Email notifications</p>
              <p className="text-xs text-slate-400 mt-0.5">Booking updates by email</p>
            </div>
            <ToggleSwitch on={emailEnabled} onClick={handleEmailToggle} disabled={working === 'email'} label="Email notifications" />
          </div>
        </div>
      </div>
      {showInstallGuide && (
        <ModalShell
          panelClassName="w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl px-6 pt-6 pb-8 shadow-2xl"
          labelledBy="install-guide-title"
          onClose={() => setShowInstallGuide(false)}
        >
          <AddToHomeScreenGuide titleId="install-guide-title" onDone={() => setShowInstallGuide(false)} skipLabel="Close" />
        </ModalShell>
      )}
    </main>
  )
}
