'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from '@/app/components/NavigationSpinner'
import { setSmsConsentAction, setPushConsentAction } from '@/app/actions/notificationConsent'
import { enablePushNotifications, useIsStandalone } from '@/app/components/pushSubscription'
import ModalShell from './ModalShell'

type Props = {
  initialPhone: string | null
  smsConsent: 'opted_in' | 'declined' | null
  pushConsent: 'opted_in' | 'declined' | null
}

export default function NotificationConsentModal({ initialPhone, smsConsent, pushConsent }: Props) {
  const router = useRouter()
  const standalone = useIsStandalone()
  // Derived fresh every render from the current consent props + the
  // standalone signal — after a response, the server action's
  // revalidatePath + router.refresh() bring back updated consent props,
  // which naturally advances to the next eligible step (or closes).
  const step: 'sms' | 'push' | null = smsConsent === null ? 'sms' : standalone && pushConsent === null ? 'push' : null
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
    const result = await enablePushNotifications()
    setWorking(false)
    if ('error' in result) setError(result.error)
    router.refresh()
  }

  async function handlePushNo() {
    setWorking(true)
    await setPushConsentAction('declined')
    setWorking(false)
    router.refresh()
  }

  if (!step) return null

  return (
    <ModalShell panelClassName="w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl px-6 pt-6 pb-8 shadow-2xl" labelledBy="consent-title" closeOnBackdrop={false}>
      {step === 'sms' ? (
        <>
          <h2 id="consent-title" className="text-lg font-bold text-slate-900 mb-1">Stay updated by text?</h2>
          <p className="text-sm text-slate-500 mb-4">
            We&apos;ll text you about booking requests, updates, and messages. Standard messaging rates may apply.
            See our{' '}
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
      ) : (
        <>
          <h2 id="consent-title" className="text-lg font-bold text-slate-900 mb-1">Turn on push notifications?</h2>
          <p className="text-sm text-slate-500 mb-4">
            Get notified about booking updates right on your home screen.
          </p>
          {error && <p role="alert" className="text-xs text-red-600 mb-3">{error}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handlePushNo}
              disabled={working}
              className="flex-1 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600 disabled:opacity-50"
            >
              No thanks
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
