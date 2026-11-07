'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from '@/app/components/NavigationSpinner'
import { saveTasks, deleteDraft } from './actions'
import AddTaskModal from './AddTaskModal'
import { isTaskPriceable } from './isTaskPriceable'
import type { TidyTask } from './types'

// ── icons ────────────────────────────────────────────────────────────────────

function IconHome({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'var(--color-brand)' : 'none'} stroke={active ? 'var(--color-brand)' : 'var(--color-slate-400)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/>
      <path d="M9 21V12h6v9"/>
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <path d="M16 2v4M8 2v4M3 10h18"/>
    </svg>
  )
}

function IconMessage() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
  )
}

function IconUser() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  )
}

function IconChevron({ down }: { down: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round">
      {down
        ? <path d="M4 6l4 4 4-4"/>
        : <path d="M4 10l4-4 4 4"/>}
    </svg>
  )
}

function IconArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#1e2837" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h10M9 4l4 4-4 4"/>
    </svg>
  )
}

function IconBadgeCheck() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function RoomIcon({ room }: { room: string }) {
  const r = room.toLowerCase()
  if (r.includes('kitchen'))
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M7 3v18M2 9h5"/></svg>
  if (r.includes('bed'))
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round"><path d="M2 20v-8a2 2 0 012-2h16a2 2 0 012 2v8"/><path d="M2 14h20M7 14V9a1 1 0 011-1h8a1 1 0 011 1v5"/></svg>
  if (r.includes('bath'))
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round"><path d="M9 6L6 3m0 0a2 2 0 00-3 3v10h18v-2"/><path d="M3 16a5 5 0 0010 0"/></svg>
  // Custom room — use home icon
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>
}

// ── helpers ──────────────────────────────────────────────────────────────────

function groupByRoom(tasks: TidyTask[]): Record<string, TidyTask[]> {
  return tasks.reduce<Record<string, TidyTask[]>>((acc, t) => {
    ;(acc[t.room] ??= []).push(t)
    return acc
  }, {})
}

function formatClockTime(minutesSinceMidnight: number): string {
  const h = Math.floor(minutesSinceMidnight / 60) % 24
  const m = minutesSinceMidnight % 60
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function formatTimeRange(time: string, durationMinutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const start = h * 60 + m
  return `${formatClockTime(start)} - ${formatClockTime(start + durationMinutes)}`
}

export type UpcomingBooking = {
  id: string
  cleanerName: string
  cleanerPhotoUrl: string | null
  scheduledDate: string | null
  scheduledTime: string | null
  durationMinutes: number
  kind: 'upcoming' | 'tracking' | 'review_prompt'
  progressStatus: 'on_the_way' | 'arrived' | 'cleaning' | null
}

function BookingAvatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  return (
    <div className="relative flex-shrink-0">
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt={name} className="w-12 h-12 rounded-full object-cover" />
      ) : (
        <div className="w-12 h-12 rounded-full flex items-center justify-center bg-slate-100 text-slate-500 font-semibold">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      <span
        className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center border-2 border-white"
        style={{ backgroundColor: 'var(--color-brand)' }}
      >
        <IconBadgeCheck />
      </span>
    </div>
  )
}

function BookingCard({ booking }: { booking: UpcomingBooking }) {
  const firstName = booking.cleanerName.split(' ')[0]
  const href = booking.kind === 'upcoming' ? `/dashboard/messages/${booking.id}` : `/dashboard/bookings/${booking.id}`

  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white shadow-sm px-4 py-3.5"
    >
      <BookingAvatar name={booking.cleanerName} photoUrl={booking.cleanerPhotoUrl} />
      <div className="min-w-0 flex-1">
        {booking.kind === 'review_prompt' ? (
          <>
            <p className="text-sm font-bold text-slate-900 truncate">Rate your cleaning with {firstName}</p>
            <p className="text-xs text-slate-400">Let us know how it went</p>
          </>
        ) : booking.kind === 'tracking' ? (
          <>
            <p className="text-sm font-bold text-slate-900 truncate">
              {firstName}{' '}
              {booking.progressStatus === 'cleaning'
                ? 'is cleaning your home'
                : booking.progressStatus === 'arrived'
                ? 'has arrived'
                : 'is on the way'}
            </p>
            <p className="text-xs text-slate-400">Tap to see live progress</p>
          </>
        ) : (
          <>
            <p className="text-sm font-bold text-slate-900 truncate">Upcoming booking with {firstName}</p>
            {booking.scheduledTime && (
              <p className="text-xs text-slate-400">{formatTimeRange(booking.scheduledTime, booking.durationMinutes)}</p>
            )}
          </>
        )}
      </div>
      <span className="w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center flex-shrink-0">
        <IconArrowRight />
      </span>
    </Link>
  )
}

