'use client'

import { useEffect, useRef, useState } from 'react'
import { PORTFOLIO_CAPTION_MAX_LENGTH, PORTFOLIO_MAX_ITEMS, type PortfolioItem } from '@/lib/portfolioItems'
import { prepareImage } from '@/lib/prepareImage'
import PortfolioPhotos from '@/app/components/PortfolioPhotos'
import { removePortfolioItemsAction, uploadPortfolioPhotoAction } from '../portfolio/actions'

// Server actions accept up to 11MB per request (next.config.ts). Photos are
// shrunk first, so a pair is normally well under this.
const MAX_REQUEST_BYTES = 10.5 * 1024 * 1024

function IconX() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M4 12L12 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

function PhotoPicker({
  id,
  label,
  hint,
  file,
  onChange,
  disabled,
}: {
  id: string
  label: string
  hint: string
  file: File | null
  onChange: (file: File | null) => void
  disabled: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  function choose(next: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(next ? URL.createObjectURL(next) : null)
    onChange(next)
    if (!next && inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="flex-1 min-w-0">
      <label htmlFor={id} className="block text-xs font-semibold text-slate-700 mb-1">
        {label}
      </label>
      <div className="relative aspect-square rounded-xl border border-dashed border-slate-300 bg-slate-50 overflow-hidden">
        {file && previewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt={`${label} preview`} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => choose(null)}
              disabled={disabled}
              className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded-full bg-black/60 text-white"
              aria-label={`Clear ${label.toLowerCase()} photo`}
            >
              <IconX />
            </button>
          </>
        ) : (
          <span className="absolute inset-0 flex items-center justify-center px-2 text-center text-xs text-slate-500">
            {hint}
          </span>
        )}
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept="image/*"
          disabled={disabled}
          onChange={(e) => choose(e.target.files?.[0] ?? null)}
          className={file ? 'sr-only' : 'absolute inset-0 opacity-0 cursor-pointer'}
        />
      </div>
    </div>
  )
}

// Lets the Edit Profile page's Save button add a pair that's been picked but
// not yet added. Resolves false when that pair couldn't be added (the reason
// shows in the form), so the page can hold off on saving.
export type SavePendingPhotos = { current: (() => Promise<boolean>) | null }

function UploadForm({
  onAdded,
  atLimit,
  hasItems,
  saveRef,
}: {
  onAdded: (item: PortfolioItem) => void
  atLimit: boolean
  hasItems: boolean
  saveRef?: SavePendingPhotos
}) {
  const [open, setOpen] = useState(false)
  const [before, setBefore] = useState<File | null>(null)
  const [after, setAfter] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Remounts the pickers to clear them after an upload.
  const [formKey, setFormKey] = useState(0)

  function reset() {
    setBefore(null)
    setAfter(null)
    setCaption('')
    setError(null)
    setFormKey((k) => k + 1)
  }

  // Not a <form>: this sits inside the Edit Profile page, whose own Save
  // button saves the profile fields, and Enter in the caption shouldn't
  // trigger either one.
  async function handleUpload(): Promise<boolean> {
    if (!before) return fail('Choose a before photo.')
    if (!after) return fail('Choose an after photo of the finished work.')
    if (!caption.trim()) return fail('Add a short caption, like “Kitchen deep clean”.')

    setUploading(true)
    setError(null)
    const body = new FormData()
    const [preparedBefore, preparedAfter] = await Promise.all([prepareImage(before), prepareImage(after)])
    if (preparedBefore.size + preparedAfter.size > MAX_REQUEST_BYTES) {
      setUploading(false)
      return fail('These photos are too large to upload. Try smaller photos.')
    }
    body.append('before', preparedBefore)
    body.append('after', preparedAfter)
    body.append('caption', caption)

    let result: Awaited<ReturnType<typeof uploadPortfolioPhotoAction>>
    try {
      result = await uploadPortfolioPhotoAction(body)
    } catch {
      result = { error: 'Upload failed — please try again.' }
    }
    setUploading(false)
    if ('error' in result) return fail(result.error)
    onAdded(result.item)
    reset()
    setOpen(false)
    return true
  }

  function fail(message: string): false {
    setError(message)
    return false
  }

  // The page's Save: add whatever pair is in progress. An untouched form just
  // closes; a half-filled one stops the save so the photos aren't lost.
  async function savePending(): Promise<boolean> {
    if (!open) return true
    if (uploading) return false
    if (!before && !after && !caption.trim()) {
      reset()
      setOpen(false)
      return true
    }
    return handleUpload()
  }

  useEffect(() => {
    if (!saveRef) return
    saveRef.current = savePending
    return () => {
      saveRef.current = null
    }
  })

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full py-3 rounded-xl border border-dashed border-slate-300 text-sm font-semibold text-brand mb-3"
      >
        {hasItems ? '+ Add more before & after photos' : '+ Add before & after photos'}
      </button>
    )
  }

  return (
    <div role="group" aria-label="Add before and after photos" className="rounded-xl border border-slate-200 p-4 mb-3">
      <div key={formKey} className="flex gap-3 mb-3">
        <PhotoPicker
          id="cleaning-photo-before"
          label="Before"
          hint="Tap to add a before photo"
          file={before}
          onChange={setBefore}
          disabled={uploading}
        />
        <PhotoPicker
          id="cleaning-photo-after"
          label="After"
          hint="Tap to add an after photo"
          file={after}
          onChange={setAfter}
          disabled={uploading}
        />
      </div>

      <label htmlFor="cleaning-photo-caption" className="block text-xs font-semibold text-slate-700 mb-1">
        Caption
      </label>
      <input
        id="cleaning-photo-caption"
        type="text"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (!uploading) handleUpload()
          }
        }}
        maxLength={PORTFOLIO_CAPTION_MAX_LENGTH}
        placeholder="e.g. Kitchen deep clean"
        disabled={uploading}
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 mb-3 focus:outline-none focus:border-brand"
      />

      <p className="text-xs text-slate-500 mb-3">
        Only upload photos of your own work. Leave out people, mail, house numbers, and anything else that could
        identify a home or its owner.
        {atLimit && ` You have ${PORTFOLIO_MAX_ITEMS} pairs, so adding this one removes your oldest.`}
      </p>

      {error && <p role="alert" className="text-xs text-red-600 mb-3">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => {
            reset()
            setOpen(false)
          }}
          disabled={uploading}
          className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleUpload}
          disabled={uploading}
          className="flex-1 py-2.5 rounded-xl text-white font-semibold text-sm bg-brand disabled:opacity-60"
        >
          {uploading ? 'Uploading…' : 'Add to profile'}
        </button>
      </div>
    </div>
  )
}

