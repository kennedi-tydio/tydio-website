'use client'

import { useState } from 'react'
import { useRouter } from '@/app/components/NavigationSpinner'
import { deleteReportAction } from '../../actions'

// For a report the admin found invalid. Asks once before deleting, since it can't be undone.
export function DeleteReportButton({ reportId, label }: { reportId: string; label: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setWorking(true)
    setError(null)
    const result = await deleteReportAction(reportId)
    setWorking(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setConfirming(false)
    router.refresh()
  }

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} aria-label={`Delete ${label}`} className="mt-2 text-xs font-semibold text-red-600 hover:underline">
        Delete
      </button>
    )
  }

  return (
    <div className="mt-2 rounded-lg border border-red-100 bg-red-50 px-2.5 py-2 text-xs">
      <p className="text-slate-700 mb-1.5">Delete this report for good? It will no longer count against them.</p>
      {error && (
        <p role="alert" className="text-red-600 mb-1.5">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={handleDelete} disabled={working} className="px-2.5 py-1 rounded-md bg-red-600 text-white font-semibold disabled:opacity-60">
          {working ? 'Deleting…' : 'Delete'}
        </button>
        <button type="button" onClick={() => setConfirming(false)} disabled={working} className="px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-600">
          Keep
        </button>
      </div>
    </div>
  )
}
