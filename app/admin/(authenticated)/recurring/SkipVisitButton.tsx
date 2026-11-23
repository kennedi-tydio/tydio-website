'use client'

import { useState, useTransition } from 'react'
import { skipRecurringVisitAction } from '../../actions'

// Cancels a visit the series hasn't booked yet, so it's never booked or charged.
export default function SkipVisitButton({ seriesId, date, label }: { seriesId: string; date: string; label: string }) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ error?: string; message?: string }>({})

  if (result.message) return <span role="status" className="text-xs text-green-700">Canceled</span>

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Cancel the visit on ${label}? It hasn’t been booked or charged yet, so there’s nothing to refund. The customer and Tidy Pro are notified.`)) return
          startTransition(async () => setResult(await skipRecurringVisitAction(seriesId, date)))
        }}
        className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
      >
        {pending ? 'Canceling…' : 'Cancel visit'}
      </button>
      {result.error && <span role="alert" className="text-xs text-red-600 max-w-48 text-right">{result.error}</span>}
    </span>
  )
}
