'use client'

import { useEffect, useState } from 'react'
import { useRouter } from '@/app/components/NavigationSpinner'
import { reportNoShowAction } from './actions'

// Appears once the Tidy Pro is NO_SHOW_REPORT_AFTER_MINUTES past the start without having
// arrived. Reporting cancels the booking; the team settles the refund (see lib/bookingIncidents).
export default function ReportNoShowButton({
  bookingId,
  cleanerFirstName,
  reportableAtMs,
}: {
  bookingId: string
  cleanerFirstName: string
  reportableAtMs: number | null
}) {
  const router = useRouter()
  const [now, setNow] = useState(() => Date.now())
  const [confirming, setConfirming] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (reportableAtMs == null) return
    const timer = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(timer)
  }, [reportableAtMs])

  if (reportableAtMs == null || now < reportableAtMs) return null

  async function handleReport() {
    setWorking(true)
    setError(null)
    const result = await reportNoShowAction(bookingId)
    setWorking(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    router.push('/dashboard')
  }

  return (
    <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 mb-3 text-left">
      <p className="text-sm font-semibold text-slate-900 mb-1">{cleanerFirstName} still hasn&apos;t arrived?</p>
      {confirming ? (
        <>
          <p className="text-xs text-slate-600 mb-3">
            Your booking will be canceled. Our team will review it and email you about your refund.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleReport}
              disabled={working}
              className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 disabled:opacity-60"
            >
              {working ? 'Reporting…' : 'Report no-show'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={working}
              className="flex-1 py-2 rounded-lg text-sm font-medium text-slate-600 bg-white border border-slate-200"
            >
              Keep waiting
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-slate-600 mb-3">Try messaging them first. If they don&apos;t show, let us know.</p>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="w-full py-2 rounded-lg text-sm font-semibold text-red-600 bg-white border border-red-200"
          >
            My Tidy Pro didn&apos;t show up
          </button>
        </>
      )}
      {error && <p role="alert" className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  )
}
