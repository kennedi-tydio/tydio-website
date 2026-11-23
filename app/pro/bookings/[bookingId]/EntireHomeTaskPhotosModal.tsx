'use client'

import { useEffect, useRef, useState } from 'react'
import ModalShell from '@/app/components/ModalShell'
import { MAX_ENTIRE_HOME_TASK_PHOTOS } from '@/lib/entireHome'
import { PHOTO_REMOVE_FAILED_MESSAGE, PHOTO_UPLOAD_FAILED_MESSAGE, photoUploadForm } from '@/lib/photoUpload'
import { addEntireHomeTaskPhotoAction, removeEntireHomeTaskPhotoAction, type TaskPhoto, type TaskPhotoKind } from './actions'

const UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp'

// An Entire home task (baseboards, windows, floors throughout) can't be shown
// in one photo: up to 3 before and 3 after. At least 1 after photo marks it
// complete; before photos are optional and fixed once it's done.
export default function EntireHomeTaskPhotosModal({
  bookingId,
  taskId,
  taskName,
  initialPhotos,
  // Listed first: the kind they tapped.
  focusKind,
  onChange,
  onClose,
}: {
  bookingId: string
  taskId: string
  taskName: string
  initialPhotos: TaskPhoto[]
  focusKind: TaskPhotoKind
  // This task's photos now, after each add or remove.
  onChange: (photos: TaskPhoto[]) => void
  onClose: () => void
}) {
  const [photos, setPhotos] = useState<TaskPhoto[]>(initialPhotos)
  const [busy, setBusy] = useState<TaskPhotoKind | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Keeps the task list (ticks, counts, the Complete button) in step.
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    onChange(photos)
  }, [photos, onChange])

  const afterCount = photos.filter((p) => p.kind === 'after').length
  // Before photos are fixed once the task is done (it has an after photo).
  const beforeLocked = afterCount > 0

  async function upload(kind: TaskPhotoKind, files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    setBusy(kind)
    const room = MAX_ENTIRE_HOME_TASK_PHOTOS - photos.filter((p) => p.kind === kind).length
    const chosen = Array.from(files).slice(0, Math.max(0, room))
    if (files.length > room) {
      setError(`Only ${MAX_ENTIRE_HOME_TASK_PHOTOS} ${kind} photos fit, so ${files.length - room} weren’t added.`)
    }
    for (const file of chosen) {
      let result: Awaited<ReturnType<typeof addEntireHomeTaskPhotoAction>>
      try {
        const form = await photoUploadForm(file)
        result = 'error' in form ? form : await addEntireHomeTaskPhotoAction(bookingId, taskId, kind, form)
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

  async function remove(photo: TaskPhoto) {
    setError(null)
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id))
    const result = await removeEntireHomeTaskPhotoAction(bookingId, taskId, photo.id).catch(() => ({ error: PHOTO_REMOVE_FAILED_MESSAGE }))
    if ('error' in result) {
      setError(result.error)
      setPhotos((prev) => [...prev, photo])
    }
  }

  const kinds: TaskPhotoKind[] = focusKind === 'before' ? ['before', 'after'] : ['after', 'before']

  return (
    <ModalShell
      className="fixed inset-0 flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0"
      panelClassName="w-full max-w-sm bg-white rounded-2xl p-5 max-h-[90dvh] overflow-y-auto"
      onClose={onClose}
      labelledBy="entire-home-photos-title"
      closeOnBackdrop={false}
    >
      <div className="flex items-center justify-between mb-1">
        <h2 id="entire-home-photos-title" className="text-lg font-bold text-slate-900">
          Photos
        </h2>
        <button type="button" onClick={onClose} aria-label="Close" className="w-7 h-7 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M4 12L12 4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        &quot;{taskName}&quot; covers the whole home, so show it in up to {MAX_ENTIRE_HOME_TASK_PHOTOS} photos. At least 1
        after photo is required to mark it complete; before photos are optional.
      </p>

      <div className="flex flex-col gap-4">
        {kinds.map((kind) => (
          <PhotoGroup
            key={kind}
            kind={kind}
            taskName={taskName}
            photos={photos.filter((p) => p.kind === kind)}
            busy={busy === kind}
            disabled={busy != null}
            locked={kind === 'before' && beforeLocked}
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

      <button
        type="button"
        onClick={onClose}
        disabled={busy != null}
        className="w-full mt-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
        style={{ backgroundColor: 'var(--color-brand)' }}
      >
        {busy ? 'Uploading…' : 'Done'}
      </button>
    </ModalShell>
  )
}

function PhotoGroup({
  kind,
  taskName,
  photos,
  busy,
  disabled,
  locked,
  onFiles,
  onRemove,
}: {
  kind: TaskPhotoKind
  taskName: string
  photos: TaskPhoto[]
  busy: boolean
  disabled: boolean
  // No adding or removing (before photos once the task is done).
  locked: boolean
  onFiles: (files: FileList | null) => void
  onRemove: (photo: TaskPhoto) => void
}) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const label = kind === 'before' ? 'Before' : 'After'
  const full = photos.length >= MAX_ENTIRE_HOME_TASK_PHOTOS

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-slate-800">
          {label}
          <span className="font-normal text-slate-400">{kind === 'after' ? ' · at least 1 required' : ' · optional'}</span>
        </p>
        <p className="text-xs text-slate-400 tabular-nums">
          {photos.length}/{MAX_ENTIRE_HOME_TASK_PHOTOS}
        </p>
      </div>
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-2">
          {photos.map((p, i) => (
            <div key={p.id} className="relative aspect-square rounded-lg overflow-hidden bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.photoUrl} alt={`${taskName}, ${kind} photo ${i + 1}`} className="w-full h-full object-cover" />
              {!locked && (
                <button
                  type="button"
                  onClick={() => onRemove(p)}
                  disabled={disabled}
                  aria-label={`Remove ${kind} photo ${i + 1}`}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center disabled:opacity-50"
                >
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {locked && photos.length === 0 && <p className="text-xs text-slate-400">Before photos are taken before the task is done.</p>}
      {!locked && !full && (
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
