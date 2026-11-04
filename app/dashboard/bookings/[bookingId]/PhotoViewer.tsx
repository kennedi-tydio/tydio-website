'use client'

import { useEffect, useState } from 'react'

export type TaskPhoto = { url: string; category: string; taskName: string }

function IconChevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1a2332" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d={direction === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
    </svg>
  )
}

function IconClose() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path d="M4 4l8 8M4 12L12 4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

// Full-screen look at the photos the Tidy Pro took as they finished each task,
// with arrows to step through the rest.
export default function PhotoViewer({
  photos,
  startIndex,
  onClose,
}: {
  photos: TaskPhoto[]
  startIndex: number
  onClose: () => void
}) {
  const [index, setIndex] = useState(startIndex)
  const photo = photos[index]
  const hasPrev = index > 0
  const hasNext = index < photos.length - 1

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(photos.length - 1, i + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, photos.length])

  if (!photo) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${photo.category}: ${photo.taskName}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-white/60 backdrop-blur-sm px-2"
      onClick={onClose}
    >
      <div className="flex items-center gap-2 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setIndex((i) => i - 1)}
          disabled={!hasPrev}
          aria-label="Previous photo"
          className="w-8 h-8 flex-shrink-0 flex items-center justify-center disabled:invisible"
        >
          <IconChevron direction="left" />
        </button>

        <div className="flex-1 min-w-0 rounded-xl overflow-hidden bg-white shadow-xl">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt={photo.taskName} className="w-full aspect-[4/3.9] object-cover" />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white flex items-center justify-center shadow"
            >
              <IconClose />
            </button>
          </div>
          <div className="px-4 py-3">
            <p className="text-sm font-bold text-slate-900">{photo.category}</p>
            <p className="text-xs text-slate-700">{photo.taskName}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIndex((i) => i + 1)}
          disabled={!hasNext}
          aria-label="Next photo"
          className="w-8 h-8 flex-shrink-0 flex items-center justify-center disabled:invisible"
        >
          <IconChevron direction="right" />
        </button>
      </div>
    </div>
  )
}
