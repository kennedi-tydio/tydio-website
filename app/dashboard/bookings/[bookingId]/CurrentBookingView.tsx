'use client'

import { useRouter } from '@/app/components/NavigationSpinner'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import ProgressStepper from './ProgressStepper'
import ReportTidyProSheet from './ReportTidyProSheet'
import ReportNoShowButton from './ReportNoShowButton'
import ReviewForm from './ReviewForm'
import EmergencyButton from '@/app/components/EmergencyButton'
import PhotoViewer, { type TaskPhoto } from './PhotoViewer'
import { CategoryIcon, groupByCategory } from './BookingSummary'
import { cancelBookingRequestAction } from '@/app/dashboard/messages/[bookingId]/actions'

export type BookingTaskRow = {
  id: string
  task_name: string
  task_category: string
  is_completed: boolean
  completion_photo_url: string | null
}

type Props = {
  cardFeePercentage?: number
  // Set when canceling now would only refund this much (see isLateCancellation).
  lateCancelRefund?: number | null
  // When a no-show can be reported (see noShowReportableAt).
  noShowReportableAtMs?: number | null
  bookingId: string
  cleanerName: string
  cleanerPhotoUrl: string | null
  progressStatus: 'on_the_way' | 'arrived' | 'cleaning' | 'done'
  isDone: boolean
  tasks: BookingTaskRow[]
  totalPrice: number
  alreadyReviewed: boolean
  // Prefilled into the Text 911 message on the emergency sheet.
  addressLine?: string | null
}

const HEADLINE: Record<Props['progressStatus'], (firstName: string) => string> = {
  on_the_way: (firstName) => `${firstName} is on the way`,
  arrived: (firstName) => `${firstName} has arrived`,
  cleaning: (firstName) => `${firstName} is tidying up...`,
  done: (firstName) => `${firstName} is all done!`,
}

function IconBack() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  )
}

function IconClose() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1a2332" strokeWidth="2" strokeLinecap="round">
      <path d="M6 6l12 12M6 18L18 6" />
    </svg>
  )
}

