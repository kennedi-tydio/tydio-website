'use client'

import { useCallback, useState } from 'react'
import EmergencyButton from '@/app/components/EmergencyButton'
import { useRouter } from '@/app/components/NavigationSpinner'
import type { TidyTask } from '@/app/dashboard/types'
import PetTaskDetails from '@/app/components/PetTaskDetails'
import LaundromatNotice from '@/app/components/LaundromatNotice'
import Link from 'next/link'
import { markBookingDoneAction } from '@/app/pro/messages/[bookingId]/actions'
import PhotoCaptureModal from './PhotoCaptureModal'
import AddToProfileModal from './AddToProfileModal'
import { loadProfilePhotoPairsAction, type CleaningPhoto, type TaskPhoto, type TaskPhotoKind } from './actions'
import type { BookingPhotoPair } from '@/lib/portfolioItems'
import CleaningPhotos from './CleaningPhotos'
import EntireHomeTaskPhotosModal from './EntireHomeTaskPhotosModal'
import { isEntireHomeRoom, MAX_ENTIRE_HOME_TASK_PHOTOS } from '@/lib/entireHome'
import { formatVisitDuration } from '@/lib/laundry'
import { reportUnableToAccessAction } from '@/app/pro/messages/[bookingId]/actions'
import ElapsedTimer from './ElapsedTimer'
import ReportCustomerButton from './ReportCustomerButton'
import FullServiceSummary, { type SummaryLine } from '@/app/components/FullServiceSummary'
import type { FullServiceSelection } from '@/lib/fullService'

export type ProBookingTaskRow = {
  id: string
  task_name: string
  task_category: string
  task_icon: string | null
  is_completed: boolean
  completion_photo_url: string | null
  // Optional photo taken before the task (see BeforePhotosPrompt).
  before_photo_url: string | null
  // 'task' (a Tidy Task), or a Standard / Deep Cleaning row: the whole home,
  // a room, or an add-on (booking_tasks.kind).
  kind?: string | null
}

