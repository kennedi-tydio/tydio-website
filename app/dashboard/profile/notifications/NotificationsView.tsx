'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from '@/app/components/NavigationSpinner'
import ToggleSwitch from '@/app/components/form/ToggleSwitch'
import { setEmailNotificationsAction, setSmsConsentAction } from '@/app/actions/notificationConsent'
import { enablePushNotifications, disablePushNotifications, useDevicePushSubscribed, useIsStandalone } from '@/app/components/pushSubscription'
import ModalShell from '@/app/components/ModalShell'
import AddToHomeScreenGuide from '@/app/components/AddToHomeScreenGuide'
import SmsOptOutConfirm from '@/app/components/SmsOptOutConfirm'
import PhoneWithCountryInput from '@/app/components/form/PhoneWithCountryInput'
import { joinPhone, splitPhone } from '@/lib/phoneParts'

function IconBack() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M10 12L6 8l4-4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}


type Props = {
  // Where their texts go: their texting number if they gave a different one,
  // else their profile phone (lib/smsPhone).
  initialPhone: string | null
  initialSmsConsent: 'opted_in' | 'declined' | null
  initialPushConsent: 'opted_in' | 'declined' | null
  initialEmailEnabled: boolean
  // Temporary push requirement (lib/pushRequirement) and this account has no device on yet.
  pushRequired: boolean
}

export default function NotificationsView({ initialPhone, initialSmsConsent, initialPushConsent, initialEmailEnabled, pushRequired }: Props) {
  const router = useRouter()
  const [smsConsent, setSmsConsent] = useState(initialSmsConsent)
  const [pushConsent, setPushConsent] = useState(initialPushConsent)
  const [emailEnabled, setEmailEnabled] = useState(initialEmailEnabled)
  // The number texts go to now, and the editor for changing it (or giving
  // one when turning texts on without a number on file).
  const [savedPhone, setSavedPhone] = useState(initialPhone)
  const [country, setCountry] = useState(() => splitPhone(initialPhone).country)
  const [phone, setPhone] = useState(() => splitPhone(initialPhone).number)
  const [editingPhone, setEditingPhone] = useState(false)
  const [working, setWorking] = useState<'sms' | 'push' | 'email' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showInstallGuide, setShowInstallGuide] = useState(false)
  const [confirmingSmsOptOut, setConfirmingSmsOptOut] = useState(false)
  const standalone = useIsStandalone()
  const deviceSubscribed = useDevicePushSubscribed(standalone)
  const [subscribedHere, setSubscribedHere] = useState<boolean | null>(null)
  // Push is per device: on only when the account is opted in and this
  // installed app holds a subscription. Outside the installed app it's off.
  const pushOn = standalone && pushConsent === 'opted_in' && (subscribedHere ?? deviceSubscribed) !== false

  async function handleSmsToggle() {
    setError(null)
    if (smsConsent === 'opted_in') {
      setConfirmingSmsOptOut(true)
      return
    }

    if (!savedPhone) {
      setEditingPhone(true)
      return
    }

    setWorking('sms')
    const result = await setSmsConsentAction('opted_in')
    setWorking(null)
    if ('error' in result) return setError(result.error)
    setSmsConsent('opted_in')
    router.refresh()
  }

  async function confirmSmsOptOut() {
    setError(null)
    setWorking('sms')
    const result = await setSmsConsentAction('declined')
    setWorking(null)
    setConfirmingSmsOptOut(false)
    if ('error' in result) return setError(result.error)
    setSmsConsent('declined')
  }

  // Saves the number from the editor and turns texts on. Their profile phone
  // stays as is; a different number is kept as their texting number.
  async function confirmPhoneAndOptIn() {
    if (!phone.trim()) {
      setError('Please enter a phone number.')
      return
    }
    const fullPhone = joinPhone(country, phone)
    if (!fullPhone) {
      setError('Please choose a country code.')
      return
    }
    setError(null)
    setWorking('sms')
    const result = await setSmsConsentAction('opted_in', fullPhone)
    setWorking(null)
    if ('error' in result) return setError(result.error)
    setSmsConsent('opted_in')
    setSavedPhone(fullPhone)
    setEditingPhone(false)
    router.refresh()
  }

  function cancelPhoneEdit() {
    setError(null)
    setCountry(splitPhone(savedPhone).country)
    setPhone(splitPhone(savedPhone).number)
    setEditingPhone(false)
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

        {pushRequired && !pushOn && (
          <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 mb-4">
            <p className="font-semibold mb-0.5">Turn on push notifications</p>
            <p>
              {'For now, you need push notifications on to book a cleaning, so we can reach you about your booking.'}{' '}
              {standalone ? 'Switch on Push notifications below.' : 'Add Tydio to your home screen, open it from there, then switch on Push notifications below.'}
            </p>
          </div>
        )}
        {pushRequired && pushOn && (
          <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 mb-4">
            <p className="font-semibold mb-1">Push notifications are on</p>
            <Link href="/book" className="font-semibold underline underline-offset-2">Continue booking</Link>
          </div>
        )}

        {error && <p role="alert" className="text-xs text-red-600 mb-4">{error}</p>}

        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm divide-y divide-slate-100 overflow-hidden mb-4">
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="font-semibold text-slate-900 text-sm">Text notifications</p>
              <p className="text-xs text-slate-400 mt-0.5">Booking updates and messages by text</p>
              {smsConsent === 'opted_in' && savedPhone && !editingPhone && (
                <p className="text-xs text-slate-600 mt-1">
                  Texts go to <span className="font-medium">{savedPhone}</span>.{' '}
                  <button type="button" onClick={() => setEditingPhone(true)} className="text-sky-600 underline underline-offset-2">
                    Change
                  </button>
                </p>
              )}
              {smsConsent !== 'opted_in' && (
                <p className="text-xs text-slate-400 mt-1">
                  If you replied STOP to one of our texts, reply START to that text to turn them back on.
                </p>
              )}
            </div>
            <ToggleSwitch on={smsConsent === 'opted_in'} onClick={handleSmsToggle} disabled={working === 'sms'} label="Text notifications" />
          </div>

          {editingPhone && (
            <div className="px-5 py-4">
              <p className="text-xs font-medium text-slate-700 mb-2">Number for text messages</p>
              <PhoneWithCountryInput
                country={country}
                onCountryChange={setCountry}
                number={phone}
                onNumberChange={setPhone}
                className="mb-2"
              />
              <p className="text-xs text-slate-400 mb-3">This doesn&apos;t change the phone number on your profile.</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={cancelPhoneEdit}
                  disabled={working === 'sms'}
                  className="flex-1 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmPhoneAndOptIn}
                  disabled={working === 'sms'}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: 'var(--color-brand)' }}
                >
                  {working === 'sms' ? 'Saving…' : 'Save'}
                </button>
              </div>
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
      {confirmingSmsOptOut && (
        <ModalShell
          panelClassName="w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl px-6 pt-6 pb-8 shadow-2xl"
          labelledBy="sms-optout-title"
          onClose={() => setConfirmingSmsOptOut(false)}
        >
          <SmsOptOutConfirm
            titleId="sms-optout-title"
            working={working === 'sms'}
            onConfirm={confirmSmsOptOut}
            onCancel={() => setConfirmingSmsOptOut(false)}
          />
        </ModalShell>
      )}
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