function IconFlag() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22V4" />
      <path d="M4 4h13l-2.5 4L17 12H4" />
    </svg>
  )
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={open ? '' : 'rotate-180'}>
      <path d="M4 10l4-4 4 4" stroke="#1a2332" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
      <path d="M3 8.5l3.5 3.5L13 5" stroke="var(--color-slate-400)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconCheckBadge() {
  return (
    <span
      className="absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center border-2 border-white"
      style={{ backgroundColor: '#22c55e' }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d="M3 8.5l3.5 3.5L13 5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

function Avatar({ name, photoUrl, done }: { name: string; photoUrl: string | null; done?: boolean }) {
  return (
    <div className="relative w-28 h-28 mx-auto mb-5">
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt={name} className="w-28 h-28 rounded-full object-cover" />
      ) : (
        <div className="w-28 h-28 rounded-full flex items-center justify-center bg-slate-100 text-slate-500 font-bold text-3xl">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      {done && <IconCheckBadge />}
    </div>
  )
}

export default function CurrentBookingView({
  bookingId,
  cleanerName,
  cleanerPhotoUrl,
  progressStatus,
  isDone,
  tasks,
  totalPrice,
  alreadyReviewed,
  cardFeePercentage,
  lateCancelRefund = null,
  noShowReportableAtMs = null,
  addressLine = null,
}: Props) {
  const router = useRouter()
  const firstName = cleanerName.split(' ')[0]
  const [showReport, setShowReport] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [viewingPhoto, setViewingPhoto] = useState<number | null>(null)

  const groups = groupByCategory(tasks)
  const photos: TaskPhoto[] = groups.flatMap((g) =>
    g.tasks.flatMap((t) => (t.completion_photo_url ? [{ url: t.completion_photo_url, category: g.category, taskName: t.task_name }] : []))
  )
  const photoIndexFor = (task: BookingTaskRow) => photos.findIndex((p) => p.url === task.completion_photo_url)

  // Follows the Tidy Pro through each stage without a reload — the page
  // re-renders as "all done" once they finish. No realtime subscription yet,
  // so polling stands in for one, same as the message threads.
  useEffect(() => {
    if (isDone) return
    const interval = setInterval(() => router.refresh(), 5000)
    return () => clearInterval(interval)
  }, [isDone, router])

  async function handleCancel() {
    setCancelling(true)
    setCancelError(null)
    const result = await cancelBookingRequestAction(bookingId, lateCancelRefund != null)
    setCancelling(false)
    if ('error' in result) {
      setCancelError(result.error)
      return
    }
    router.push('/dashboard')
  }

  function toggleCategory(category: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  const reportButton = (
    <button type="button" onClick={() => setShowReport(true)} aria-label="Report Tidy Pro" className="w-8 h-8 flex items-center justify-center">
      <IconFlag />
    </button>
  )
  const closeButton = (
    <button type="button" onClick={() => router.push('/dashboard')} aria-label="Close" className="w-8 h-8 flex items-center justify-center -mr-1.5">
      <IconClose />
    </button>
  )
  const overlays = (
    <>
      {showReport && <ReportTidyProSheet bookingId={bookingId} onClose={() => setShowReport(false)} />}
      {viewingPhoto != null && <PhotoViewer photos={photos} startIndex={viewingPhoto} onClose={() => setViewingPhoto(null)} />}
    </>
  )

  if (isDone) {
    return (
      <main id="main-content" className="min-h-screen bg-slate-50 flex flex-col">
        <div className="px-5 pt-6 pb-8 max-w-sm mx-auto w-full">
          <div className="flex items-center justify-end gap-2 mb-2">
            {reportButton}
            {closeButton}
          </div>

          <Avatar name={cleanerName} photoUrl={cleanerPhotoUrl} done />
          <h1 className="text-xl font-bold text-slate-900 text-center mb-8">{HEADLINE.done(firstName)}</h1>

          <p className="text-sm font-bold mb-2" style={{ color: 'var(--color-brand)' }}>
            Completed Tasks
          </p>
          <div className="flex flex-col gap-4">
            {groups.map((group) => (
              <div key={group.category}>
                <p className="text-sm font-bold text-slate-900 mb-2">{group.category}</p>
                {group.tasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-3 mb-2">
                    {task.completion_photo_url ? (
                      <button
                        type="button"
                        onClick={() => setViewingPhoto(photoIndexFor(task))}
                        aria-label={`View photo: ${task.task_name}`}
                        className="flex-shrink-0"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={task.completion_photo_url} alt="" className="w-11 h-11 rounded-md object-cover" />
                      </button>
                    ) : (
                      <div className="w-11 h-11 rounded-md bg-slate-200 flex-shrink-0" />
                    )}
                    <p className="text-xs text-slate-900">{task.task_name}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {!alreadyReviewed && (
          <div className="mt-auto bg-white rounded-t-3xl shadow-[0_-6px_24px_rgba(15,23,42,0.06)] px-5 pt-6 pb-8 safe-area-inset-bottom">
            <div className="relative max-w-sm mx-auto">
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="absolute top-0 right-0 text-sm text-slate-500 underline"
              >
                Skip
              </button>
              <ReviewForm
                cardFeePercentage={cardFeePercentage}
                bookingId={bookingId}
                firstName={firstName}
                totalPrice={totalPrice}
                onSubmitted={() => router.push('/dashboard')}
              />
            </div>
          </div>
        )}

        {overlays}
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="bg-white border-b border-slate-200 px-5 pt-6 pb-7">
        <div className="max-w-sm mx-auto">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => router.push('/dashboard/bookings')}
              aria-label="Back"
              className="w-8 h-8 flex items-center justify-center -ml-1.5"
            >
              <IconBack />
            </button>
            <div className="flex items-center gap-2">
              <EmergencyButton addressLine={addressLine} />
              {reportButton}
              {closeButton}
            </div>
          </div>

          <Avatar name={cleanerName} photoUrl={cleanerPhotoUrl} />
          <h1 className="text-xl font-bold text-slate-900 text-center mb-6">{HEADLINE[progressStatus](firstName)}</h1>

          <ProgressStepper current={progressStatus} />
        </div>
      </div>

      <div className="flex-1 px-5 pt-8 pb-32 max-w-sm mx-auto w-full">
        <p className="text-sm font-bold text-slate-900 mb-3">Task Progress</p>
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-2">
          {groups.map((group, i) => {
            const completedCount = group.tasks.filter((t) => t.is_completed).length
            const open = !collapsed.has(group.category)
            return (
              <div key={group.category} className={i === 0 ? 'py-4' : 'border-t border-slate-200 py-4'}>
                <button
                  type="button"
                  onClick={() => toggleCategory(group.category)}
                  aria-expanded={open}
                  className="w-full flex items-center justify-between"
                >
                  <span className="flex items-center gap-3">
                    <CategoryIcon category={group.category} />
                    <span className="text-base font-semibold text-slate-900">{group.category}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-sm" style={{ color: 'var(--color-brand)' }}>
                      {completedCount}/{group.tasks.length}
                    </span>
                    <IconChevron open={open} />
                  </span>
                </button>
                {open && (
                  <div className="mt-3 pl-[30px] flex flex-col gap-2">
                    {group.tasks.map((task) =>
                      task.is_completed ? (
                        <div key={task.id}>
                          <p className="flex items-center gap-1.5 text-sm text-slate-400 line-through">
                            <IconCheck />
                            {task.task_name}
                          </p>
                          {task.completion_photo_url && (
                            <button
                              type="button"
                              onClick={() => setViewingPhoto(photoIndexFor(task))}
                              className="text-xs pl-5"
                              style={{ color: 'var(--color-brand)' }}
                            >
                              View image
                            </button>
                          )}
                        </div>
                      ) : (
                        <p key={task.id} className="text-sm text-slate-700">
                          - {task.task_name}
                        </p>
                      )
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {progressStatus === 'on_the_way' && (
          <div className="text-center mt-6">
            <ReportNoShowButton bookingId={bookingId} cleanerFirstName={firstName} reportableAtMs={noShowReportableAtMs} />
            {cancelError && <p role="alert" className="text-xs text-red-600 mb-2">{cancelError}</p>}
            {lateCancelRefund != null && (
              <p className="text-xs text-slate-500 mb-2">
                Your booking is less than 12 hours away, so canceling refunds 50% (${lateCancelRefund.toFixed(2)}).
              </p>
            )}
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
              className="text-sm text-slate-500 underline disabled:opacity-50"
            >
              {cancelling ? 'Cancelling…' : 'Cancel booking'}
            </button>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 inset-x-0 px-5 pb-8 pt-3 bg-slate-50 safe-area-inset-bottom">
        <Link
          href={`/dashboard/messages/${bookingId}`}
          className="block max-w-sm mx-auto w-full py-4 rounded-xl text-center text-base text-white"
          style={{ backgroundColor: 'var(--color-brand)' }}
        >
          Message
        </Link>
      </div>

      {overlays}
    </div>
  )
}
