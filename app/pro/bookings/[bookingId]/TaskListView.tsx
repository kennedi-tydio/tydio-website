'use client'

import { useState } from 'react'
import EmergencyButton from '@/app/components/EmergencyButton'
import { useRouter } from '@/app/components/NavigationSpinner'
import type { TidyTask } from '@/app/dashboard/types'
import PetTaskDetails from '@/app/components/PetTaskDetails'
import Link from 'next/link'
import { markBookingDoneAction } from '@/app/pro/messages/[bookingId]/actions'
import PhotoCaptureModal from './PhotoCaptureModal'
import AddToProfileModal, { type PhotoPair } from './AddToProfileModal'
import type { TaskPhotoKind } from './actions'
import { formatVisitDuration } from '@/lib/laundry'
import { reportUnableToAccessAction } from '@/app/pro/messages/[bookingId]/actions'
import ElapsedTimer from './ElapsedTimer'
import ReportCustomerButton from './ReportCustomerButton'

export type ProBookingTaskRow = {
  id: string
  task_name: string
  task_category: string
  task_icon: string | null
  is_completed: boolean
  completion_photo_url: string | null
  // Optional photo taken before the task (see BeforePhotosPrompt).
  before_photo_url: string | null
}

export function IconBack() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M10 12L6 8l4-4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function CategoryIcon({ category }: { category: string }) {
  const c = category.toLowerCase()
  if (c.includes('kitchen'))
    return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M7 3v18M2 9h5"/></svg>
  if (c.includes('bed'))
    return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round"><path d="M2 20v-8a2 2 0 012-2h16a2 2 0 012 2v8"/><path d="M2 14h20M7 14V9a1 1 0 011-1h8a1 1 0 011 1v5"/></svg>
  if (c.includes('bath'))
    return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round"><path d="M9 6L6 3m0 0a2 2 0 00-3 3v10h18v-2"/><path d="M3 16a5 5 0 0010 0"/></svg>
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>
}

