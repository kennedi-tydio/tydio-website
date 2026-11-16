'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import {
  PORTFOLIO_CAPTION_MAX_LENGTH,
  PORTFOLIO_DISPLAY_LIMIT,
  PORTFOLIO_MAX_ITEMS,
  type PortfolioItem,
} from '@/lib/portfolioItems'
import { prepareImage } from '@/lib/prepareImage'
import PortfolioPhotos from '@/app/components/PortfolioPhotos'
import { removePortfolioItemAction, uploadPortfolioPhotoAction } from './actions'

// Server actions accept up to 11MB per request (next.config.ts). Photos are
// shrunk first, so a pair is normally well under this.
const MAX_REQUEST_BYTES = 10.5 * 1024 * 1024

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
              className="absolute top-1 right-1 text-[11px] font-semibold text-white bg-black/60 rounded px-1.5 py-0.5"
              aria-label={`Remove ${label.toLowerCase()}`}
            >
              Remove
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

function UploadForm({ onAdded, atLimit }: { onAdded: (item: PortfolioItem) => void; atLimit: boolean }) {
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!after) return setError('Choose a photo of the finished work.')
    if (!caption.trim()) return setError('Add a short caption, like “Kitchen deep clean”.')

    setUploading(true)
    setError(null)
    const body = new FormData()
    const preparedAfter = await prepareImage(after)
    const preparedBefore = before ? await prepareImage(before) : null
    if (preparedAfter.size + (preparedBefore?.size ?? 0) > MAX_REQUEST_BYTES) {
      setUploading(false)
      return setError('These photos are too large to upload. Try smaller photos.')
    }
    body.append('after', preparedAfter)
    if (preparedBefore) body.append('before', preparedBefore)
    body.append('caption', caption)

    let result: Awaited<ReturnType<typeof uploadPortfolioPhotoAction>>
    try {
      result = await uploadPortfolioPhotoAction(body)
    } catch {
      result = { error: 'Upload failed — please try again.' }
    }
    setUploading(false)
    if ('error' in result) return setError(result.error)
    onAdded(result.item)
    reset()
    setOpen(false)
  }

  if (atLimit) {
    return (
      <p className="text-xs text-slate-500 mb-6">
        You have {PORTFOLIO_MAX_ITEMS} work photos, the most you can add. Remove some to add new ones.
      </p>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full py-3 rounded-2xl text-white font-semibold text-sm mb-6 bg-brand"
      >
        Upload work photos
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-100 shadow-sm p-4 mb-6" aria-label="Upload work photos">
      <div key={formKey} className="flex gap-3 mb-3">
        <PhotoPicker
          id="portfolio-before"
          label="Before (optional)"
          hint="Tap to add a before photo"
          file={before}
          onChange={setBefore}
          disabled={uploading}
        />
        <PhotoPicker
          id="portfolio-after"
          label="After"
          hint="Tap to add a photo of the finished work"
          file={after}
          onChange={setAfter}
          disabled={uploading}
        />
      </div>

      <label htmlFor="portfolio-caption" className="block text-xs font-semibold text-slate-700 mb-1">
        Caption
      </label>
      <input
        id="portfolio-caption"
        type="text"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        maxLength={PORTFOLIO_CAPTION_MAX_LENGTH}
        placeholder="e.g. Kitchen deep clean"
        disabled={uploading}
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 mb-3"
      />

      <p className="text-xs text-slate-500 mb-3">
        Customers will see these on your profile. Only upload photos of your own work. Leave out people, mail,
        house numbers, and anything else that could identify a home or its owner.
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
          className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-700 font-semibold text-sm"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={uploading}
          className="flex-1 py-3 rounded-2xl text-white font-semibold text-sm bg-brand disabled:opacity-60"
        >
          {uploading ? 'Uploading…' : 'Add to profile'}
        </button>
      </div>
    </form>
  )
}

export default function PortfolioView({ initialItems }: { initialItems: PortfolioItem[] }) {
  const [items, setItems] = useState(initialItems)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleRemove(id: string) {
    setRemovingId(id)
    setError(null)
    const result = await removePortfolioItemAction(id)
    setRemovingId(null)
    setConfirmingId(null)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-10 pb-16 max-w-sm mx-auto w-full">
        <Link href="/pro/profile" className="flex items-center gap-1.5 mb-6 text-sm text-slate-500">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to Profile
        </Link>

        <h1 className="text-2xl font-bold text-slate-900 mb-2">My Work Photos</h1>
        <p className="text-sm text-slate-500 mb-6">
          Photos of your cleanings on your profile. Customers see your {PORTFOLIO_DISPLAY_LIMIT} most recent. Upload
          photos from your phone, or take a before photo when you arrive at a job and choose it when you finish.
        </p>

        <UploadForm
          atLimit={items.length >= PORTFOLIO_MAX_ITEMS}
          onAdded={(item) => setItems((prev) => [item, ...prev])}
        />

        {error && <p role="alert" className="text-xs text-red-600 mb-3">{error}</p>}

        {items.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-6 text-center">
            <p className="text-sm font-semibold text-slate-700">No work photos yet</p>
            <p className="text-xs text-slate-500 mt-1">
              Upload photos of cleanings you&apos;re proud of so customers can see your work.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {items.map((item) => (
              <li key={item.id} className="rounded-2xl border border-slate-100 shadow-sm p-3">
                <div className="mb-2">
                  <PortfolioPhotos item={item} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-700 truncate">{item.taskName}</p>
                  {confirmingId === item.id ? (
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        disabled={removingId === item.id}
                        className="text-xs font-semibold text-slate-500"
                      >
                        Keep
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemove(item.id)}
                        disabled={removingId === item.id}
                        className="text-xs font-semibold text-red-600 disabled:opacity-60"
                      >
                        {removingId === item.id ? 'Removing…' : 'Yes, remove'}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingId(item.id)}
                      className="text-xs font-semibold text-red-600 flex-shrink-0"
                      aria-label={`Remove ${item.taskName} photos from your profile`}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
