'use client'

import { useState } from 'react'
import { isTaskPriceable } from './isTaskPriceable'
import { QUOTE_TASK_LABEL } from '@/lib/taskQuotes'
import type { TidyTask } from './types'
import { isLaundromatPartialCycle, laundryDetailLabel } from '@/lib/laundry'
import { formatEstimatedMinutes, isPetTask, petDetailLabel } from '@/lib/petTasks'

// The customer's Tidy Tasks grouped by room, each tappable to select it. Shared
// by the home page and the cleaning wizard's Tidy Tasks step so both look the same.

function IconChevron({ down }: { down: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round">
      {down
        ? <path d="M4 6l4 4 4-4"/>
        : <path d="M4 10l4-4 4 4"/>}
    </svg>
  )
}

export function RoomIcon({ room }: { room: string }) {
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

function groupByRoom(tasks: TidyTask[]): Record<string, TidyTask[]> {
  return tasks.reduce<Record<string, TidyTask[]>>((acc, t) => {
    ;(acc[t.room] ??= []).push(t)
    return acc
  }, {})
}

export default function TidyTaskList({ tasks, onToggle }: { tasks: TidyTask[]; onToggle: (taskId: string) => void }) {
  const [collapsedRooms, setCollapsedRooms] = useState<Set<string>>(new Set())

  function toggleRoom(room: string) {
    setCollapsedRooms(prev => {
      const next = new Set(prev)
      if (next.has(room)) next.delete(room)
      else next.add(room)
      return next
    })
  }

  if (tasks.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
        <p className="font-semibold text-slate-900 mb-1">No tasks yet</p>
        <p className="text-sm text-slate-400">What would you like to have cleaned today?</p>
      </div>
    )
  }

  const groups = groupByRoom(tasks)
  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm divide-y divide-slate-100 overflow-hidden">
      {Object.keys(groups).map(room => {
        const roomTasks = groups[room]
        const selectedCount = roomTasks.filter(t => t.completed).length
        const collapsed = collapsedRooms.has(room)
        return (
          <div key={room}>
            {/* Room header */}
            <button
              type="button"
              onClick={() => toggleRoom(room)}
              aria-expanded={!collapsed}
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
                  const laundryLabel = task.laundryService
                    ? laundryDetailLabel(task)
                    : task.laundryLoads ? `${task.laundryLoads.wash} wash · ${task.laundryLoads.dry} dry · ${task.laundryLoads.fold} fold` : null
                  const petLabel = isPetTask(task)
                    ? [petDetailLabel(task), `${task.pet.photos.length} photo${task.pet.photos.length === 1 ? '' : 's'}`, task.pet.kind === 'enclosure' ? null : formatEstimatedMinutes(task.estimatedMinutes)].filter(Boolean).join(' · ')
                    : null
                  // Answered when added during a Standard / Deep Cleaning booking.
                  const differentRoomLabel = task.overlapAnswer === 'different_room' ? 'A different room from your cleaning' : null
                  const meta = [dirtLabel, dishwasherLabel, laundryLabel, petLabel, ...(task.unusual ?? []), differentRoomLabel].filter(Boolean).join(' · ')
                  const priceable = isTaskPriceable(task)
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => onToggle(task.id)}
                      aria-pressed={task.completed}
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
                        {priceable && task.needsQuote === true && (
                          <p className="text-xs font-semibold text-amber-700 mt-0.5">{QUOTE_TASK_LABEL}</p>
                        )}
                        {!priceable && (
                          <p className="text-xs text-red-600 mt-0.5">
                            {isPetTask(task) && task.pet.photos.length === 0
                              ? 'Photos expired after 7 days. Remove and re-add this task with new photos'
                              : isLaundromatPartialCycle(task)
                                ? 'Laundromat trips are full cycles only. Remove and re-add this task as Wash & dry'
                                : 'Price unavailable — remove and re-add this task'}
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
  )
}