export function groupByCategory(tasks: ProBookingTaskRow[]): { category: string; tasks: ProBookingTaskRow[] }[] {
  const order: string[] = []
  const map = new Map<string, ProBookingTaskRow[]>()
  for (const t of tasks) {
    if (!map.has(t.task_category)) {
      map.set(t.task_category, [])
      order.push(t.task_category)
    }
    map.get(t.task_category)!.push(t)
  }
  return order.map((category) => ({ category, tasks: map.get(category)! }))
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function formatDateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`
}

function formatClockTime(minutesSinceMidnight: number): string {
  const h = Math.floor(minutesSinceMidnight / 60) % 24
  const m = minutesSinceMidnight % 60
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

export function formatTimeRange(time: string, durationMinutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const start = h * 60 + m
  return `${formatClockTime(start)} - ${formatClockTime(start + durationMinutes)}`
}

type Props = {
  bookingId: string
  customerName: string
  addressLabel: string | null
  // Prefilled into the Text 911 message on the emergency sheet.
  addressLine?: string | null
  scheduledDate: string | null
  scheduledTime: string | null
  durationMinutes: number
  pets: string | null
  notes: string | null
  tasks: ProBookingTaskRow[]
  // Pet enclosure / litter box details and signed photo URLs.
  petTasks?: TidyTask[]
  photoUrls?: Record<string, string>
  // They said yes to before photos when they arrived.
  wantsBeforePhotos?: boolean
  // When they pressed "I've arrived", for the elapsed time.
  arrivedAtMs?: number | null
}

export default function TaskListView({
  bookingId,
  customerName,
  addressLabel,
  addressLine = null,
  scheduledDate,
  scheduledTime,
  durationMinutes,
  pets,
  notes,
  tasks: initialTasks,
  petTasks = [],
  photoUrls = {},
  wantsBeforePhotos = false,
  arrivedAtMs = null,
}: Props) {
  const router = useRouter()
  const [tasks, setTasks] = useState(initialTasks)
  const [activePhoto, setActivePhoto] = useState<{ task: ProBookingTaskRow; kind: TaskPhotoKind } | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [choosingProfilePhotos, setChoosingProfilePhotos] = useState(false)
  const [reportingNoAccess, setReportingNoAccess] = useState(false)

  const allComplete = tasks.length > 0 && tasks.every((t) => t.is_completed)
  const noneStarted = tasks.every((t) => !t.is_completed)
  const photoPairs: PhotoPair[] = tasks.flatMap((t) =>
    t.before_photo_url && t.completion_photo_url
      ? [{ taskId: t.id, taskName: t.task_name, beforeUrl: t.before_photo_url, afterUrl: t.completion_photo_url }]
      : []
  )

  function handlePhotoSubmitted(taskId: string, kind: TaskPhotoKind, photoUrl: string) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id !== taskId
          ? t
          : kind === 'before'
            ? { ...t, before_photo_url: photoUrl }
            : { ...t, is_completed: true, completion_photo_url: photoUrl }
      )
    )
    setActivePhoto(null)
  }

  function handleAllTasksComplete() {
    if (!allComplete || finishing) return
    // With any before/after pairs, offer to add them to their profile first.
    if (photoPairs.length > 0) {
      setChoosingProfilePhotos(true)
      return
    }
    void finishJob()
  }

  // Only offered before any task is done; takes them to the no-access countdown.
  async function handleUnableToAccess() {
    setReportingNoAccess(true)
    setError(null)
    const result = await reportUnableToAccessAction(bookingId)
    setReportingNoAccess(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    router.replace(`/pro/bookings/${bookingId}`)
    router.refresh()
  }

  async function finishJob() {
    setFinishing(true)
    setError(null)
    const result = await markBookingDoneAction(bookingId)
    setFinishing(false)
    // Refresh on error: a failed payout transfer still leaves the job finished
    // (see completeBookingPayout), so this moves on to the past booking page.
    if ('error' in result) {
      setChoosingProfilePhotos(false)
      setError(result.error)
      router.refresh()
      return
    }
    router.push(`/pro/bookings/${bookingId}/review`)
  }

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-10 max-w-sm mx-auto w-full">
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={() => router.push('/pro/dashboard')}
            aria-label="Back"
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-2"
          >
            <IconBack />
          </button>
          <div className="flex items-center gap-2">
            <EmergencyButton addressLine={addressLine} />
            <ReportCustomerButton bookingId={bookingId} />
          </div>
        </div>

        <p className="text-xs text-slate-400 mb-0.5">Happening Now</p>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">{customerName}</h1>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-6">
          {scheduledDate && <span>{formatDateLabel(scheduledDate)}</span>}
          {scheduledDate && scheduledTime && addressLabel && <span>|</span>}
          {addressLabel && <span>{addressLabel}</span>}
        </div>
        {scheduledTime && <p className="text-xs text-slate-400 -mt-5 mb-1">{formatTimeRange(scheduledTime, durationMinutes)} · Est. visit {formatVisitDuration(durationMinutes)}</p>}
        <ElapsedTimer sinceMs={arrivedAtMs} className="mb-6" />

        {noneStarted && (
          <div className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 mb-5">
            {wantsBeforePhotos ? (
              <p className="text-sm text-slate-700">
                <span className="font-semibold">Take your before photos first.</span> Tap &quot;Before photo&quot; on each
                task before you start it.
              </p>
            ) : (
              <p className="text-sm text-slate-700">
                Want to show your work? Take a <span className="font-semibold">before photo</span> of a task before you
                start it.
              </p>
            )}
            <p className="text-xs text-slate-500 mt-1">
              After photos are required for every task. Before and after pairs can go on your profile for future
              customers to see.
            </p>
          </div>
        )}

        <p className="text-sm font-bold" style={{ color: 'var(--color-brand)' }}>
          Tasks
        </p>

        <div className="flex flex-col gap-3 my-3">
          {groupByCategory(tasks).map((group) => {
            const completedCount = group.tasks.filter((t) => t.is_completed).length
            return (
              <div key={group.category} className="rounded-2xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <CategoryIcon category={group.category} />
                    <p className="text-sm font-bold text-slate-900">{group.category}</p>
                  </div>
                  <p className="text-sm font-medium" style={{ color: 'var(--color-brand)' }}>
                    {completedCount}/{group.tasks.length}
                  </p>
                </div>
                {group.tasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-2 py-1">
                    {task.is_completed ? (
                      <span
                        className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: 'var(--color-brand)' }}
                      >
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                          <path d="M3 8.5l3.5 3.5L13 5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    ) : (
                      <span className="w-4 h-4 rounded-full border border-slate-300 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className={`text-sm ${task.is_completed ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                        {task.task_name}
                      </p>
                      <div className="flex items-center gap-3">
                        {(!task.is_completed || task.before_photo_url) && (
                          <button
                            type="button"
                            onClick={() => setActivePhoto({ task, kind: 'before' })}
                            className="text-xs font-semibold text-slate-500"
                            aria-label={`${task.before_photo_url ? 'View' : 'Add'} before photo for ${task.task_name}`}
                          >
                            {task.before_photo_url ? 'View before' : 'Before photo'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setActivePhoto({ task, kind: 'after' })}
                          className="text-xs font-semibold"
                          style={{ color: 'var(--color-brand)' }}
                          aria-label={`${task.is_completed ? 'View' : 'Add'} after photo for ${task.task_name}`}
                        >
                          {task.is_completed ? 'View after' : 'After photo (required)'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>

        <PetTaskDetails tasks={petTasks} photoUrls={photoUrls} className="mb-6" />

        <p className="text-xs text-slate-400 text-center mb-8">Cleaning supplies will be provided</p>

        {(pets || notes) && (
          <>
            <p className="text-sm font-bold" style={{ color: 'var(--color-brand)' }}>
              Additional Details
            </p>
            {pets && (
              <div className="mt-2">
                <p className="text-sm font-bold text-slate-900">Pets</p>
                <p className="text-sm text-slate-600 whitespace-pre-line">{pets}</p>
              </div>
            )}
            {notes && (
              <div className="mt-2 mb-6">
                <p className="text-sm font-bold text-slate-900">Notes</p>
                <p className="text-sm text-slate-600">{notes}</p>
              </div>
            )}
          </>
        )}

        {error && <p role="alert" className="text-xs text-red-600 mb-3">{error}</p>}
      </div>

      <div className="px-5 pb-8 max-w-sm mx-auto w-full flex flex-col gap-3">
        <Link
          href={`/pro/messages/${bookingId}`}
          className="block w-full py-2.5 rounded-xl text-center bg-white border border-slate-200 text-sm font-semibold text-slate-600"
        >
          Send a message
        </Link>
        {noneStarted && (
          <button
            type="button"
            onClick={handleUnableToAccess}
            disabled={reportingNoAccess || finishing}
            className="w-full py-2.5 rounded-xl text-center bg-white border border-slate-200 text-sm font-semibold text-slate-600 disabled:opacity-60"
          >
            {reportingNoAccess ? 'Starting timer…' : 'Unable to access location'}
          </button>
        )}
        <button
          type="button"
          onClick={handleAllTasksComplete}
          disabled={!allComplete || finishing}
          className="w-full py-3.5 rounded-2xl text-center text-sm font-semibold text-white disabled:text-slate-400"
          style={{ backgroundColor: allComplete ? 'var(--color-brand)' : '#e5e9ef' }}
        >
          {finishing ? 'Finishing…' : 'All Tasks Complete'}
        </button>
      </div>

      {activePhoto && (
        <PhotoCaptureModal
          // Remount when switching between a task's before and after photo.
          key={`${activePhoto.task.id}-${activePhoto.kind}`}
          bookingId={bookingId}
          taskId={activePhoto.task.id}
          taskName={activePhoto.task.task_name}
          kind={activePhoto.kind}
          // A before photo can't be replaced once the task is done.
          readOnly={activePhoto.kind === 'before' && activePhoto.task.is_completed}
          existingPhotoUrl={activePhoto.kind === 'before' ? activePhoto.task.before_photo_url : activePhoto.task.completion_photo_url}
          onClose={() => setActivePhoto(null)}
          onSubmitted={(photoUrl) => handlePhotoSubmitted(activePhoto.task.id, activePhoto.kind, photoUrl)}
        />
      )}

      {choosingProfilePhotos && (
        <AddToProfileModal
          bookingId={bookingId}
          pairs={photoPairs}
          onFinish={finishJob}
          onClose={() => setChoosingProfilePhotos(false)}
        />
      )}
    </main>
  )
}
