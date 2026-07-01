'use client'

import { useState } from 'react'
import type { TidyTask, DirtLevel } from './types'

const DEFAULT_ROOMS = ['Kitchen', 'Bedroom', 'Bathroom']

const DIRT_OPTIONS: { value: DirtLevel; label: string }[] = [
  { value: 'light', label: 'Light touch-up' },
  { value: 'standard', label: 'Standard cleaning' },
  { value: 'heavy', label: 'Heavy cleaning' },
]

const UNUSUAL_OPTIONS = ['Pet mess', 'Hard water stains', 'Mold/mildew', 'Other (add to notes)']

type Step = 'create' | 'dirt' | 'unusual'

type Props = {
  savedRooms: string[]
  existingRooms: string[]
  onSave: (task: TidyTask) => void
  onClose: () => void
}

export default function AddTaskModal({ savedRooms, existingRooms, onSave, onClose }: Props) {
  // savedRooms = rooms persisted to the user's profile (survives task deletion)
  // existingRooms = rooms from current in-progress tasks
  const allRooms = Array.from(new Set([...DEFAULT_ROOMS, ...savedRooms, ...existingRooms]))

  const [step, setStep] = useState<Step>('create')
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [room, setRoom] = useState('')
  const [newRoom, setNewRoom] = useState('')
  const [showNewRoom, setShowNewRoom] = useState(false)
  const [dirtLevel, setDirtLevel] = useState<DirtLevel | null>(null)
  const [unusual, setUnusual] = useState<string[]>([])
  const [validating, setValidating] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  const selectedRoom = showNewRoom ? newRoom.trim() : room

  function handleStep1Save() {
    if (!selectedRoom) return
    setStep('dirt')
  }

  function handleStep2Save() {
    if (!dirtLevel) return
    setValidationError(null)
    setStep('unusual')
  }

  async function handleFinalSave() {
    setValidationError(null)
    setValidating(true)
    try {
      const res = await fetch('/api/validate-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), notes, room: selectedRoom }),
      })
      const { valid, reason } = await res.json() as { valid: boolean; reason: string }
      if (!valid) {
        setValidationError(reason || 'This doesn\'t look like a valid Tidy Task. Please enter a specific cleaning task that takes under 30 minutes.')
        return
      }
    } catch {
      // If validation fails due to a network error, allow saving
    } finally {
      setValidating(false)
    }

    onSave({
      id: crypto.randomUUID(),
      name: name.trim() || selectedRoom,
      notes,
      room: selectedRoom,
      dirtLevel,
      unusual,
      completed: false,
    })
  }

  function toggleUnusual(item: string) {
    setUnusual(prev =>
      prev.includes(item) ? prev.filter(u => u !== item) : [...prev, item]
    )
  }

  // Shared task name + notes input block shown on all steps
  const TaskInputs = (
    <div className="rounded-xl border border-slate-200 overflow-hidden mb-5">
      <input
        type="text"
        placeholder="New task"
        value={name}
        onChange={e => setName(e.target.value)}
        className="w-full px-4 py-3 text-sm text-slate-800 placeholder-slate-400 border-b border-slate-200 focus:outline-none"
      />
      <textarea
        placeholder="Notes (optional)"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        rows={3}
        className="w-full px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none resize-none"
      />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl px-6 pt-6 pb-8 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            {step !== 'create' && (
              <button
                onClick={() => setStep(step === 'unusual' ? 'dirt' : 'create')}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100"
                aria-label="Back"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M10 12L6 8l4-4" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
            <h2 className="text-xl font-bold text-slate-900">Add Task</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="#64748b" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Step 1 — Create */}
        {step === 'create' && (
          <>
            {TaskInputs}

            <p className="text-sm font-semibold text-slate-900 mb-3">
              Room<span className="text-[#38C7CA]">*</span>
            </p>

            <div className="flex flex-col gap-2.5 mb-6">
              {allRooms.map(r => (
                <label
                  key={r}
                  className="flex items-center gap-3 cursor-pointer"
                  onClick={() => { setRoom(r); setShowNewRoom(false) }}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${room === r && !showNewRoom ? 'border-[#38C7CA]' : 'border-slate-300'}`}>
                    {room === r && !showNewRoom && <div className="w-2.5 h-2.5 rounded-full bg-[#38C7CA]" />}
                  </div>
                  <span className="text-sm text-slate-700">{r}</span>
                </label>
              ))}
              {showNewRoom ? (
                <input
                  autoFocus
                  type="text"
                  placeholder="Room name"
                  value={newRoom}
                  onChange={e => setNewRoom(e.target.value)}
                  className="text-sm border-b border-slate-300 py-1 focus:outline-none focus:border-[#38C7CA] ml-8"
                />
              ) : (
                <button
                  onClick={() => { setShowNewRoom(true); setRoom('') }}
                  className="flex items-center gap-2 text-sm text-slate-400"
                >
                  <span className="text-lg leading-none">+</span> New room
                </button>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-slate-100 text-sm font-semibold text-slate-600">
                Cancel
              </button>
              <button
                onClick={handleStep1Save}
                disabled={!selectedRoom}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
                style={{ backgroundColor: '#1a2332' }}
              >
                Next
              </button>
            </div>
          </>
        )}

        {/* Step 2 — Dirt level */}
        {step === 'dirt' && (
          <>
            {TaskInputs}

            <p className="text-sm font-semibold text-slate-900 mb-3">
              How dirty is it?<span className="text-[#38C7CA]">*</span>
            </p>

            <div className="flex flex-col gap-2.5 mb-6">
              {DIRT_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  className="flex items-center gap-3 cursor-pointer"
                  onClick={() => setDirtLevel(opt.value)}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${dirtLevel === opt.value ? 'border-[#38C7CA]' : 'border-slate-300'}`}>
                    {dirtLevel === opt.value && <div className="w-2.5 h-2.5 rounded-full bg-[#38C7CA]" />}
                  </div>
                  <span className="text-sm text-slate-700">{opt.label}</span>
                </label>
              ))}
            </div>

            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-slate-100 text-sm font-semibold text-slate-600">
                Delete
              </button>
              <button
                onClick={handleStep2Save}
                disabled={!dirtLevel}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
                style={{ backgroundColor: '#1a2332' }}
              >
                Next
              </button>
            </div>
          </>
        )}

        {/* Step 3 — Unusual items (optional checkboxes) */}
        {step === 'unusual' && (
          <>
            {TaskInputs}

            <p className="text-sm font-semibold text-slate-900 mb-0.5">
              Anything unusual?
            </p>
            <p className="text-xs text-slate-400 mb-3">Optional</p>

            <div className="flex flex-col gap-2.5 mb-4">
              {UNUSUAL_OPTIONS.map(opt => (
                <label
                  key={opt}
                  className="flex items-center gap-3 cursor-pointer"
                  onClick={() => toggleUnusual(opt)}
                >
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${unusual.includes(opt) ? 'border-[#38C7CA] bg-[#38C7CA]' : 'border-slate-300'}`}
                  >
                    {unusual.includes(opt) && (
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                        <path d="M2 5.5l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <span className="text-sm text-slate-700">{opt}</span>
                </label>
              ))}
            </div>

            {validationError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4 leading-relaxed">
                {validationError}
              </p>
            )}

            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-slate-100 text-sm font-semibold text-slate-600">
                Delete
              </button>
              <button
                onClick={handleFinalSave}
                disabled={validating}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-opacity"
                style={{ backgroundColor: '#1a2332' }}
              >
                {validating ? 'Checking…' : 'Save'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
