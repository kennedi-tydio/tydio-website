'use client'

import { useState } from 'react'
import { reportTidyProAction } from './actions'
import ModalShell from '@/app/components/ModalShell'

export default function ReportTidyProSheet({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    const result = await reportTidyProAction(bookingId, reason)
    setSubmitting(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setSubmitted(true)
  }

  return (
    <ModalShell className="fixed inset-0 z-50 flex items-end justify-center" panelClassName="w-full max-w-sm bg-white rounded-t-3xl px-6 pt-6 pb-10 shadow-2xl" onClose={onClose} labelledBy="report-title">
      {submitted ? (
        <>
          <h2 id="report-title" className="font-bold text-slate-900 text-lg mb-1">Report submitted</h2>
          <p className="text-sm text-slate-500 mb-6">Thanks for letting us know — our team will look into it.</p>
          <button onClick={onClose} className="w-full py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm">
            Close
          </button>
        </>
      ) : (
        <>
          <h2 id="report-title" className="font-bold text-slate-900 text-lg mb-1">Report Tidy Pro</h2>
          <p className="text-sm text-slate-500 mb-4">Tell us what happened. Our team will follow up.</p>
          <textarea
            aria-label="Describe the issue"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Describe the issue..."
            rows={4}
            autoFocus
            className="w-full px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 rounded-xl border border-slate-200 focus:outline-none focus:border-brand resize-none mb-4"
          />
          {error && <p role="alert" className="text-xs text-red-600 mb-4">{error}</p>}
          <div className="flex flex-col gap-3">
            <button
              onClick={handleSubmit}
              disabled={submitting || !reason.trim()}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-50"
              style={{ backgroundColor: '#ef4444' }}
            >
              {submitting ? 'Submitting…' : 'Submit report'}
            </button>
            <button onClick={onClose} disabled={submitting} className="w-full py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm disabled:opacity-50">
              Go back
            </button>
          </div>
        </>
      )}
    </ModalShell>
  )
}
