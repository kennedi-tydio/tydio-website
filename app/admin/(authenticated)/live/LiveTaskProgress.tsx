'use client'

import { useState } from 'react'
import PhotoViewer, { type TaskPhoto } from '@/app/dashboard/bookings/[bookingId]/PhotoViewer'
import { CategoryIcon, groupByCategory } from '@/app/dashboard/bookings/[bookingId]/BookingSummary'
import type { BookingTaskRow } from '@/app/dashboard/bookings/[bookingId]/CurrentBookingView'

// A task with its optional before photo as well as the after photo.
export type LiveTaskRow = BookingTaskRow & { before_photo_url?: string | null }
// A Standard / Deep Cleaning's photo of the whole cleaning.
export type LiveCleaningPhoto = { kind: string; url: string }

function IconCheck() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="flex-shrink-0" aria-hidden="true">
      <path d="M3 8.5l3.5 3.5L13 5" stroke="var(--color-slate-400)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Thumb({ url, label, onOpen }: { url: string; label: string; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} aria-label={`View photo: ${label}`} className="relative flex-shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="h-9 w-9 rounded-md object-cover" />
    </button>
  )
}

// A Live Board card's tasks, the way the customer sees them while the Tidy Pro works:
// grouped by room with a done count, finished tasks struck through, and the photos the
// Tidy Pro took (before, then after; click to see full size). Open by default while
// they're cleaning; click the summary to open or close it on any card.
export default function LiveTaskProgress({
  tasks,
  cleaningPhotos = [],
  defaultOpen,
}: {
  tasks: LiveTaskRow[]
  cleaningPhotos?: LiveCleaningPhoto[]
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [viewingPhoto, setViewingPhoto] = useState<number | null>(null)

  if (tasks.length === 0 && cleaningPhotos.length === 0) return <p className="mt-2 text-xs text-slate-400">No tasks on this booking.</p>

  const groups = groupByCategory(tasks)
  const photos: TaskPhoto[] = [
    ...cleaningPhotos.map((p) => ({ url: p.url, category: 'The cleaning', taskName: p.kind === 'before' ? 'Before' : 'After' })),
    ...groups.flatMap((g) =>
      g.tasks.flatMap((t) => {
        const row = t as LiveTaskRow
        const afterUrls = row.after_photo_urls?.length ? row.after_photo_urls : row.completion_photo_url ? [row.completion_photo_url] : []
        return [
          ...(row.before_photo_url ? [{ url: row.before_photo_url, category: g.category, taskName: `${row.task_name} (before)` }] : []),
          ...afterUrls.map((url) => ({ url, category: g.category, taskName: `${row.task_name} (after)` })),
        ]
      })
    ),
  ]
  const indexOf = (url: string) => photos.findIndex((p) => p.url === url)
  const doneCount = tasks.filter((t) => t.is_completed).length
  const cleaningBefore = cleaningPhotos.filter((p) => p.kind === 'before')
  const cleaningAfter = cleaningPhotos.filter((p) => p.kind === 'after')

  return (
    <div className="mt-2 border-t border-slate-100 pt-2">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between text-xs">
        <span className="font-semibold text-slate-700">Task progress</span>
        <span className="flex items-center gap-2">
          <span className="text-brand tabular-nums">
            {doneCount}/{tasks.length} done{photos.length > 0 ? ` · ${photos.length} photo${photos.length === 1 ? '' : 's'}` : ''}
          </span>
          <span className="text-slate-400">{open ? 'Hide' : 'Show'}</span>
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-2.5">
          {cleaningPhotos.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-800">Photos of the cleaning</p>
              {[
                { label: 'Before', list: cleaningBefore },
                { label: 'After', list: cleaningAfter },
              ].map(({ label, list }) =>
                list.length > 0 ? (
                  <div key={label} className="mt-1 flex flex-wrap items-center gap-1.5 pl-6">
                    <span className="w-10 text-[11px] text-slate-500">{label}</span>
                    {list.map((p, i) => (
                      <Thumb key={p.url} url={p.url} label={`${label} ${i + 1}`} onOpen={() => setViewingPhoto(indexOf(p.url))} />
                    ))}
                  </div>
                ) : null
              )}
            </div>
          )}
          {groups.map((group) => {
            const groupDone = group.tasks.filter((t) => t.is_completed).length
            return (
              <div key={group.category}>
                <p className="flex items-center justify-between text-xs font-semibold text-slate-800">
                  <span className="flex items-center gap-1.5">
                    <CategoryIcon category={group.category} />
                    {group.category}
                  </span>
                  <span className="font-normal text-brand tabular-nums">
                    {groupDone}/{group.tasks.length}
                  </span>
                </p>
                <ul className="mt-1 space-y-1 pl-6">
                  {group.tasks.map((t) => {
                    const task = t as LiveTaskRow
                    const afterUrls = task.after_photo_urls?.length ? task.after_photo_urls : task.completion_photo_url ? [task.completion_photo_url] : []
                    return (
                      <li key={task.id} className="flex items-center gap-2 text-xs">
                        {task.before_photo_url && (
                          <Thumb url={task.before_photo_url} label={`${task.task_name}, before`} onOpen={() => setViewingPhoto(indexOf(task.before_photo_url!))} />
                        )}
                        {afterUrls.map((url, i) => (
                          <Thumb key={url} url={url} label={`${task.task_name}, after${afterUrls.length > 1 ? ` ${i + 1}` : ''}`} onOpen={() => setViewingPhoto(indexOf(url))} />
                        ))}
                        {task.is_completed ? (
                          <span className="flex items-center gap-1 text-slate-400 line-through">
                            <IconCheck />
                            {task.task_name}
                          </span>
                        ) : (
                          <span className="text-slate-700">- {task.task_name}</span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      )}

      {viewingPhoto != null && viewingPhoto >= 0 && <PhotoViewer photos={photos} startIndex={viewingPhoto} onClose={() => setViewingPhoto(null)} />}
    </div>
  )
}
