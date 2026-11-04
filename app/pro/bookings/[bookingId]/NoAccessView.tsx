'use client'

import { useEffect, useState } from 'react'
import { useRouter } from '@/app/components/NavigationSpinner'
import Link from 'next/link'
import { reportNoAccessAction, startCleaningAction } from '@/app/pro/messages/[bookingId]/actions'
import { NO_ACCESS_WAIT_MINUTES } from '@/lib/bookingTime'

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

type Props = {
  bookingId: string
  customerName: string
  entryInstructions: string | null
  // When the report unlocks: NO_ACCESS_WAIT_MINUTES past the later of the start and arrival.
  reportableAtMs: number | null
}

// The cleaner is at the door but can't get in. They wait it out here, trying the entry
// instructions and messaging the customer, before they can report no access.
export default function NoAccessView({ bookingId, customerName, entryInstructions, reportableAtMs }: Props) {
  const router = useRouter()
  const [now, setNow] = useState(() => Date.now())
  const [confirming, setConfirming] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const msLeft = reportableAtMs == null ? null : reportableAtMs - now
  const canReport = msLeft != null && msLeft <= 0

  async function run(action: (id: string) => Promise<{ success: true } | { error: string }>) {
    setWorking(true)
    setError(null)
    const result = await action(bookingId)
    setWorking(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-10 max-w-sm mx-auto w-full">
        <h1 className="text-lg font-bold text-slate-900 mb-2">Can&apos;t get in?</h1>
        <p className="text-sm text-slate-600 mb-5">
          Try the entry instructions and message {customerName}. If you still can&apos;t get in after waiting{' '}
          {NO_ACCESS_WAIT_MINUTES} minutes from the start time or your arrival, whichever is later, you can report it and
          go. Our team will review the booking and email you about your pay.
        </p>

        {entryInstructions && (
          <div className="mb-5">
            <p className="text-sm font-bold text-slate-900 mb-1">Entry Instructions</p>
            <p className="text-sm text-slate-600">{entryInstructions}</p>
          </div>
        )}

        <Link
          href={`/pro/messages/${bookingId}`}
          className="block w-full py-2.5 rounded-xl text-center text-sm font-semibold border border-slate-200 text-slate-700 mb-6"
        >
          Message {customerName}
        </Link>

        <div className="rounded-2xl bg-slate-50 px-4 py-4 text-center" aria-live="polite">
          {msLeft == null ? (
            <p className="text-sm text-slate-500">Waiting time unavailable.</p>
          ) : canReport ? (
            <p className="text-sm text-slate-700">You&apos;ve waited long enough to report this.</p>
          ) : (
            <>
              <p className="text-xs text-slate-400 mb-1">You can report no access in</p>
              <p className="text-2xl font-bold text-slate-900 tabular-nums">{formatCountdown(msLeft)}</p>
            </>
          )}
        </div>

        {error && <p role="alert" className="text-xs text-red-600 mt-3">{error}</p>}
      </div>

      <div className="px-5 pb-8 max-w-sm mx-auto w-full space-y-3">
        {confirming ? (
          <>
            <p className="text-sm text-slate-600 text-center">
              Report that {customerName} was unavailable? The booking will be canceled.
            </p>
            <button
              type="button"
              onClick={() => run(reportNoAccessAction)}
              disabled={working}
              className="w-full py-3.5 rounded-2xl text-sm font-semibold text-white bg-red-600 disabled:opacity-60"
            >
              {working ? 'Reporting…' : 'Yes, report no access'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={working}
              className="w-full py-2 text-sm font-medium text-slate-500"
            >
              Keep waiting
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => run(startCleaningAction)}
              disabled={working}
              className="w-full py-3.5 rounded-2xl text-sm font-semibold text-white bg-brand disabled:opacity-60"
            >
              I got in — start cleaning
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={working || !canReport}
              className="w-full py-3 rounded-2xl text-sm font-semibold border border-red-200 text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Customer unavailable — no access
            </button>
          </>
        )}
      </div>
    </main>
  )
}
