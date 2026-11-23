'use client'

import { useEffect, useRef, useState } from 'react'
import { PHOTO_REMOVE_FAILED_MESSAGE, PHOTO_UPLOAD_FAILED_MESSAGE, photoUploadForm } from '@/lib/photoUpload'
import { addCleaningPhotoAction, removeCleaningPhotoAction, type CleaningPhoto, type TaskPhotoKind } from './actions'

const MAX_PER_KIND = 10
const UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp'

// Before and after photos of a Standard / Deep Cleaning, up to 10 of each, of
// whole rooms or particular areas. At least one after photo is needed to finish
// the job; before photos are optional. Add-ons and Tidy Tasks have their own
// required after photo on the checklist.
export default function CleaningPhotos({
  bookingId,
  initialPhotos,
  wantsBeforePhotos,
  onAfterCountChange,
}: {
  bookingId: string
  initialPhotos: CleaningPhoto[]
  // They said yes to before photos on arrival: before photos are listed first.
  wantsBeforePhotos: boolean
  // How many after photos there are now (the job needs at least one).
  onAfterCountChange?: (count: number) => void
}) {
  const [photos, setPhotos] = useState<CleaningPhoto[]>(initialPhotos)
  // Keeps the task list's Cleaning Complete button in step with the after photos.
  const afterCount = photos.filter((p) => p.kind === 'after').length
  useEffect(() => {
    onAfterCountChange?.(afterCount)
  }, [afterCount, onAfterCountChange])
  const [busy, setBusy] = useState<TaskPhotoKind | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function upload(kind: TaskPhotoKind, files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    setBusy(kind)
    const room = MAX_PER_KIND - photos.filter((p) => p.kind === kind).length
    const chosen = Array.from(files).slice(0, Math.max(0, room))
    if (files.length > room) setError(`Only ${MAX_PER_KIND} ${kind} photos fit, so ${files.length - room} weren’t added.`)
    for (const file of chosen) {
      let result: Awaited<ReturnType<typeof addCleaningPhotoAction>>
      try {
        const form = await photoUploadForm(file)
        result = 'error' in form ? form : await addCleaningPhotoAction(bookingId, kind, form)
      } catch {
        // The request never reached the server (no signal, or it was refused).
        result = { error: PHOTO_UPLOAD_FAILED_MESSAGE }
      }
      if ('error' in result) {
        setError(result.error)
        break
      }
      setPhotos((prev) => [...prev, result.photo])
    }
    setBusy(null)
  }

  async function remove(photo: CleaningPhoto) {
    setError(null)
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id))
    const result = await removeCleaningPhotoAction(bookingId, photo.id).catch(() => ({ error: PHOTO_REMOVE_FAILED_MESSAGE }))
    if ('error' in result) {
      setError(result.error)
      setPhotos((prev) => [...prev, photo])
    }
  }

  const kinds: TaskPhotoKind[] = wantsBeforePhotos ? ['before', 'after'] : ['after', 'before']

  return (
    <div className="rounded-2xl border border-slate-100 px-4 py-3 mb-5">
      <p className="text-sm font-bold text-slate-900">Photos of the cleaning</p>
      <p className="text-xs text-slate-500 mb-3">
        Of whole rooms or particular areas. At least 1 after photo is required, up to {MAX_PER_KIND}. Before photos are
        optional, up to {MAX_PER_KIND}.
      </p>
      <div className="flex flex-col gap-4">
        {kinds.map((kind) => (
          <PhotoGroup
            key={kind}
            kind={kind}
            photos={photos.filter((p) => p.kind === kind)}
            busy={busy === kind}
            disabled={busy != null}
            onFiles={(files) => void upload(kind, files)}
            onRemove={(p) => void remove(p)}
          />
        ))}
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-600 mt-3">
          {error}
        </p>
      )}
    </div>
  )
}

function PhotoGroup({
  kind,
  photos,
  busy,
  disabled,
  onFiles,
  onRemove,
}: {
  kind: TaskPhotoKind
  photos: CleaningPhoto[]
  busy: boolean
  disabled: boolean
  onFiles: (files: FileList | null) => void
  onRemove: (photo: CleaningPhoto) => void
}) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const label = kind === 'before' ? 'Before' : 'After'
  const full = photos.length >= MAX_PER_KIND

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-slate-800">
          {label}
          <span className="font-normal text-slate-400">{kind === 'after' ? ' · required' : ' · optional'}</span>
        </p>
        <p className="text-xs text-slate-400 tabular-nums">
          {photos.length}/{MAX_PER_KIND}
        </p>
      </div>
      {photos.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-2">
          {photos.map((p) => (
            <div key={p.id} className="relative aspect-square rounded-lg overflow-hidden bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.photoUrl} alt={`${label} photo`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => onRemove(p)}
                aria-label={`Remove this ${kind} photo`}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center"
              >
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
      {!full && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => cameraRef.current?.click()}
            className="flex-1 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 disabled:opacity-50"
          >
            {busy ? 'Uploading…' : `Take ${kind} photo`}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => uploadRef.current?.click()}
            className="flex-1 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 disabled:opacity-50"
          >
            Upload
          </button>
        </div>
      )}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          onFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={uploadRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          onFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
