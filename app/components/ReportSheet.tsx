'use client'

import { useEffect, useId, useState } from 'react'
import ModalShell from '@/app/components/ModalShell'
import { findReportChoice, reportNeedsDetails, type ReportCategory } from '@/lib/reportCategories'

type SubmitResult = { success: true } | { error: string }

// The bottom sheet for reporting a booking: pick a category, then the reason within it,
// then add an optional note ("Something else" asks them to describe what happened).
// Customers use it to report their Tidy Pro; Tidy Pros use it to report the customer.
//
// `waits` holds reasons that can't be reported until a set time (a no-show, 10 minutes
// after the start). Choosing one early shows a countdown and keeps Submit off until then.
export type ReportWait = { reasonId: string; availableAtMs: number; message: string }

// "Block" at the bottom of the sheet (lib/userBlocks). `label` names who's blocked
// ("Tidy Pro", "customer"); `consequence` says what blocking them stops.
export type ReportBlock = { label: string; consequence: string; onBlock: () => Promise<SubmitResult> }

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export default function ReportSheet({
  title,
  categories,
  onSubmit,
  onClose,
  waits = [],
  block,
}: {
  title: string
  categories: readonly ReportCategory[]
  onSubmit: (categoryId: string, reasonId: string | null, details: string) => Promise<SubmitResult>
  onClose: () => void
  waits?: ReportWait[]
  block?: ReportBlock
}) {
  const ids = useId()
  const [categoryId, setCategoryId] = useState('')
  const [reasonId, setReasonId] = useState<string | null>(null)
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [blockStep, setBlockStep] = useState<'none' | 'confirm' | 'done'>('none')

  const category = categories.find((c) => c.id === categoryId) ?? null
  const choice = findReportChoice(categories, categoryId, reasonId)
  const detailsRequired = choice != null && reportNeedsDetails(choice)

  const wait = waits.find((w) => w.reasonId === reasonId) ?? null
  const [now, setNow] = useState(() => Date.now())
  const waiting = wait != null && now < wait.availableAtMs
  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [waiting])

  const canSubmit = choice != null && !waiting && (!detailsRequired || details.trim() !== '')

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

  async function handleBlock() {
    if (!block) return
    setSubmitting(true)
    setError(null)
    const result = await block.onBlock()
    setSubmitting(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setBlockStep('done')
  }

  const titleId = `${ids}-title`

  return (
    <ModalShell
      className="fixed inset-0 z-50 flex items-end justify-center"
      panelClassName="w-full max-w-sm max-h-[90dvh] overflow-y-auto bg-white rounded-t-3xl px-6 pt-6 pb-10 shadow-2xl"
      onClose={onClose}
      labelledBy={titleId}
    >
      {block && blockStep === 'done' ? (
        <>
          <h2 id={titleId} className="font-bold text-slate-900 text-lg mb-1">{`${capitalize(block.label)} blocked`}</h2>
          <p className="text-sm text-slate-500 mb-6">{block.consequence}</p>
          <button onClick={onClose} className="w-full py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm">
            Close
          </button>
        </>
      ) : block && blockStep === 'confirm' ? (
        <>
          <h2 id={titleId} className="font-bold text-slate-900 text-lg mb-1">{`Block this ${block.label}?`}</h2>
          <p className="text-sm text-slate-500 mb-6">{block.consequence} Your current bookings with them aren’t changed.</p>
          {error && <p role="alert" className="text-xs text-red-600 mb-4">{error}</p>}
          <div className="flex flex-col gap-3">
            <button
              onClick={handleBlock}
              disabled={submitting}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-50"
              style={{ backgroundColor: '#ef4444' }}
            >
              {submitting ? 'Blocking…' : `Block ${block.label}`}
            </button>
            <button
              onClick={() => {
                setBlockStep('none')
                setError(null)
              }}
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </>
      ) : submitted ? (
        <>
          <h2 id={titleId} className="font-bold text-slate-900 text-lg mb-1">Report submitted</h2>
          <p className="text-sm text-slate-500 mb-6">Thanks for letting us know — our team will look into it.</p>
          <div className="flex flex-col gap-3">
            <button onClick={onClose} className="w-full py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm">
              Close
            </button>
            {block && <BlockLink label={block.label} onClick={() => setBlockStep('confirm')} />}
          </div>
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
                        onChange={() => {
                          setReasonId(r.id)
                          setNow(Date.now())
                        }}
                        className="accent-[var(--color-brand)]"
                      />
                      {r.label}
                    </label>
                  )
                })}
              </div>
            </fieldset>
          )}

          {waiting && wait && (
            <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-4">
              <p className="text-xs font-semibold text-amber-900">You can report this in</p>
              <p className="text-2xl font-bold text-amber-900 tabular-nums" aria-live="off">
                {formatCountdown(wait.availableAtMs - now)}
              </p>
              <p className="text-xs text-amber-800 mt-1 leading-relaxed">{wait.message}</p>
            </div>
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
            {block && (
              <BlockLink
                label={block.label}
                disabled={submitting}
                onClick={() => {
                  setBlockStep('confirm')
                  setError(null)
                }}
              />
            )}
          </div>
        </>
      )}
    </ModalShell>
  )
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function BlockLink({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <div className="border-t border-slate-100 pt-3 mt-1">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="w-full py-2.5 flex items-center justify-center gap-2 text-sm font-semibold text-red-600 disabled:opacity-50"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M5.6 5.6l12.8 12.8" />
        </svg>
        {`Block ${label}`}
      </button>
    </div>
  )
}
