'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from '@/app/components/NavigationSpinner'
import { startPayoutSetupAction, getPayoutDashboardLinkAction } from './actions'
import type { PayoutMethodSummary } from '@/lib/stripe/connect'

function IconBack() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M10 12L6 8l4-4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconShieldCheck() {
  return (
    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--color-brand)' }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </div>
  )
}

function StripeNotice() {
  return (
    <div className="rounded-2xl px-4 py-4 mb-4 flex items-start gap-3" style={{ backgroundColor: '#e8f9fa' }}>
      <IconShieldCheck />
      <div>
        <p className="text-sm font-bold" style={{ color: '#1a2332' }}>
          Tydio partners with Stripe for secure financial services
        </p>
        <p className="text-xs text-slate-500 mt-0.5">Manage your payout methods on Stripe</p>
      </div>
    </div>
  )
}

function IconHome() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}

function IconMessage() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  )
}

function IconBank() {
  return (
    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-slate-100">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21h18M3 10h18M5 6l7-4 7 4M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" />
      </svg>
    </div>
  )
}

function IconUserActive() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  )
}

export default function PayoutMethodView({
  hasPayoutMethod,
  payoutMethods,
  needsMoreInfo,
  unreadMessageCount,
}: {
  hasPayoutMethod: boolean
  payoutMethods: PayoutMethodSummary[]
  // Stripe still needs details (e.g. date of birth) before payouts can continue.
  needsMoreInfo: boolean
  unreadMessageCount: number
}) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAddPayoutMethod() {
    setSubmitting(true)
    setError(null)
    const result = await startPayoutSetupAction()
    if ('error' in result) {
      setSubmitting(false)
      setError(result.error)
      return
    }
    // Account Link URLs are single-use and expire quickly — navigate away
    // immediately rather than leaving this tab in a stale "submitting" state.
    window.location.href = result.url
  }

  async function handleAddAnother() {
    setSubmitting(true)
    setError(null)
    const result = await getPayoutDashboardLinkAction()
    if ('error' in result) {
      setSubmitting(false)
      setError(result.error)
      return
    }
    window.location.href = result.url
  }

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-40 max-w-sm mx-auto w-full">
        <button
          type="button"
          onClick={() => router.push('/pro/profile')}
          aria-label="Back"
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-2 mb-4"
        >
          <IconBack />
        </button>

        <h1 className="text-3xl font-bold text-slate-900 mb-5">Payout Method</h1>

        <StripeNotice />

        {needsMoreInfo && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 mb-4">
            <p className="text-sm font-semibold text-amber-900 mb-0.5">Stripe needs a few more details</p>
            <p className="text-sm text-amber-800 leading-relaxed mb-3">
              Finish your payout setup, such as adding your date of birth, so your payouts aren&apos;t paused.
            </p>
            <button
              type="button"
              onClick={handleAddPayoutMethod}
              disabled={submitting}
              className="text-sm font-semibold px-4 py-2 rounded-xl bg-white border border-amber-300 text-amber-900 disabled:opacity-60"
            >
              {submitting ? 'Please wait…' : 'Finish payout setup'}
            </button>
          </div>
        )}

        {hasPayoutMethod && payoutMethods.length > 0 ? (
          <div className="rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-100 overflow-hidden">
            {payoutMethods.map((pm) => (
              <div key={pm.id} className="flex items-center gap-3 px-4 py-3.5">
                <IconBank />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {pm.label} •••• {pm.last4}
                  </p>
                  <p className="text-xs text-slate-400">{pm.kind === 'bank_account' ? 'Bank account' : 'Debit card'}</p>
                </div>
                {pm.isDefault && (
                  <span
                    className="flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded-full"
                    style={{ color: 'var(--color-brand)', backgroundColor: '#e8f9fa' }}
                  >
                    Default
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : hasPayoutMethod ? (
          <div className="rounded-2xl border border-slate-100 shadow-sm py-14 px-6 text-center">
            <p className="font-bold text-slate-900 mb-1.5">Payout method connected</p>
            <p className="text-sm text-slate-400 leading-relaxed">You&apos;re all set to receive payouts from completed bookings</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-100 shadow-sm py-14 px-6 text-center">
            <p className="font-bold text-slate-900 mb-1.5">No payout method yet</p>
            <p className="text-sm text-slate-400 leading-relaxed">Add a payout method to begin accepting bookings</p>
          </div>
        )}
      </div>

      <div className="fixed bottom-20 inset-x-0 px-5">
        <div className="max-w-sm mx-auto w-full">
          {error && (
            <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-3 leading-relaxed text-center">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={hasPayoutMethod ? handleAddAnother : handleAddPayoutMethod}
            disabled={submitting}
            className="w-full py-4 rounded-2xl text-white font-semibold text-base tracking-wide disabled:opacity-60 transition-opacity"
            style={{ backgroundColor: 'var(--color-brand)' }}
          >
            {submitting ? 'Please wait…' : hasPayoutMethod ? 'Add another payout method' : 'Add payout method'}
          </button>
          <p className="text-center text-xs font-semibold text-slate-900 mt-4">Powered by Stripe</p>
        </div>
      </div>

      {/* Bottom nav */}
      <nav aria-label="Main" className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100">
        <div className="flex justify-around items-center py-2 max-w-sm mx-auto px-2">
          {[
            { icon: <IconHome />, label: 'Home', href: '/pro/dashboard', active: false, badge: 0 },
            { icon: <IconCalendar />, label: 'Bookings', href: '/pro/bookings', active: false, badge: 0 },
            { icon: <IconMessage />, label: 'Messages', href: '/pro/messages', active: false, badge: unreadMessageCount },
            { icon: <IconUserActive />, label: 'Profile', href: '/pro/profile', active: true, badge: 0 },
          ].map((item) => (
            <Link key={item.label} href={item.href} aria-current={item.active ? 'page' : undefined} className="flex flex-col items-center gap-0.5 px-3 py-1 relative">
              <span className="relative">
                {item.icon}
                {item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-brand text-white text-[10px] font-bold flex items-center justify-center leading-none">
                    {item.badge}
                  </span>
                )}
              </span>
              <span className={`text-[10px] font-medium ${item.active ? 'text-brand' : 'text-slate-400'}`}>
                {item.label}
              </span>
              {item.active && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand" />
              )}
            </Link>
          ))}
        </div>
      </nav>
    </main>
  )
}
