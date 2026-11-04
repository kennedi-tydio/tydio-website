'use client'

import { useState } from 'react'
import type { TidyTask, DirtLevel, LaundryLoads } from './types'
import type { Tier } from '@/lib/pricingRules'
import ModalShell from '@/app/components/ModalShell'

const DEFAULT_ROOMS = ['Kitchen', 'Bedroom', 'Bathroom']

const DIRT_OPTIONS: { value: DirtLevel; label: string }[] = [
  { value: 'light', label: 'Light touch-up' },
  { value: 'standard', label: 'Standard cleaning' },
  { value: 'heavy', label: 'Heavy cleaning' },
]

const UNUSUAL_OPTIONS = ['Pet mess', 'Hard water stains', 'Mold/mildew', 'Other (add to notes)']

function isDishTask(name: string) {
  return /dish/i.test(name)
}

function isLaundryTask(name: string) {
  return /laundry|\bclothes\b|\blaundering\b/i.test(name)
}

function isMopTask(name: string) {
  return /\bmop/i.test(name)
}

const HIDE_MOP_WARNING_KEY = 'tydio:hideMopWarning'

type Step = 'create' | 'mopWarning' | 'dishwasher' | 'laundryLoads' | 'dirt' | 'unusual'

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
  const [hasDishwasher, setHasDishwasher] = useState<boolean | null>(null)
  const [washLoads, setWashLoads] = useState(1)
  const [dryLoads, setDryLoads] = useState(1)
  const [foldLoads, setFoldLoads] = useState(1)
  const [dontShowMopWarning, setDontShowMopWarning] = useState(false)

  const selectedRoom = showNewRoom ? newRoom.trim() : room
  const isDish = isDishTask(name)
  const isLaundry = isLaundryTask(name)
  const isMop = isMopTask(name)

  function nextStepAfterCreate(): Step {
    if (isDish) return 'dishwasher'
    if (isLaundry) return 'laundryLoads'
    return 'dirt'
  }

  function prevStep(current: Step): Step {
    switch (current) {
      case 'unusual':
        return isLaundry ? 'laundryLoads' : 'dirt'
      case 'dirt':
        return isDish ? 'dishwasher' : 'create'
      default:
        return 'create'
    }
  }

  function handleStep1Save() {
    if (!selectedRoom) return
    const hideMopWarning = typeof window !== 'undefined' && localStorage.getItem(HIDE_MOP_WARNING_KEY) === 'true'
    if (isMop && !hideMopWarning) setStep('mopWarning')
    else setStep(nextStepAfterCreate())
  }

  function handleMopWarningOkay() {
    if (dontShowMopWarning && typeof window !== 'undefined') {
      localStorage.setItem(HIDE_MOP_WARNING_KEY, 'true')
    }
    setStep(nextStepAfterCreate())
  }

  function handleDishwasherSave() {
    if (hasDishwasher === null) return
    setStep('dirt')
  }

  function handleLaundryLoadsSave() {
    if (washLoads + dryLoads + foldLoads === 0) return
    setStep('unusual')
  }

  function handleStep2Save() {
    if (!dirtLevel) return
    setValidationError(null)
    setStep('unusual')
  }

  async function handleFinalSave() {
    setValidationError(null)
    // Dishwashing and laundry are built-in task types with fixed price tiers
    // (dishwasher availability / load type), so they skip the free-text
    // 30-minute Tidy Task check and AI tier classification entirely.
    let tier: Tier | null = null
    let estimatedMinutes: number | null = null
    if (!isDish && !isLaundry) {
      setValidating(true)
      try {
        const res = await fetch('/api/validate-task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), notes, room: selectedRoom, dirtLevel, unusual }),
        })
        if (!res.ok) throw new Error(`validate-task returned ${res.status}`)
        const data = await res.json() as { valid: boolean; reason: string; tier: Tier | null; estimated_minutes: number | null }
        if (!data.valid) {
          setValidationError(data.reason || 'This doesn\'t look like a valid Tidy Task. Please enter a specific cleaning task that takes under 30 minutes.')
          return
        }
        tier = data.tier
        estimatedMinutes = data.estimated_minutes
      } catch {
        // A network failure (offline, DNS, connection refused) or the estimate
        // service itself failing (non-OK response, e.g. the AI provider is
        // down). There's no estimate to price this task with either way, so
        // block the save rather than letting it through with tier=null.
        const offline = typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine
        setValidationError(
          offline
            ? 'No internet connection. Please check your connection and try again.'
            : 'A price could not be generated right now. Please try again later.'
        )
        return
      } finally {
        setValidating(false)
      }
    }

    const laundryLoads: LaundryLoads | null = isLaundry
      ? { wash: washLoads, dry: dryLoads, fold: foldLoads }
      : null

    onSave({
      id: crypto.randomUUID(),
      name: name.trim() || selectedRoom,
      notes,
      room: selectedRoom,
      dirtLevel: isLaundry ? null : dirtLevel,
      unusual,
      completed: false,
      hasDishwasher: isDish ? hasDishwasher : null,
      laundryLoads,
      tier,
      estimatedMinutes,
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
        aria-label="Task name"
        type="text"
        placeholder="New task"
        value={name}
        onChange={e => setName(e.target.value)}
        className="w-full px-4 py-3 text-sm text-slate-800 placeholder-slate-400 border-b border-slate-200 focus:outline-none"
      />
      <textarea
        aria-label="Task notes"
        placeholder="Notes (optional)"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        rows={3}
        className="w-full px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none resize-none"
      />
    </div>
  )

  return (
    <ModalShell panelClassName="w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl px-6 pt-6 pb-8 shadow-2xl" onClose={onClose} labelledBy="add-task-title">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          {step !== 'create' && (
            <button
              onClick={() => setStep(prevStep(step))}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100"
              aria-label="Back"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 12L6 8l4-4" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
          <h2 id="add-task-title" className="text-xl font-bold text-slate-900">Add Task</h2>
        </div>
        <button onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
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
            Room<span className="text-brand">*</span>
          </p>

          <div className="flex flex-col gap-2.5 mb-6">
            {allRooms.map(r => (
              <label
                key={r}
                className="flex items-center gap-3 cursor-pointer"
                onClick={() => { setRoom(r); setShowNewRoom(false) }}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${room === r && !showNewRoom ? 'border-brand' : 'border-slate-300'}`}>
                  {room === r && !showNewRoom && <div className="w-2.5 h-2.5 rounded-full bg-brand" />}
                </div>
                <span className="text-sm text-slate-700">{r}</span>
              </label>
            ))}
            {showNewRoom ? (
              <input
                aria-label="Room name"
                autoFocus
                type="text"
                placeholder="Room name"
                value={newRoom}
                onChange={e => setNewRoom(e.target.value)}
                className="text-sm border-b border-slate-300 py-1 focus:outline-none focus:border-brand ml-8"
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

      {/* Mop floor — heads-off note that sweeping is a separate task */}
      {step === 'mopWarning' && (
        <>
          <p className="text-sm font-semibold text-slate-900 mb-2">Heads up</p>
          <p className="text-sm text-slate-600 leading-relaxed mb-5">
            Mopping floors does not include sweeping floors. If you&apos;d like the floor swept first, add &quot;Sweep floor&quot; as a separate task.
          </p>

          <label className="flex items-center gap-3 cursor-pointer mb-6" onClick={() => setDontShowMopWarning((v) => !v)}>
            <div
              className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${dontShowMopWarning ? 'border-brand bg-brand' : 'border-slate-300'}`}
            >
              {dontShowMopWarning && (
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path d="M2 5.5l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <span className="text-sm text-slate-700">Don&apos;t show me this message again</span>
          </label>

          <button
            onClick={handleMopWarningOkay}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white"
            style={{ backgroundColor: '#1a2332' }}
          >
            Okay
          </button>
        </>
      )}

      {/* Dishwashing — dishwasher availability */}
      {step === 'dishwasher' && (
        <>
          {TaskInputs}

          <p className="text-sm font-semibold text-slate-900 mb-3">
            Do you have a dishwasher?<span className="text-brand">*</span>
          </p>

          <div className="flex flex-col gap-2.5 mb-6">
            {[{ value: true, label: 'Yes' }, { value: false, label: 'No — hand wash' }].map(opt => (
              <label
                key={String(opt.value)}
                className="flex items-center gap-3 cursor-pointer"
                onClick={() => setHasDishwasher(opt.value)}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${hasDishwasher === opt.value ? 'border-brand' : 'border-slate-300'}`}>
                  {hasDishwasher === opt.value && <div className="w-2.5 h-2.5 rounded-full bg-brand" />}
                </div>
                <span className="text-sm text-slate-700">{opt.label}</span>
              </label>
            ))}
          </div>

          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-slate-100 text-sm font-semibold text-slate-600">
              Cancel
            </button>
            <button
              onClick={handleDishwasherSave}
              disabled={hasDishwasher === null}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
              style={{ backgroundColor: '#1a2332' }}
            >
              Next
            </button>
          </div>
        </>
      )}

      {/* Laundry — loads to wash / dry / fold */}
      {step === 'laundryLoads' && (
        <>
          {TaskInputs}

          <p className="text-sm font-semibold text-slate-900 mb-3">
            How many loads?<span className="text-brand">*</span>
          </p>
          <p className="text-xs text-slate-400 mb-3">Each load is priced separately</p>

          <div className="flex flex-col gap-4 mb-6">
            {[
              { label: 'Loads to wash', value: washLoads, set: setWashLoads },
              { label: 'Loads to dry', value: dryLoads, set: setDryLoads },
              { label: 'Loads to fold', value: foldLoads, set: setFoldLoads },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-sm text-slate-700">{row.label}</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => row.set(Math.max(0, row.value - 1))}
                    className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 font-semibold flex items-center justify-center"
                    aria-label={`Decrease ${row.label.toLowerCase()}`}
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm font-semibold text-slate-900">{row.value}</span>
                  <button
                    type="button"
                    onClick={() => row.set(row.value + 1)}
                    className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 font-semibold flex items-center justify-center"
                    aria-label={`Increase ${row.label.toLowerCase()}`}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-slate-100 text-sm font-semibold text-slate-600">
              Cancel
            </button>
            <button
              onClick={handleLaundryLoadsSave}
              disabled={washLoads + dryLoads + foldLoads === 0}
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
            How dirty is it?<span className="text-brand">*</span>
          </p>

          <div className="flex flex-col gap-2.5 mb-6">
            {DIRT_OPTIONS.map(opt => (
              <label
                key={opt.value}
                className="flex items-center gap-3 cursor-pointer"
                onClick={() => setDirtLevel(opt.value)}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${dirtLevel === opt.value ? 'border-brand' : 'border-slate-300'}`}>
                  {dirtLevel === opt.value && <div className="w-2.5 h-2.5 rounded-full bg-brand" />}
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
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${unusual.includes(opt) ? 'border-brand bg-brand' : 'border-slate-300'}`}
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
            <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4 leading-relaxed">
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
    </ModalShell>
  )
}
