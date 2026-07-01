'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { saveTasks, deleteDraft } from './actions'
import AddTaskModal from './AddTaskModal'
import type { TidyTask } from './types'

// ── icons ────────────────────────────────────────────────────────────────────

function IconHome({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? '#38C7CA' : 'none'} stroke={active ? '#38C7CA' : '#94a3b8'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/>
      <path d="M9 21V12h6v9"/>
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <path d="M16 2v4M8 2v4M3 10h18"/>
    </svg>
  )
}

function IconMessage() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
  )
}

function IconUser() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  )
}

function IconChevron({ down }: { down: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round">
      {down
        ? <path d="M4 6l4 4 4-4"/>
        : <path d="M4 10l4-4 4 4"/>}
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

// ── component ────────────────────────────────────────────────────────────────

export default function DashboardHome({
  firstName,
  userId,
  initialTasks,
  draftId: initialDraftId,
  bookingAccessStatus,
  savedRooms,
}: {
  firstName: string
  userId: string
  initialTasks: TidyTask[]
  draftId: string | null
  bookingAccessStatus: string
  savedRooms: string[]
}) {
  const [tasks, setTasks] = useState<TidyTask[]>(initialTasks)
  const [draftId, setDraftId] = useState<string | null>(initialDraftId)
  const [showModal, setShowModal] = useState(false)
  const [collapsedRooms, setCollapsedRooms] = useState<Set<string>>(new Set())
  const [, startTransition] = useTransition()

  function persist(updated: TidyTask[]) {
    startTransition(async () => {
      const id = await saveTasks(userId, updated, draftId)
      if (id && !draftId) setDraftId(id)
    })
  }

  function handleDeleteSelected() {
    const remaining = tasks.filter(t => !t.completed)
    setTasks(remaining)
    startTransition(async () => {
      if (remaining.length === 0 && draftId) {
        await deleteDraft(draftId)
        setDraftId(null)
      } else {
        const id = await saveTasks(userId, remaining, draftId)
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
    <div className="min-h-screen bg-white flex flex-col">
      {/* ── scrollable content ── */}
      <div className="flex-1 overflow-y-auto px-5 pt-10 pb-36 max-w-sm mx-auto w-full">

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
        ) : (
          <div className="rounded-2xl overflow-hidden h-36 mb-8 flex items-center px-5 gap-4" style={{ backgroundColor: '#e8f9fa' }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#38C7CA' }}>
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
                      <span className="text-sm font-medium" style={{ color: '#38C7CA' }}>{selectedCount}/{roomTasks.length}</span>
                      <IconChevron down={collapsed} />
                    </div>
                  </button>
                  {/* Task rows */}
                  {!collapsed && (
                    <div className="pb-2">
                      {roomTasks.map(task => {
                        const dirtLabel = task.dirtLevel === 'light' ? 'Light touch-up' : task.dirtLevel === 'standard' ? 'Standard cleaning' : task.dirtLevel === 'heavy' ? 'Heavy cleaning' : null
                        const meta = [dirtLabel, ...(task.unusual ?? [])].filter(Boolean).join(' · ')
                        return (
                          <button
                            key={task.id}
                            onClick={() => handleToggle(task.id)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${task.completed ? 'bg-[#f0fafa]' : ''}`}
                          >
                            {/* Selection circle */}
                            <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${task.completed ? 'border-[#38C7CA] bg-[#38C7CA]' : 'border-slate-300'}`}>
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
      <div className="fixed bottom-20 inset-x-4 sm:inset-x-auto sm:left-[calc(50%-176px)] sm:right-[calc(50%-176px)] flex items-center justify-between gap-3 pointer-events-none">
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
          <Link
            href="/book"
            className="pointer-events-auto px-5 py-3 rounded-full text-white font-semibold text-sm shadow-lg block"
            style={{ backgroundColor: '#38C7CA' }}
          >
            Hire Tidy Pro
          </Link>
        ) : (
          <span
            className="pointer-events-auto px-5 py-3 rounded-full text-white font-semibold text-sm shadow-lg block opacity-50 cursor-not-allowed"
            style={{ backgroundColor: '#94a3b8' }}
          >
            Booking Not Available Yet
          </span>
        )}
      </div>

      {/* ── Bottom navigation ── */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 safe-area-inset-bottom">
        <div className="flex justify-around items-center py-2 max-w-sm mx-auto px-2">
          {[
            { icon: <IconHome active />, label: 'Home', active: true, href: '/dashboard' },
            { icon: <IconCalendar />, label: 'Bookings', active: false, href: '/dashboard' },
            { icon: <IconMessage />, label: 'Messages', active: false, href: '/dashboard' },
            { icon: <IconUser />, label: 'Profile', active: false, href: '/dashboard/profile' },
          ].map(item => (
            <Link key={item.label} href={item.href} className="flex flex-col items-center gap-0.5 px-3 py-1 relative">
              {item.icon}
              <span className={`text-[10px] font-medium ${item.active ? 'text-[#38C7CA]' : 'text-slate-400'}`}>
                {item.label}
              </span>
              {item.active && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#38C7CA]" />
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
    </div>
  )
}