// The cleaning's own rows (the whole home or a room). They're shown with the
// cleaning's details, not ticked off: photos of them are optional, and they're
// marked done when the job is finished.
export function isCleaningRow(task: Pick<ProBookingTaskRow, 'kind'>): boolean {
  return task.kind === 'full_service_home' || task.kind === 'full_service_room'
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
  if (c.includes('standard cleaning') || c.includes('deep cleaning'))
    return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z"/><path d="M19 15l.8 1.9L21.7 18l-1.9.8L19 20.7l-.8-1.9L16.3 18l1.9-.8z"/></svg>
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

// An Entire home task's photo buttons: up to 3 before and 3 after, 1 after required.
function EntireHomePhotoButtons({
  task,
  photos,
  onOpen,
}: {
  task: ProBookingTaskRow
  photos: TaskPhoto[]
  onOpen: (kind: TaskPhotoKind) => void
}) {
  const before = photos.filter((p) => p.kind === 'before').length
  const after = photos.filter((p) => p.kind === 'after').length
  return (
    <div className="flex items-center gap-3">
      {(!task.is_completed || before > 0) && (
        <button
          type="button"
          onClick={() => onOpen('before')}
          className="text-xs font-semibold text-slate-500"
          aria-label={`Before photos for ${task.task_name}, ${before} of ${MAX_ENTIRE_HOME_TASK_PHOTOS}`}
        >
          Before photos {before}/{MAX_ENTIRE_HOME_TASK_PHOTOS}
        </button>
      )}
      <button
        type="button"
        onClick={() => onOpen('after')}
        className="text-xs font-semibold"
        style={{ color: 'var(--color-brand)' }}
        aria-label={`After photos for ${task.task_name}, ${after} of ${MAX_ENTIRE_HOME_TASK_PHOTOS}${after === 0 ? ', at least 1 required' : ''}`}
      >
        {after === 0 ? 'After photos (1+ required)' : `After photos ${after}/${MAX_ENTIRE_HOME_TASK_PHOTOS}`}
      </button>
    </div>
  )
}

type Props = {
  bookingId: string
  // The booking's Standard / Deep Cleaning: what to clean and what matters most.
  fullService?: { selection: FullServiceSelection; lines: SummaryLine[] } | null
  customerName: string
  addressLabel: string | null
  // Prefilled into the Text 911 message on the emergency sheet.
  addressLine?: string | null
  scheduledDate: string | null
  scheduledTime: string | null
  durationMinutes: number
  pets: string | null
  notes: string | null
  // The customer is supplying the cleaning products.
  suppliesProvided?: boolean
  tasks: ProBookingTaskRow[]
  // Pet enclosure / litter box details and signed photo URLs.
  petTasks?: TidyTask[]
  // Laundromat trips on this booking (see LaundromatNotice).
  laundromatTasks?: TidyTask[]
  photoUrls?: Record<string, string>
  // They said yes to before photos when they arrived.
  wantsBeforePhotos?: boolean
  // When they pressed "I've arrived", for the elapsed time.
  arrivedAtMs?: number | null
  // A Standard / Deep Cleaning's optional before and after photos.
  cleaningPhotos?: CleaningPhoto[]
  // Entire home tasks' photos (up to 3 before and 3 after each).
  taskPhotos?: TaskPhoto[]
}

export default function TaskListView({
  bookingId,
  fullService = null,
  customerName,
  addressLabel,
  addressLine = null,
  scheduledDate,
  scheduledTime,
  durationMinutes,
  pets,
  notes,
  suppliesProvided = false,
  tasks: initialTasks,
  petTasks = [],
  laundromatTasks = [],
  photoUrls = {},
  wantsBeforePhotos = false,
  arrivedAtMs = null,
  cleaningPhotos = [],
  taskPhotos: initialTaskPhotos = [],
}: Props) {
  const router = useRouter()
  const [tasks, setTasks] = useState(initialTasks)
  const [activePhoto, setActivePhoto] = useState<{ task: ProBookingTaskRow; kind: TaskPhotoKind } | null>(null)
  const [taskPhotos, setTaskPhotos] = useState(initialTaskPhotos)
  const [activeEntireHome, setActiveEntireHome] = useState<{ task: ProBookingTaskRow; kind: TaskPhotoKind } | null>(null)
  const activeEntireHomeTaskId = activeEntireHome?.task.id ?? null

  // An Entire home task's photos changed: its first before / after photo is
  // the task's own, and any after photo marks it complete (as on the server).
  const handleEntireHomePhotosChange = useCallback(
    (photos: TaskPhoto[]) => {
      if (!activeEntireHomeTaskId) return
      const taskId = activeEntireHomeTaskId
      setTaskPhotos((prev) => [...prev.filter((p) => p.taskId !== taskId), ...photos])
      const firstBefore = photos.find((p) => p.kind === 'before')?.photoUrl ?? null
      const firstAfter = photos.find((p) => p.kind === 'after')?.photoUrl ?? null
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, before_photo_url: firstBefore, completion_photo_url: firstAfter, is_completed: firstAfter != null }
            : t
        )
      )
    },
    [activeEntireHomeTaskId]
  )
  const [finishing, setFinishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [choosingProfilePhotos, setChoosingProfilePhotos] = useState(false)
  const [reportingNoAccess, setReportingNoAccess] = useState(false)

  // Add-ons and Tidy Tasks each need an after photo; the cleaning's rooms don't.
  const checklist = tasks.filter((t) => !isCleaningRow(t))
  // A Standard / Deep Cleaning also needs at least one after photo of the cleaning.
  const [cleaningAfterCount, setCleaningAfterCount] = useState(cleaningPhotos.filter((p) => p.kind === 'after').length)
  const cleaningPhotosDone = !fullService || cleaningAfterCount > 0
  const allComplete = tasks.length > 0 && checklist.every((t) => t.is_completed) && cleaningPhotosDone
  const noneStarted = tasks.every((t) => !t.is_completed && !t.before_photo_url)
  // The booking's before/after pairs, loaded when they tap "All Tasks Complete".
  const [photoPairs, setPhotoPairs] = useState<BookingPhotoPair[]>([])
  const [loadingPairs, setLoadingPairs] = useState(false)

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

  async function handleAllTasksComplete() {
    if (!allComplete || finishing || loadingPairs) return
    // With any before/after pairs (tasks, Entire home tasks, the cleaning),
    // offer to add them to their profile first. If they can't be loaded, the
    // job still finishes: they can add them later from the past booking page.
    setLoadingPairs(true)
    setError(null)
    const result = await loadProfilePhotoPairsAction(bookingId)
    setLoadingPairs(false)
    const pairs = 'pairs' in result ? result.pairs.filter((p) => !p.onProfile) : []
    if (pairs.length > 0) {
      setPhotoPairs(pairs)
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
    <main id="main-content" className="min-h-svh bg-white flex flex-col">
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

        {fullService && (
          <FullServiceSummary selection={fullService.selection} lines={fullService.lines} showPrices={false} className="mb-3" />
        )}

        {fullService && (
          <CleaningPhotos
            bookingId={bookingId}
            initialPhotos={cleaningPhotos}
            wantsBeforePhotos={wantsBeforePhotos}
            onAfterCountChange={setCleaningAfterCount}
          />
        )}

        {/* Up top so it's read before any task starts, and stays here until the job is done. */}
        {notes && (
          <div className="rounded-2xl border border-brand/30 bg-brand/5 px-4 py-3 mb-5">
            <p className="text-sm font-bold text-slate-900 mb-1">Notes from {customerName}</p>
            <p className="text-sm text-slate-700 whitespace-pre-line break-words">{notes}</p>
          </div>
        )}

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
              {fullService
                ? 'After photos are required: at least one of the cleaning (up to 10), and one for every add-on and Tidy Task. Before photos are optional.'
                : 'After photos are required for every task. Before and after pairs can go on your profile for future customers to see.'}
            </p>
            {checklist.some((t) => isEntireHomeRoom(t.task_category)) && (
              <p className="text-xs text-slate-500 mt-1">
                Entire home tasks take up to {MAX_ENTIRE_HOME_TASK_PHOTOS} before and {MAX_ENTIRE_HOME_TASK_PHOTOS} after
                photos each, with at least 1 after photo.
              </p>
            )}
          </div>
        )}

        <LaundromatNotice tasks={laundromatTasks} className="mb-4" />

        {checklist.length > 0 && (
        <p className="text-sm font-bold" style={{ color: 'var(--color-brand)' }}>
          {fullService ? 'Add-ons and Tidy Tasks' : 'Tasks'}
        </p>
        )}
        {fullService && checklist.length > 0 && (
          <p className="text-xs text-slate-500">Each needs an after photo to mark it complete.</p>
        )}

        <div className="flex flex-col gap-3 my-3">
          {groupByCategory(checklist).map((group) => {
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
                      {isEntireHomeRoom(task.task_category) ? (
                        <EntireHomePhotoButtons
                          task={task}
                          photos={taskPhotos.filter((p) => p.taskId === task.id)}
                          onOpen={(kind) => setActiveEntireHome({ task, kind })}
                        />
                      ) : (
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
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>

        <PetTaskDetails tasks={petTasks} photoUrls={photoUrls} className="mb-6" />

        <p className="text-xs text-slate-400 text-center mb-8">
          {suppliesProvided ? 'Customer will provide their own cleaning supplies' : 'Cleaning supplies will be provided'}
        </p>

        {pets && (
          <>
            <p className="text-sm font-bold" style={{ color: 'var(--color-brand)' }}>
              Additional Details
            </p>
            <div className="mt-2 mb-6">
              <p className="text-sm font-bold text-slate-900">Pets</p>
              <p className="text-sm text-slate-600 whitespace-pre-line">{pets}</p>
            </div>
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
          disabled={!allComplete || finishing || loadingPairs}
          className="w-full py-3.5 rounded-2xl text-center text-sm font-semibold text-white disabled:text-slate-400"
          style={{ backgroundColor: allComplete ? 'var(--color-brand)' : '#e5e9ef' }}
        >
          {finishing || loadingPairs ? 'Finishing…' : fullService ? 'Cleaning Complete' : 'All Tasks Complete'}
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
          readOnly={activePhoto.kind === 'before' && activePhoto.task.completion_photo_url != null}
          existingPhotoUrl={activePhoto.kind === 'before' ? activePhoto.task.before_photo_url : activePhoto.task.completion_photo_url}
          onClose={() => setActivePhoto(null)}
          onSubmitted={(photoUrl) => handlePhotoSubmitted(activePhoto.task.id, activePhoto.kind, photoUrl)}
        />
      )}

      {activeEntireHome && (
        <EntireHomeTaskPhotosModal
          key={activeEntireHome.task.id}
          bookingId={bookingId}
          taskId={activeEntireHome.task.id}
          taskName={activeEntireHome.task.task_name}
          initialPhotos={taskPhotos.filter((p) => p.taskId === activeEntireHome.task.id)}
          focusKind={activeEntireHome.kind}
          onChange={handleEntireHomePhotosChange}
          onClose={() => setActiveEntireHome(null)}
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
