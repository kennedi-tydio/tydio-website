'use client'

import { useState } from 'react'
import ModalShell from '@/app/components/ModalShell'
import { PORTFOLIO_MAX_ITEMS, type BookingPhotoPair } from '@/lib/portfolioItems'
import { addPhotosToProfileAction } from './actions'

type Props = {
  bookingId: string
  pairs: BookingPhotoPair[]
  // Finishing the job: called after the chosen photos are added, or straight
  // away if they skip. Without it, they're adding photos after the job, and
  // onAdded is called once the photos are on their profile.
  onFinish?: () => Promise<void>
  onAdded?: () => void
  onClose: () => void
}

// Lets the Tidy Pro choose which of a booking's before/after pairs go on their
// profile. Shown on "All Tasks Complete" when the booking has any pairs, and
// from the past booking page.
export default function AddToProfileModal({ bookingId, pairs, onFinish, onAdded, onClose }: Props) {
  const finishing = onFinish != null
  // Pairs with only one possible before photo start ticked; with several, the
  // Tidy Pro checks which before photo matches first.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(pairs.filter((p) => !p.onProfile && p.befores.length === 1).map((p) => p.key))
  )
  const [beforeFor, setBeforeFor] = useState<Record<string, string>>(() =>
    Object.fromEntries(pairs.map((p) => [p.key, p.defaultBeforeId]))
  )
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Several after photos of one task or cleaning are numbered.
  const countByLabel = new Map<string, number>()
  for (const p of pairs) countByLabel.set(p.label, (countByLabel.get(p.label) ?? 0) + 1)
  const seenByLabel = new Map<string, number>()
  const titles = new Map(
    pairs.map((p) => {
      const n = (seenByLabel.get(p.label) ?? 0) + 1
      seenByLabel.set(p.label, n)
      return [p.key, countByLabel.get(p.label)! > 1 ? `${p.label} · ${n}` : p.label]
    })
  )

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function chooseBefore(key: string, beforeId: string) {
    setBeforeFor((prev) => ({ ...prev, [key]: beforeId }))
    // Picking a before photo means they want this pair.
    setSelected((prev) => new Set(prev).add(key))
  }

  async function handleAdd() {
    setWorking(true)
    setError(null)
    const choices = Array.from(selected).map((key) => ({ key, beforeId: beforeFor[key] }))
    const result = await addPhotosToProfileAction(bookingId, choices)
    if ('error' in result) {
      setWorking(false)
      setError(finishing ? `${result.error} Or finish without them.` : result.error)
      return
    }
    if (onFinish) await onFinish()
    else onAdded?.()
    setWorking(false)
  }

  async function handleSkip() {
    if (!onFinish) {
      onClose()
      return
    }
    setWorking(true)
    setError(null)
    await onFinish()
    setWorking(false)
  }

  const count = selected.size
  const addLabel = working
    ? finishing
      ? 'Finishing…'
      : 'Adding…'
    : `Add ${count === 0 ? '' : `${count} `}${count === 1 ? 'pair' : 'pairs'}${finishing ? ' & finish' : ' to profile'}`

  return (
    <ModalShell
      className="fixed inset-0 flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0"
      panelClassName="w-full max-w-sm bg-white rounded-2xl p-5 max-h-[90dvh] overflow-y-auto"
      onClose={onClose}
      labelledBy="add-to-profile-title"
      closeOnBackdrop={!working}
    >
      <h2 id="add-to-profile-title" className="text-lg font-bold text-slate-900 mb-1">
        Show off your work?
      </h2>
      <p className="text-sm text-slate-600 mb-4">
        Add your before and after photos to your profile so future customers can see what you can do. Choose the pairs
        to share.
      </p>

      <fieldset className="flex flex-col gap-3 mb-4">
        <legend className="sr-only">Before and after pairs to add to your profile</legend>
        {pairs.map((pair) => {
          const title = titles.get(pair.key)!
          const checked = selected.has(pair.key)
          const before = pair.befores.find((b) => b.id === beforeFor[pair.key]) ?? pair.befores[0]
          return (
            <div
              key={pair.key}
              className={`rounded-2xl border p-3 transition-colors ${
                checked ? 'border-brand bg-[#f0fafa]' : 'border-slate-100 bg-white'
              }`}
            >
              {pair.onProfile ? (
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-sm font-semibold text-slate-900">{title}</span>
                  <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
                    On your profile
                  </span>
                </div>
              ) : (
                <label className="flex items-center gap-2 mb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(pair.key)}
                    disabled={working}
                    className="w-4 h-4 accent-[var(--color-brand)]"
                  />
                  <span className="text-sm font-semibold text-slate-900">{title}</span>
                </label>
              )}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Before', url: before.url },
                  { label: 'After', url: pair.after.url },
                ].map((photo) => (
                  <div key={photo.label} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={`${title} — ${photo.label.toLowerCase()}`}
                      className="w-full aspect-square object-cover rounded-lg"
                    />
                    <span className="absolute bottom-1 left-1 text-[10px] font-semibold text-white bg-black/60 rounded px-1.5 py-0.5">
                      {photo.label}
                    </span>
                  </div>
                ))}
              </div>
              {!pair.onProfile && pair.befores.length > 1 && (
                <div className="mt-2">
                  <p id={`before-choice-${pair.key}`} className="text-xs text-slate-500 mb-1">
                    Which before photo matches?
                  </p>
                  <div role="radiogroup" aria-labelledby={`before-choice-${pair.key}`} className="flex gap-2">
                    {pair.befores.map((b, i) => {
                      const isChosen = b.id === before.id
                      return (
                        <button
                          key={b.id}
                          type="button"
                          role="radio"
                          aria-checked={isChosen}
                          aria-label={`Before photo ${i + 1}`}
                          onClick={() => chooseBefore(pair.key, b.id)}
                          disabled={working}
                          className={`w-12 h-12 rounded-lg overflow-hidden border-2 flex-shrink-0 ${
                            isChosen ? 'border-brand' : 'border-transparent opacity-70'
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={b.url} alt="" className="w-full h-full object-cover" />
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
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
        disabled={working || count === 0}
        className="w-full py-3 rounded-2xl text-sm font-semibold text-white bg-brand disabled:opacity-50 mb-2"
      >
        {addLabel}
      </button>
      <button
        type="button"
        onClick={handleSkip}
        disabled={working}
        className="w-full py-2.5 text-sm font-medium text-slate-500 disabled:opacity-60"
      >
        {finishing ? 'Finish without adding' : 'Not now'}
      </button>
    </ModalShell>
  )
}