// ── component ────────────────────────────────────────────────────────────────

export default function DashboardHome({
  firstName,
  initialTasks,
  draftId: initialDraftId,
  bookingAccessStatus,
  savedRooms,
  priceError,
  upcomingBookings,
  unreadMessageCount,
}: {
  firstName: string
  initialTasks: TidyTask[]
  draftId: string | null
  bookingAccessStatus: string
  savedRooms: string[]
  priceError?: string
  upcomingBookings: UpcomingBooking[]
  unreadMessageCount: number
}) {
  const router = useRouter()

  // If the draft arrived with tasks still marked selected — left over from a
  // prior, abandoned booking attempt — clear that on this fresh mount. Kept
  // client-side (rather than in the server page component) deliberately:
  // toggling a task calls saveTasks(), which revalidates '/dashboard' and
  // makes Next.js silently re-run the server page in the background while
  // the customer is still on it. Resetting there would wipe a selection
  // within moments of them making it. A mount-only effect only fires on an
  // actual navigation back to this page, not on those background refreshes.
  const [resetSelectionsOnMount] = useState(() => initialTasks.some((t) => t.completed))
  const didResetSelectionsRef = useRef(false)
  const [tasks, setTasks] = useState<TidyTask[]>(() =>
    resetSelectionsOnMount ? initialTasks.map((t) => ({ ...t, completed: false })) : initialTasks
  )
  const [draftId, setDraftId] = useState<string | null>(initialDraftId)
  const [showModal, setShowModal] = useState(false)
  const [collapsedRooms, setCollapsedRooms] = useState<Set<string>>(new Set())
  const [showPriceError, setShowPriceError] = useState(!!priceError)
  const [noTasksError, setNoTasksError] = useState(false)
  const priceErrorMessage =
    priceError === 'state_pricing_not_configured'
      ? "We can't price bookings in your area yet — we've let our team know."
      : "We couldn't calculate a price for one of your tasks. Try removing and re-adding it."
  const [, startTransition] = useTransition()

  function persist(updated: TidyTask[]) {
    startTransition(async () => {
      const id = await saveTasks(updated, draftId)
      if (id && !draftId) setDraftId(id)
    })
  }

  useEffect(() => {
    if (resetSelectionsOnMount && !didResetSelectionsRef.current) {
      didResetSelectionsRef.current = true
      persist(tasks)
    }
    // Intentionally mount-only — see comment above the `tasks` state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleHireTidyPro() {
    if (!tasks.some((t) => t.completed)) {
      setNoTasksError(true)
      return
    }
    setNoTasksError(false)
    router.push('/book')
  }

  function handleDeleteSelected() {
    const remaining = tasks.filter(t => !t.completed)
    setTasks(remaining)
    startTransition(async () => {
      if (remaining.length === 0 && draftId) {
        await deleteDraft(draftId)
        setDraftId(null)
      } else {
        const id = await saveTasks(remaining, draftId)
        if (id && !draftId) setDraftId(id)
      }
    })
  }

  function handleAddTask(task: TidyTask) {
    const updated = [...tasks, task]
    setTasks(updated)
    setShowModal(false)
    persist(updated)
  }

  function handleToggle(taskId: string) {
    const updated = tasks.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t)
    setTasks(updated)
    setNoTasksError(false)
    persist(updated)
  }

  function toggleRoom(room: string) {
    setCollapsedRooms(prev => {
      const next = new Set(prev)
      next.has(room) ? next.delete(room) : next.add(room)
      return next
    })
  }

  const groups = groupByRoom(tasks)
  const roomList = Object.keys(groups)

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <h1 className="sr-only">Home</h1>
      {/* ── scrollable content ── */}
      <div className="flex-1 overflow-y-auto px-5 pt-10 pb-36 max-w-sm mx-auto w-full">

        {showPriceError && (
          <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 mb-5 flex items-start justify-between gap-3">
            <p role="alert" className="text-xs text-red-600 leading-relaxed">{priceErrorMessage}</p>
            <button
              onClick={() => setShowPriceError(false)}
              className="flex-shrink-0 text-red-400"
              aria-label="Dismiss"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        )}

        {/* Location header */}
        <button className="flex items-center gap-1 mb-7">
          <span className="text-sm font-semibold text-slate-900">{firstName}&apos;s Home</span>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round">
            <path d="M3 5l4 4 4-4"/>
          </svg>
        </button>

        {/* ── Bookings ── */}
        <h2 className="text-2xl font-bold text-slate-900 mb-3">Bookings</h2>

        {bookingAccessStatus === 'booking_allowed' ? (
          upcomingBookings.length > 0 ? (
            <div className="flex flex-col gap-3 mb-8">
              {upcomingBookings.map((booking) => (
                <BookingCard key={booking.id} booking={booking} />
              ))}
            </div>
          ) : (
          <Link href="/book" className="block relative rounded-2xl overflow-hidden h-36 mb-8 cursor-pointer">
            <div className="absolute inset-0" style={{ backgroundColor: '#c8cdd2' }}>
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 150" preserveAspectRatio="xMidYMid slice">
                <line x1="0" y1="55" x2="400" y2="45" stroke="white" strokeWidth="10" opacity="0.55"/>
                <line x1="0" y1="110" x2="400" y2="100" stroke="white" strokeWidth="6" opacity="0.45"/>
                <line x1="90" y1="0" x2="75" y2="150" stroke="white" strokeWidth="10" opacity="0.55"/>
                <line x1="195" y1="0" x2="210" y2="150" stroke="white" strokeWidth="6" opacity="0.4"/>
                <line x1="310" y1="0" x2="330" y2="150" stroke="white" strokeWidth="8" opacity="0.5"/>
                <line x1="0" y1="130" x2="400" y2="20" stroke="white" strokeWidth="5" opacity="0.35"/>
              </svg>
              <div className="absolute inset-0" style={{ background: 'rgba(30,40,55,0.38)' }} />
            </div>
            <div className="absolute inset-0 flex items-center justify-between px-5">
              <p className="text-white text-sm font-medium leading-snug drop-shadow max-w-[62%]">
                You have no upcoming bookings.<br />Search for nearby Tidy Pros!
              </p>
              <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#1e2837" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8h10M9 4l4 4-4 4"/>
                </svg>
              </div>
            </div>
          </Link>
          )
        ) : (
          <div className="rounded-2xl overflow-hidden h-36 mb-8 flex items-center px-5 gap-4" style={{ backgroundColor: '#e8f9fa' }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--color-brand)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
              </svg>
            </div>
            <div>
              <p className="font-semibold text-slate-900 text-sm leading-snug">
                {bookingAccessStatus === 'paused'
                  ? 'Booking paused in your area'
                  : "You're on the Tydio waitlist"}
              </p>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                {bookingAccessStatus === 'paused'
                  ? "We're adding more cleaners in your area. You'll be notified when booking reopens."
                  : "We're growing our cleaner network in your area and will notify you when booking opens."}
              </p>
            </div>
          </div>
        )}

        {/* ── Tidy Tasks ── */}
        <h2 className="text-2xl font-bold text-slate-900 mb-3">Tidy Tasks</h2>

        {tasks.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
            <p className="font-semibold text-slate-900 mb-1">No tasks yet</p>
            <p className="text-sm text-slate-400">What would you like to have cleaned today?</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm divide-y divide-slate-100 overflow-hidden">
            {roomList.map(room => {
              const roomTasks = groups[room]
              const selectedCount = roomTasks.filter(t => t.completed).length
              const collapsed = collapsedRooms.has(room)
              return (
                <div key={room}>
                  {/* Room header */}
                  <button
                    onClick={() => toggleRoom(room)}
                    className="w-full flex items-center justify-between px-4 py-3"
                  >
                    <div className="flex items-center gap-2.5">
                      <RoomIcon room={room} />
                      <span className="font-semibold text-slate-900 text-sm">{room}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium" style={{ color: 'var(--color-brand)' }}>{selectedCount}/{roomTasks.length}</span>
                      <IconChevron down={collapsed} />
                    </div>
                  </button>
                  {/* Task rows */}
                  {!collapsed && (
                    <div className="pb-2">
                      {roomTasks.map(task => {
                        const dirtLabel = task.dirtLevel === 'light' ? 'Light touch-up' : task.dirtLevel === 'standard' ? 'Standard cleaning' : task.dirtLevel === 'heavy' ? 'Heavy cleaning' : null
                        const dishwasherLabel = task.hasDishwasher === true ? 'Has dishwasher' : task.hasDishwasher === false ? 'No dishwasher — hand wash' : null
                        const laundryLabel = task.laundryLoads ? `${task.laundryLoads.wash} wash · ${task.laundryLoads.dry} dry · ${task.laundryLoads.fold} fold` : null
                        const meta = [dirtLabel, dishwasherLabel, laundryLabel, ...(task.unusual ?? [])].filter(Boolean).join(' · ')
                        const priceable = isTaskPriceable(task)
                        return (
                          <button
                            key={task.id}
                            onClick={() => handleToggle(task.id)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${task.completed ? 'bg-[#f0fafa]' : ''}`}
                          >
                            {/* Selection circle */}
                            <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${task.completed ? 'border-brand bg-brand' : 'border-slate-300'}`}>
                              {task.completed && (
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                  <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </div>
                            {/* Task info */}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-slate-800 font-medium leading-tight truncate">
                                {task.name || task.room}
                              </p>
                              {meta && (
                                <p className="text-xs text-slate-400 mt-0.5 truncate">{meta}</p>
                              )}
                              {task.notes && (
                                <p className="text-xs text-slate-400 mt-0.5 truncate italic">{task.notes}</p>
                              )}
                              {!priceable && (
                                <p className="text-xs text-red-600 mt-0.5">
                                  Price unavailable — remove and re-add this task
                                </p>
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Add Task button */}
        <button
          onClick={() => setShowModal(true)}
          className="mt-4 w-full py-4 rounded-2xl text-white font-semibold text-base tracking-wide"
          style={{ backgroundColor: '#1a2332' }}
        >
          + Add Task
        </button>
      </div>

      {/* ── FAB row ── */}
      <div className="fixed bottom-20 inset-x-4 sm:inset-x-auto sm:left-[calc(50%-176px)] sm:right-[calc(50%-176px)]">
        {noTasksError && (
          <p role="alert" className="pointer-events-none w-fit max-w-full mx-auto mb-2 text-center text-xs font-medium text-red-600 bg-white rounded-lg px-3 py-1.5 shadow-md">
            Select at least one task before hiring a Tidy Pro
          </p>
        )}
        <div className="flex items-center justify-between gap-3 pointer-events-none">
          {/* Delete selected — hidden when nothing is selected */}
          <button
            onClick={handleDeleteSelected}
            disabled={tasks.filter(t => t.completed).length === 0}
            className="pointer-events-auto px-5 py-3 rounded-full text-white font-semibold text-sm shadow-lg flex items-center gap-2 transition-opacity disabled:opacity-0 disabled:pointer-events-none"
            style={{ backgroundColor: '#ef4444' }}
            aria-label="Delete selected tasks"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
            </svg>
            Delete
          </button>

          {/* Booking button */}
          {bookingAccessStatus === 'booking_allowed' ? (
            <button
              type="button"
              onClick={handleHireTidyPro}
              className="pointer-events-auto px-5 py-3 rounded-full text-white font-semibold text-sm shadow-lg block"
              style={{ backgroundColor: 'var(--color-brand)' }}
            >
              Hire Tidy Pro
            </button>
          ) : (
            <span
              className="pointer-events-auto px-5 py-3 rounded-full text-white font-semibold text-sm shadow-lg block opacity-50 cursor-not-allowed"
              style={{ backgroundColor: 'var(--color-slate-400)' }}
            >
              Booking Not Available Yet
            </span>
          )}
        </div>
      </div>

      {/* ── Bottom navigation ── */}
      <nav aria-label="Main" className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 safe-area-inset-bottom">
        <div className="flex justify-around items-center py-2 max-w-sm mx-auto px-2">
          {[
            { icon: <IconHome active />, label: 'Home', active: true, href: '/dashboard', badge: 0 },
            { icon: <IconCalendar />, label: 'Bookings', active: false, href: '/dashboard/bookings', badge: 0 },
            { icon: <IconMessage />, label: 'Messages', active: false, href: '/dashboard/messages', badge: unreadMessageCount },
            { icon: <IconUser />, label: 'Profile', active: false, href: '/dashboard/profile', badge: 0 },
          ].map(item => (
            <Link key={item.label} href={item.href} aria-current={item.active ? 'page' : undefined} className="flex flex-col items-center gap-0.5 px-3 py-1 relative">
              <span className="relative">
                {item.icon}
                {item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-brand text-white text-[10px] font-bold flex items-center justify-center leading-none">
                    {item.badge}
                  </span>
                )}
              </span>
              <span className={`text-[10px] font-medium ${item.active ? 'text-brand' : 'text-slate-400'}`}>
                {item.label}
              </span>
              {item.active && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand" />
              )}
            </Link>
          ))}
        </div>
      </nav>

      {/* ── Add Task Modal ── */}
      {showModal && (
        <AddTaskModal
          savedRooms={savedRooms}
          existingRooms={roomList}
          onSave={handleAddTask}
          onClose={() => setShowModal(false)}
        />
      )}
    </main>
  )
}