// The Tidy Pro's before/after pairs on the Edit Profile page: add a pair from
// their device, tap the X on a pair to take it off their profile, or use
// "Select photos to remove" to tick several and remove them at once. Pairs
// they add when finishing a booking land here too. Only the newest
// PORTFOLIO_MAX_ITEMS are kept; the server drops the oldest past that.
export default function CleaningPhotosSection({
  initialItems,
  saveRef,
}: {
  initialItems: PortfolioItem[]
  saveRef?: SavePendingPhotos
}) {
  const [items, setItems] = useState(initialItems)
  const [removingIds, setRemovingIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  // Select mode: tick several pairs and remove them together.
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const removing = removingIds.length > 0

  async function remove(ids: string[], question: string) {
    if (ids.length === 0 || !window.confirm(question)) return
    setRemovingIds(ids)
    setError(null)
    const result = await removePortfolioItemsAction(ids)
    setRemovingIds([])
    if ('error' in result) {
      setError(result.error)
      return
    }
    setItems((prev) => prev.filter((i) => !ids.includes(i.id)))
    setSelected([])
    setSelecting(false)
  }

  function handleRemove(item: PortfolioItem) {
    return remove([item.id], `Remove the “${item.taskName}” before & after photos from your profile?`)
  }

  function handleRemoveSelected() {
    const n = selected.length
    return remove(
      selected,
      n === 1
        ? 'Remove the selected before & after photos from your profile?'
        : `Remove these ${n} before & after photo pairs from your profile?`
    )
  }

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  function stopSelecting() {
    setSelecting(false)
    setSelected([])
  }

  const allSelected = items.length > 0 && selected.length === items.length

  return (
    <section id="cleaning-photos" aria-labelledby="cleaning-photos-heading" className="mb-6 scroll-mt-6">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h2 id="cleaning-photos-heading" className="text-sm font-bold text-slate-900">
          Cleaning Photos
        </h2>
        <span className="text-xs text-slate-400">
          {items.length}/{PORTFOLIO_MAX_ITEMS}
        </span>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Show customers your work with before and after photos. Add one before and one after photo for each cleaning,
        up to {PORTFOLIO_MAX_ITEMS}. Pairs you add from your bookings show up here too, and your oldest pairs drop off
        as you add new ones.
      </p>

      <UploadForm
        saveRef={saveRef}
        hasItems={items.length > 0}
        atLimit={items.length >= PORTFOLIO_MAX_ITEMS}
        onAdded={(item) => setItems((prev) => [item, ...prev].slice(0, PORTFOLIO_MAX_ITEMS))}
      />

      {error && <p role="alert" className="text-xs text-red-600 mb-3">{error}</p>}

      {items.length > 1 && (
        <div className="flex items-center justify-between gap-3 mb-2">
          {selecting ? (
            <>
              <button
                type="button"
                onClick={() => setSelected(allSelected ? [] : items.map((i) => i.id))}
                disabled={removing}
                className="text-xs font-semibold text-brand"
              >
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
              <div className="flex items-center gap-3">
                <button type="button" onClick={stopSelecting} disabled={removing} className="text-xs font-semibold text-slate-600">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRemoveSelected}
                  disabled={removing || selected.length === 0}
                  className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold disabled:opacity-50"
                >
                  {removing ? 'Removing…' : `Remove${selected.length > 0 ? ` (${selected.length})` : ''}`}
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setSelecting(true)}
              disabled={removing}
              className="ml-auto text-xs font-semibold text-brand"
            >
              Select photos to remove
            </button>
          )}
        </div>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((item) => {
            const isSelected = selected.includes(item.id)
            return (
              <li key={item.id} className={removingIds.includes(item.id) ? 'opacity-50' : undefined}>
                {selecting ? (
                  <label className="block cursor-pointer">
                    <div className={`relative rounded-xl ${isSelected ? 'ring-2 ring-brand ring-offset-2' : ''}`}>
                      <PortfolioPhotos item={item} />
                      <span className="absolute top-1.5 left-1.5 flex items-center justify-center w-7 h-7 rounded-full bg-white/90">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggle(item.id)}
                          disabled={removing}
                          aria-label={`Select ${item.taskName} photos`}
                          className="w-5 h-5"
                        />
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 truncate">{item.taskName}</p>
                  </label>
                ) : (
                  <>
                    <div className="relative">
                      <PortfolioPhotos item={item} />
                      <button
                        type="button"
                        onClick={() => handleRemove(item)}
                        disabled={removing}
                        aria-label={`Remove ${item.taskName} photos from your profile`}
                        className="absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-600 disabled:opacity-60"
                      >
                        <IconX />
                      </button>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 truncate">{item.taskName}</p>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
