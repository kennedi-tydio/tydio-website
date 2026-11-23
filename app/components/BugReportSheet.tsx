'use client'

import { useId, useState } from 'react'
import ModalShell from '@/app/components/ModalShell'
import { submitBugReportAction } from '@/app/actions/bugReport'
import { BUG_REPORT_DETAILS_MAX_LENGTH, bugReportCategoriesFor, type BugReportRole } from '@/lib/bugReportCategories'

// Profile → Report a bug, for customers and Tidy Pros. A category and a description
// are both required; the report is emailed to the Tydio team.
export default function BugReportSheet({ role, onClose }: { role: BugReportRole; onClose: () => void }) {
  const ids = useId()
  const categories = bugReportCategoriesFor(role)
  const [categoryId, setCategoryId] = useState('')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const canSubmit = categoryId !== '' && details.trim() !== ''
  const titleId = `${ids}-title`

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    const result = await submitBugReportAction({ categoryId, details, page: window.location.pathname })
    setSubmitting(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setSubmitted(true)
  }

  return (
    <ModalShell
      className="fixed inset-0 z-50 flex items-end justify-center"
      panelClassName="w-full max-w-sm max-h-[90dvh] overflow-y-auto bg-white rounded-t-3xl px-6 pt-6 pb-10 shadow-2xl"
      onClose={onClose}
      labelledBy={titleId}
    >
      {submitted ? (
        <>
          <h2 id={titleId} className="font-bold text-slate-900 text-lg mb-1">Bug reported</h2>
          <p className="text-sm text-slate-500 mb-6">Thanks for letting us know — our team will look into it.</p>
          <button onClick={onClose} className="w-full py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm">
            Close
          </button>
        </>
      ) : (
        <>
          <h2 id={titleId} className="font-bold text-slate-900 text-lg mb-1">Report a bug</h2>
          <p className="text-sm text-slate-500 mb-4">Something not working right? Tell us and we’ll fix it.</p>

          <label htmlFor={`${ids}-category`} className="block text-xs font-semibold text-slate-700 mb-1.5">
            What is this about?
          </label>
          <select
            id={`${ids}-category`}
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value)
              setError(null)
            }}
            autoFocus
            required
            className={`w-full px-3 py-2.5 mb-4 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-brand ${categoryId ? 'text-slate-800' : 'text-slate-400'}`}
          >
            <option value="" disabled>
              Choose a category
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id} className="text-slate-800">
                {c.label}
              </option>
            ))}
          </select>

          <label htmlFor={`${ids}-details`} className="block text-xs font-semibold text-slate-700 mb-1.5">
            What went wrong?
          </label>
          <textarea
            id={`${ids}-details`}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="What were you trying to do, and what happened instead?"
            rows={5}
            maxLength={BUG_REPORT_DETAILS_MAX_LENGTH}
            required
            className="w-full px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 rounded-xl border border-slate-200 focus:outline-none focus:border-brand resize-none mb-4"
          />

          {error && <p role="alert" className="text-xs text-red-600 mb-4">{error}</p>}
          <div className="flex flex-col gap-3">
            <button
              onClick={handleSubmit}
              disabled={submitting || !canSubmit}
              className="w-full py-3 rounded-xl bg-brand text-white font-semibold text-sm disabled:opacity-50"
            >
              {submitting ? 'Sending…' : 'Submit'}
            </button>
            <button
              onClick={onClose}
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </ModalShell>
  )
}
