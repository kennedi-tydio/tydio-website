'use client'

import { useState } from 'react'
import Link from 'next/link'
import { getPayoutDashboardLinkAction } from './payouts/actions'

const BUTTON_CLASS = 'block w-full mt-3 py-2.5 rounded-xl text-center text-sm font-semibold text-white disabled:opacity-60'

// Under the earnings on a Tidy Pro's profile: opens their Stripe Express Dashboard,
// where every payout and when it reaches their bank is listed. Stripe's login links
// are single use and expire in minutes, so one is made on each tap. Until payouts are
// set up there's no dashboard yet, so it sends them to set that up.
export default function StripeDashboardButton({ payoutsReady }: { payoutsReady: boolean }) {
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!payoutsReady) {
    return (
      <Link href="/pro/profile/payouts" className={BUTTON_CLASS} style={{ backgroundColor: '#1a2332' }}>
        Set up payouts to track them
      </Link>
    )
  }

  async function handleOpen() {
    setOpening(true)
    setError(null)
    const result = await getPayoutDashboardLinkAction()
    if ('error' in result) {
      setOpening(false)
      setError(result.error)
      return
    }
    window.location.href = result.url
  }

  return (
    <>
      <button type="button" onClick={handleOpen} disabled={opening} className={BUTTON_CLASS} style={{ backgroundColor: '#1a2332' }}>
        {opening ? 'Opening Stripe…' : 'View Stripe dashboard'}
      </button>
      <p className="text-xs text-slate-400 mt-1.5 text-center">Track your payouts and when they reach your bank.</p>
      {error && <p role="alert" className="text-xs text-red-600 mt-1.5 text-center">{error}</p>}
    </>
  )
}
