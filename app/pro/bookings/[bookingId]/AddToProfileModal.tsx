'use client'

import { useState } from 'react'
import ModalShell from '@/app/components/ModalShell'
import { PORTFOLIO_MAX_ITEMS } from '@/lib/portfolioItems'
import { addPhotosToProfileAction } from './actions'

export type PhotoPair = { taskId: string; taskName: string; beforeUrl: string; afterUrl: string }

type Props = {
  bookingId: string
  pairs: PhotoPair[]
  // Finishes the job. Called after the chosen photos are added, or straight
  // away if they skip.
  onFinish: () => Promise<void>
  onClose: () => void
}

// Shown on "All Tasks Complete" when at least one task has both a before and
// an after photo.
export default function AddToProfileModal({ bookingId, pairs, onFinish, onClose }: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(pairs.map((p) => p.taskId)))
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle(taskId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  async function handleAdd() {
    setWorking(true)
    setError(null)
    const result = await addPhotosToProfileAction(bookingId, Array.from(selected))
    if ('error' in result) {
      setWorking(false)
      setError(result.error)
      return
    }
    await onFinish()
    setWorking(false)
  }

  async function handleSkip() {
    setWorking(true)
    setError(null)
    await onFinish()
    setWorking(false)
  }

  return (
    <ModalShell
      className="fixed inset-0 flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0"
      panelClassName="w-full max-w-sm bg-white rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
      onClose={onClose}
      labelledBy="add-to-profile-title"
      closeOnBackdrop={!working}
    >
      <h2 id="add-to-profile-title" className="text-lg font-bold text-slate-900 mb-1">
        Show off your work?
      </h2>
      <p className="text-sm text-slate-600 mb-4">
        Add your before and after photos to your profile so future customers can see what you can do. Choose the ones
        to share.
      </p>

      <fieldset className="flex flex-col gap-3 mb-4">
        <legend className="sr-only">Before and after photos to add to your profile</legend>
        {pairs.map((pair) => {
          const checked = selected.has(pair.taskId)
          return (
            <label
              key={pair.taskId}
              className={`block rounded-2xl border p-3 cursor-pointer transition-colors ${
                checked ? 'border-brand bg-[#f0fafa]' : 'border-slate-100 bg-white'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(pair.taskId)}
                  disabled={working}
                  className="w-4 h-4 accent-[var(--color-brand)]"
                />
                <span className="text-sm font-semibold text-slate-900">{pair.taskName}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Before', url: pair.beforeUrl },
                  { label: 'After', url: pair.afterUrl },
                ].map((photo) => (
                  <div key={photo.label} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt={`${pair.taskName} — ${photo.label.toLowerCase()}`} className="w-full aspect-square object-cover rounded-lg" />
                    <span className="absolute bottom-1 left-1 text-[10px] font-semibold text-white bg-black/60 rounded px-1.5 py-0.5">
                      {photo.label}
                    </span>
                  </div>
                ))}
              </div>
            </label>
          )
        })}
      </fieldset>

      <p className="text-xs text-slate-400 mb-4">
        Only the photos and task name are shown — never the customer&apos;s name or address. Your profile keeps your{' '}
        {PORTFOLIO_MAX_ITEMS} newest pairs, so older ones drop off as you add more. You can remove them any time from
        Profile → Cleaning photos.
      </p>

      {error && <p role="alert" className="text-xs text-red-600 mb-3">{error}</p>}

      <button
        type="button"
        onClick={handleAdd}
        disabled={working || selected.size === 0}
        className="w-full py-3 rounded-2xl text-sm font-semibold text-white bg-brand disabled:opacity-50 mb-2"
      >
        {working ? 'Finishing…' : `Add ${selected.size === 1 ? 'photo' : 'photos'} & finish`}
      </button>
      <button
        type="button"
        onClick={handleSkip}
        disabled={working}
        className="w-full py-2.5 text-sm font-medium text-slate-500 disabled:opacity-60"
      >
        Finish without adding
      </button>
    </ModalShell>
  )
}
