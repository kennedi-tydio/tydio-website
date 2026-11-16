'use client'

import { useId, useState } from 'react'
import ModalShell from '@/app/components/ModalShell'
import { findReportChoice, reportNeedsDetails, type ReportCategory } from '@/lib/reportCategories'

type SubmitResult = { success: true } | { error: string }

// The bottom sheet for reporting a booking: pick a category, then the reason within it,
// then add an optional note ("Something else" asks them to describe what happened).
// Customers use it to report their Tidy Pro; Tidy Pros use it to report the customer.
export default function ReportSheet({
  title,
  categories,
  onSubmit,
  onClose,
}: {
  title: string
  categories: readonly ReportCategory[]
  onSubmit: (categoryId: string, reasonId: string | null, details: string) => Promise<SubmitResult>
  onClose: () => void
}) {
  const ids = useId()
  const [categoryId, setCategoryId] = useState('')
  const [reasonId, setReasonId] = useState<string | null>(null)
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const category = categories.find((c) => c.id === categoryId) ?? null
  const choice = findReportChoice(categories, categoryId, reasonId)
  const detailsRequired = choice != null && reportNeedsDetails(choice)
  const canSubmit = choice != null && (!detailsRequired || details.trim() !== '')

  function chooseCategory(id: string) {
    setCategoryId(id)
    setReasonId(null)
    setError(null)
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    const result = await onSubmit(categoryId, reasonId, details)
    setSubmitting(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setSubmitted(true)
  }

  const titleId = `${ids}-title`

  return (
    <ModalShell
      className="fixed inset-0 z-50 flex items-end justify-center"
      panelClassName="w-full max-w-sm max-h-[90vh] overflow-y-auto bg-white rounded-t-3xl px-6 pt-6 pb-10 shadow-2xl"
      onClose={onClose}
      labelledBy={titleId}
    >
      {submitted ? (
        <>
          <h2 id={titleId} className="font-bold text-slate-900 text-lg mb-1">Report submitted</h2>
          <p className="text-sm text-slate-500 mb-6">Thanks for letting us know — our team will look into it.</p>
          <button onClick={onClose} className="w-full py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm">
            Close
          </button>
        </>
      ) : (
        <>
          <h2 id={titleId} className="font-bold text-slate-900 text-lg mb-1">{title}</h2>
          <p className="text-sm text-slate-500 mb-4">Tell us what happened. Our team will follow up.</p>

          <label htmlFor={`${ids}-category`} className="block text-xs font-semibold text-slate-700 mb-1.5">
            What is this about?
          </label>
          <select
            id={`${ids}-category`}
            value={categoryId}
            onChange={(e) => chooseCategory(e.target.value)}
            autoFocus
            className={`w-full px-3 py-2.5 mb-4 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-brand ${category ? 'text-slate-800' : 'text-slate-400'}`}
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

          {category && category.reasons.length > 0 && (
            <fieldset className="mb-4">
              <legend className="block text-xs font-semibold text-slate-700 mb-1.5">What happened?</legend>
              <div className="flex flex-col gap-2">
                {category.reasons.map((r) => {
                  const selected = r.id === reasonId
                  return (
                    <label
                      key={r.id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm cursor-pointer ${selected ? 'border-brand bg-slate-50 text-slate-900' : 'border-slate-200 text-slate-700'}`}
                    >
                      <input
                        type="radio"
                        name={`${ids}-reason`}
                        value={r.id}
                        checked={selected}
                        onChange={() => setReasonId(r.id)}
                        className="accent-[var(--color-brand)]"
                      />
                      {r.label}
                    </label>
                  )
                })}
              </div>
            </fieldset>
          )}

          {choice && (
            <>
              <label htmlFor={`${ids}-details`} className="block text-xs font-semibold text-slate-700 mb-1.5">
                {detailsRequired ? 'Describe what happened' : 'Add a note (optional)'}
              </label>
              <textarea
                id={`${ids}-details`}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder={detailsRequired ? 'Tell us what happened…' : 'Anything else we should know?'}
                rows={4}
                maxLength={2000}
                required={detailsRequired}
                className="w-full px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 rounded-xl border border-slate-200 focus:outline-none focus:border-brand resize-none mb-4"
              />
            </>
          )}

          {error && <p role="alert" className="text-xs text-red-600 mb-4">{error}</p>}
          <div className="flex flex-col gap-3">
            <button
              onClick={handleSubmit}
              disabled={submitting || !canSubmit}
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
