'use client'

import { useEffect, useRef, useState } from 'react'
import { submitTaskPhotoAction } from './actions'
import ModalShell from '@/app/components/ModalShell'

function IconX() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M4 4l8 8M4 12L12 4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function IconCamera() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

function IconUpload() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  )
}

// Listing the exact types (rather than image/*) makes iOS convert HEIC
// library photos to JPEG, which the server action accepts.
const UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp'

type Props = {
  bookingId: string
  taskId: string
  taskName: string
  existingPhotoUrl: string | null
  onClose: () => void
  onSubmitted: (photoUrl: string) => void
}

export default function PhotoCaptureModal({ bookingId, taskId, taskName, existingPhotoUrl, onClose, onSubmitted }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(existingPhotoUrl)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (file && previewUrl) URL.revokeObjectURL(previewUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0]
    // Clear the input so picking the same file again still fires onChange.
    e.target.value = ''
    if (!chosen) return
    if (file && previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(chosen)
    setPreviewUrl(URL.createObjectURL(chosen))
    setError(null)
  }

  async function handleSubmit() {
    if (!file) return
    setSubmitting(true)
    setError(null)
    const formData = new FormData()
    formData.set('photo', file)
    const result = await submitTaskPhotoAction(bookingId, taskId, formData)
    setSubmitting(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    onSubmitted(result.photoUrl)
  }

  const title = existingPhotoUrl && !file ? 'Review Photo' : 'Photo Confirmation'

  return (
    <ModalShell className="fixed inset-0 flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0" panelClassName="w-full max-w-sm bg-white rounded-2xl p-5" onClose={onClose} labelledBy="photo-capture-title" closeOnBackdrop={false}>
      <div className="flex items-center justify-between mb-1">
        <h2 id="photo-capture-title" className="text-lg font-bold text-slate-900">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="w-7 h-7 flex items-center justify-center">
          <IconX />
        </button>
      </div>
      <p className="text-xs text-slate-400 mb-4">Submit a photo to mark &quot;{taskName}&quot; as complete</p>

      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />
      <input ref={uploadInputRef} type="file" accept={UPLOAD_ACCEPT} onChange={handleFileChange} className="hidden" />

      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt={taskName} className="w-full aspect-square object-cover rounded-xl mb-4" />
      ) : (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="aspect-square rounded-xl bg-slate-100 flex flex-col items-center justify-center gap-2"
          >
            <span className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--color-brand)' }}>
              <IconCamera />
            </span>
            <span className="text-sm font-semibold text-slate-700">Take Photo</span>
          </button>
          <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            className="aspect-square rounded-xl bg-slate-100 flex flex-col items-center justify-center gap-2"
          >
            <span className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--color-brand)' }}>
              <IconUpload />
            </span>
            <span className="text-sm font-semibold text-slate-700">Upload Photo</span>
          </button>
        </div>
      )}

      {error && <p role="alert" className="text-xs text-red-600 mb-3">{error}</p>}

      {previewUrl && (
        <div className="grid grid-cols-2 gap-2 mb-2">
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600"
          >
            Retake
          </button>
          <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            className="py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600"
          >
            Upload
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!file || submitting}
        className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
        style={{ backgroundColor: 'var(--color-brand)' }}
      >
        {submitting ? 'Submitting…' : 'Submit'}
      </button>
    </ModalShell>
  )
}
