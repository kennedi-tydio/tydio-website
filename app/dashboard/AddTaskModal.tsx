'use client'

import { useEffect, useState } from 'react'
import type { TidyTask, DirtLevel } from './types'
import type { Tier } from '@/lib/pricingRules'
import ModalShell from '@/app/components/ModalShell'
import { saveCustomRoom } from './actions'
import { ENTIRE_HOME_ALLOWED_MESSAGE, ENTIRE_HOME_ROOM, entireHomeTier } from '@/lib/entireHome'
import { broadTaskMessage } from '@/lib/taskSpecificity'
import {
  LAUNDRY_SERVICES,
  LAUNDRY_SERVICE_HINT,
  LAUNDRY_SERVICE_LABEL,
  MORE_THAN_ONE_BASKET_MIN,
  isLaundryTaskName,
  isValidBasketCount,
  isValidIronItemCount,
  isValidMachineLoadCount,
  laundryServiceFromName,
  linkableLaundryTasks,
  needsMachineLoads,
  needsWasherDryer,
  isLaundromatPartialCycle,
  LAUNDROMAT_FULL_CYCLE_ONLY_MESSAGE,
  START_ONLY_NO,
  START_ONLY_YES,
  startOnlyQuestion,
  switchedToWashDryMessage,
  washDryTaskName,
  type LaundryService,
} from '@/lib/laundry'
import {
  BasketQuantityPicker,
  IronItemsPicker,
  MachineLoadsPicker,
  basketsForChoice,
  choiceForBaskets,
  type BasketChoice,
} from './LaundryQuantityPicker'
import { litterOptionFromName, petTaskKindFromName, type PetTaskDetails } from '@/lib/petTasks'
import { unsupportedTaskMessage } from '@/lib/unsupportedTasks'
import PetTaskStep, { discardPetDraftPhotos, newPetDraft, type PetDraft } from './PetTaskStep'

const DEFAULT_ROOMS = [ENTIRE_HOME_ROOM, 'Kitchen', 'Bedroom', 'Bathroom']

const DIRT_OPTIONS: { value: DirtLevel; label: string }[] = [
  { value: 'light', label: 'Light touch-up' },
  { value: 'standard', label: 'Standard cleaning' },
  { value: 'heavy', label: 'Heavy cleaning' },
]

const UNUSUAL_OPTIONS = ['Pet mess', 'Hard water stains', 'Mold/mildew', 'Other (add to notes)']

function isDishTask(name: string) {
  return /dish/i.test(name)
}

function isMopTask(name: string) {
  return /\bmop/i.test(name)
}

function isSweepTask(name: string) {
  return /sweep/i.test(name)
}

const HIDE_MOP_WARNING_KEY = 'tydio:hideMopWarning'
const HIDE_ENTIRE_HOME_TOAST_KEY = 'tydio:hideEntireHomeToast'

function readFlag(key: string): boolean {
  try {
    return typeof window !== 'undefined' && localStorage.getItem(key) === 'true'
  } catch {
    return false
  }
}

function writeFlag(key: string) {
  try {
    localStorage.setItem(key, 'true')
  } catch {
    // Storage blocked (private mode etc.) — the message just shows again next time.
  }
}

type Step = 'create' | 'mopWarning' | 'dishwasher' | 'laundry' | 'pet' | 'dirt' | 'unusual'

type Props = {
  savedRooms: string[]
  existingRooms: string[]
  // The customer's current tasks, so a new Dry task can be linked to a Wash
  // task for the same laundry (or the other way round).
  existingTasks?: TidyTask[]
  // A new room was saved to the customer's profile.
  onRoomSaved?: (room: string) => void
  // Removes one of the customer's existing tasks (a Wash/Dry task replaced
  // by the Wash & dry task being added).
  onRemoveTask?: (taskId: string) => void
  onSave: (task: TidyTask) => void
  onClose: () => void
}

export default function AddTaskModal({ savedRooms, existingRooms, existingTasks = [], onRoomSaved, onRemoveTask, onSave, onClose }: Props) {
  // savedRooms = rooms persisted to the user's profile (survives task deletion)
  // existingRooms = rooms from current in-progress tasks
  const [addedRooms, setAddedRooms] = useState<string[]>([])
  const allRooms = Array.from(new Set([...DEFAULT_ROOMS, ...savedRooms, ...existingRooms, ...addedRooms]))

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
  // One laundry service per task, each with its own quantity. Kept in state
  // across Back so a customer going back and forth doesn't lose them.
  const [laundryService, setLaundryService] = useState<LaundryService | null>(null)
  const [basketChoice, setBasketChoice] = useState<BasketChoice | null>(null)
  const [moreBaskets, setMoreBaskets] = useState(MORE_THAN_ONE_BASKET_MIN)
  const [ironItems, setIronItems] = useState(1)
  // Wash / dry / wash & dry: separate machine loads. Null until the customer
  // sets it, so a linked Wash task's count can fill it in meanwhile.
  const [machineLoadsSet, setMachineLoadsSet] = useState<number | null>(null)
  // Whether this Wash/Dry task is the same laundry as the customer's other
  // Dry/Wash task (offered when there's one to link to).
  const [linkSameLaundry, setLinkSameLaundry] = useState(true)
  // Wash or Dry only: true once the customer confirms they only want the load
  // put in. Null until answered; No turns the task into Wash & dry.
  const [startLoadOnly, setStartLoadOnly] = useState<boolean | null>(null)
  // Set when answering No turned the task into Wash & dry: the message shown.
  const [switchedNotice, setSwitchedNotice] = useState<string | null>(null)
  // Unchecked means the Tidy Pro takes the laundry to a laundromat.
  const [hasWasherDryer, setHasWasherDryer] = useState(false)
  const [dontShowMopWarning, setDontShowMopWarning] = useState(false)
  const [showEntireHomeToast, setShowEntireHomeToast] = useState(false)
  const [roomError, setRoomError] = useState<string | null>(null)
  // Pet enclosure / litter box: options and photos, kept across Back.
  const [petDraft, setPetDraft] = useState<PetDraft | null>(null)
  const [savingRoom, setSavingRoom] = useState(false)

  // A typed room only counts once it's been submitted with Add.
  const selectedRoom = showNewRoom ? '' : room
  const petKind = petTaskKindFromName(name)
  const isDish = isDishTask(name)
  const isLaundry = isLaundryTaskName(name)
  // The most recent unlinked Dry task for a new Wash task, or Wash for Dry.
  const linkCandidate = linkableLaundryTasks(laundryService, existingTasks).at(-1) ?? null
  const linkedTask = linkSameLaundry ? linkCandidate : null
  // Linked to the same laundry: the other task's baskets fill in
  // anything the customer hasn't set themselves.
  const linkedBaskets = linkedTask && isValidBasketCount(linkedTask.laundryBaskets) ? linkedTask.laundryBaskets : null
  const shownBasketChoice = basketChoice ?? (linkedBaskets != null ? choiceForBaskets(linkedBaskets).choice : null)
  const shownMoreBaskets = basketChoice == null && linkedBaskets != null ? choiceForBaskets(linkedBaskets).moreBaskets : moreBaskets
  const machineLoads = machineLoadsSet ?? 1
  const laundryBaskets = basketsForChoice(shownBasketChoice, shownMoreBaskets)
  const laundryQuantityValid =
    laundryService === 'iron'
      ? isValidIronItemCount(ironItems)
      : laundryService != null &&
        isValidBasketCount(laundryBaskets) &&
        (!needsMachineLoads(laundryService) || isValidMachineLoadCount(machineLoads))
  // Without a washer and dryer the Tidy Pro goes to a laundromat, which is
  // booked as a full wash & dry cycle only.
  const laundromatPartialCycle = isLaundromatPartialCycle({ laundryService, hasWasherDryer })
  const startOnlyService = laundryService === 'wash' || laundryService === 'dry' ? laundryService : null
  const laundryStepValid =
    laundryQuantityValid && !laundromatPartialCycle && (startOnlyService == null || startLoadOnly === true)
  // A combined "sweep and mop" task already includes sweeping.
  const isMop = isMopTask(name) && !isSweepTask(name)
  const isEntireHome = selectedRoom === ENTIRE_HOME_ROOM

  useEffect(() => {
    if (!showEntireHomeToast) return
    const timer = setTimeout(() => setShowEntireHomeToast(false), 8000)
    return () => clearTimeout(timer)
  }, [showEntireHomeToast])

  function selectRoom(r: string) {
    setRoom(r)
    setShowNewRoom(false)
    setRoomError(null)
    if (r === ENTIRE_HOME_ROOM && !readFlag(HIDE_ENTIRE_HOME_TOAST_KEY)) setShowEntireHomeToast(true)
  }

  async function handleAddRoom() {
    const typed = newRoom.trim().replace(/\s+/g, ' ')
    if (!typed || savingRoom) return
    const existing = allRooms.find(r => r.toLowerCase() === typed.toLowerCase())
    if (existing) {
      setNewRoom('')
      selectRoom(existing)
      return
    }
    setSavingRoom(true)
    setRoomError(null)
    try {
      const result = await saveCustomRoom(typed)
      if ('error' in result) {
        setRoomError(result.error)
        return
      }
      setAddedRooms(prev => [...prev, result.room])
      onRoomSaved?.(result.room)
      setNewRoom('')
      selectRoom(result.room)
    } catch {
      setRoomError('That couldn’t be saved. Please check your connection and try again.')
    } finally {
      setSavingRoom(false)
    }
  }

  function hideEntireHomeToastForever() {
    writeFlag(HIDE_ENTIRE_HOME_TOAST_KEY)
    setShowEntireHomeToast(false)
  }

  function nextStepAfterCreate(): Step {
    if (petKind) {
      // Keep photos and picks from an earlier visit to this step when it's
      // still the same kind of task; start fresh (and drop the old uploads)
      // if the description now points to the other kind.
      if (petDraft?.kind !== petKind) {
        discardPetDraftPhotos(petDraft)
        setPetDraft(newPetDraft(petKind, petKind === 'litterBox' ? litterOptionFromName(name) : null))
      } else if (petKind === 'litterBox') {
        const fromName = litterOptionFromName(name)
        if (fromName) setPetDraft(prev => (prev ? { ...prev, litterOption: fromName } : prev))
      }
      return 'pet'
    }
    if (isDish) return 'dishwasher'
    if (isLaundry) {
      // Pre-pick the service the task name points to; keep an earlier pick otherwise.
      setLaundryService((prev) => laundryServiceFromName(name) ?? prev)
      return 'laundry'
    }
    return 'dirt'
  }

  function prevStep(current: Step): Step {
    switch (current) {
      case 'unusual':
        return isLaundry ? 'laundry' : 'dirt'
      case 'dirt':
        return isDish ? 'dishwasher' : 'create'
      default:
        return 'create'
    }
  }

  function handleStep1Save() {
    if (!selectedRoom) return
    const unsupported = unsupportedTaskMessage(name)
    if (unsupported) {
      setRoomError(unsupported)
      return
    }
    if (isEntireHome && !entireHomeTier(name)) {
      setRoomError(ENTIRE_HOME_ALLOWED_MESSAGE + ' Name the task, or pick a room instead.')
      return
    }
    // Whole-room requests ("Clean bathroom") aren't Tidy Tasks; Entire home
    // has its own fixed list above.
    const broad = isEntireHome ? null : broadTaskMessage(name, selectedRoom)
    if (broad) {
      setRoomError(broad)
      return
    }
    setRoomError(null)
    const hideMopWarning = readFlag(HIDE_MOP_WARNING_KEY)
    if (isMop && !hideMopWarning) setStep('mopWarning')
    else setStep(nextStepAfterCreate())
  }

  function handleMopWarningOkay() {
    if (dontShowMopWarning) writeFlag(HIDE_MOP_WARNING_KEY)
    setStep(nextStepAfterCreate())
  }

  function handleDishwasherSave() {
    if (hasDishwasher === null) return
    setStep('dirt')
  }

  function chooseLaundryService(service: LaundryService) {
    if (service !== laundryService) {
      setStartLoadOnly(null)
      setSwitchedNotice(null)
    }
    setLaundryService(service)
  }

  // Answering No to "only put a load in" means the customer wants the
  // laundry taken out: that's a Wash & dry task. The task becomes one, and
  // the Wash/Dry task it was linked to is folded into it (removed), so the
  // laundry is one task, not two. The customer then fills in its details.
  function switchToWashDry() {
    const partner = linkedTask
    // Keep the baskets shown, even when they came from the linked task.
    setBasketChoice(shownBasketChoice)
    setMoreBaskets(shownMoreBaskets)
    if (partner) onRemoveTask?.(partner.id)
    setName(washDryTaskName(name))
    setLaundryService('washDry')
    setStartLoadOnly(null)
    setMachineLoadsSet(null)
    setSwitchedNotice(
      switchedToWashDryMessage(
        partner ? { label: LAUNDRY_SERVICE_LABEL[partner.laundryService!], name: partner.name || partner.room } : null
      )
    )
  }

  function handleLaundrySave() {
    if (!laundryStepValid) return
    setStep('unusual')
  }

  function handleStep2Save() {
    if (!dirtLevel) return
    setValidationError(null)
    setStep('unusual')
  }

  // Photos that were uploaded but never saved on a task are removed.
  function handleClose() {
    discardPetDraftPhotos(petDraft)
    onClose()
  }

  // Pet tasks are priced like any other task, from the estimate made off
  // their checked photos. Mess level and "anything unusual" come from the
  // photos too, so those steps are skipped.
  function handlePetAdd(details: PetTaskDetails, tier: Tier, estimatedMinutes: number) {
    onSave({
      id: crypto.randomUUID(),
      name: name.trim() || selectedRoom,
      notes,
      room: selectedRoom,
      dirtLevel: null,
      unusual: [],
      completed: false,
      hasDishwasher: null,
      laundryLoads: null,
      laundryService: null,
      laundryBaskets: null,
      ironItems: null,
      pet: details,
      tier,
      estimatedMinutes,
    })
  }

  async function handleFinalSave() {
    setValidationError(null)
    // Dishwashing and laundry are built-in task types with fixed price tiers
    // (dishwasher availability / load type), so they skip the free-text
    // 30-minute Tidy Task check and AI tier classification entirely. So do
    // Entire home tasks, which get a fixed tier scaled by square footage.
    let tier: Tier | null = isEntireHome ? entireHomeTier(name) : null
    let estimatedMinutes: number | null = null
    if (!isDish && !isLaundry && !isEntireHome) {
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

    if (isLaundry && (!laundryService || !laundryStepValid)) {
      setStep('laundry')
      return
    }

    onSave({
      id: crypto.randomUUID(),
      name: name.trim() || selectedRoom,
      notes,
      room: selectedRoom,
      dirtLevel: isLaundry ? null : dirtLevel,
      unusual,
      completed: false,
      hasDishwasher: isDish ? hasDishwasher : null,
      laundryLoads: null,
      laundryService: isLaundry ? laundryService : null,
      laundryBaskets: isLaundry && laundryService !== 'iron' ? laundryBaskets : null,
      machineLoads: isLaundry && needsMachineLoads(laundryService) ? machineLoads : null,
      sameLaundryAsTaskId: isLaundry && linkedTask ? linkedTask.id : null,
      ironItems: isLaundry && laundryService === 'iron' ? ironItems : null,
      hasWasherDryer: isLaundry && needsWasherDryer(laundryService) ? hasWasherDryer : null,
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
  const taskInputs = (notesLabel = 'Notes (optional)') => (
    <div className="rounded-xl border border-slate-200 overflow-hidden mb-5">
      <input
        aria-label="Task name"
        type="text"
        placeholder="New task"
        value={name}
        onChange={e => { setName(e.target.value); setRoomError(null) }}
        className="w-full px-4 py-3 text-sm text-slate-800 placeholder-slate-400 border-b border-slate-200 focus:outline-none"
      />
      <textarea
        aria-label={notesLabel === 'Notes (optional)' ? 'Task notes' : notesLabel}
        placeholder={notesLabel}
        value={notes}
        onChange={e => setNotes(e.target.value)}
        rows={3}
        className="w-full px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none resize-none"
      />
    </div>
  )

  return (
    <ModalShell panelClassName="w-full max-w-sm max-h-[90dvh] overflow-y-auto overscroll-contain bg-white rounded-t-3xl sm:rounded-3xl px-6 pt-6 pb-8 shadow-2xl" onClose={handleClose} labelledBy="add-task-title">

      {showEntireHomeToast && (
        <div
          role="status"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-slate-900 text-white shadow-xl px-4 py-3"
        >
          <div className="flex items-start gap-3">
            <p className="flex-1 text-sm leading-relaxed">{ENTIRE_HOME_ALLOWED_MESSAGE}</p>
            <button
              onClick={() => setShowEntireHomeToast(false)}
              aria-label="Dismiss"
              className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 flex-shrink-0"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
          <button onClick={hideEntireHomeToastForever} className="mt-2 text-xs font-semibold text-brand">
            Don&apos;t show again
          </button>
        </div>
      )}

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
        <button onClick={handleClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M12 4L4 12M4 4l8 8" stroke="#64748b" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Step 1 — Create */}
      {step === 'create' && (
        <>
          {taskInputs()}

          <p className="text-sm font-semibold text-slate-900 mb-3">
            Where<span className="text-brand">*</span>
          </p>

          <div className="flex flex-col gap-2.5 mb-6">
            {allRooms.map(r => (
              <label
                key={r}
                className="flex items-center gap-3 cursor-pointer"
                onClick={() => selectRoom(r)}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${room === r && !showNewRoom ? 'border-brand' : 'border-slate-300'}`}>
                  {room === r && !showNewRoom && <div className="w-2.5 h-2.5 rounded-full bg-brand" />}
                </div>
                <span className="text-sm text-slate-700">{r}</span>
              </label>
            ))}
            {showNewRoom ? (
              <form
                className="flex items-center gap-2 ml-8"
                onSubmit={e => { e.preventDefault(); handleAddRoom() }}
              >
                <input
                  aria-label="Room name"
                  autoFocus
                  type="text"
                  maxLength={40}
                  placeholder="Room name"
                  value={newRoom}
                  onChange={e => setNewRoom(e.target.value)}
                  className="flex-1 min-w-0 text-sm border-b border-slate-300 py-1 focus:outline-none focus:border-brand"
                />
                <button
                  type="submit"
                  disabled={!newRoom.trim() || savingRoom}
                  className="px-3 py-1.5 rounded-lg bg-brand text-xs font-semibold text-white disabled:opacity-40 transition-opacity"
                >
                  {savingRoom ? 'Adding…' : 'Add'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNewRoom(false); setNewRoom(''); setRoomError(null) }}
                  className="px-2 py-1.5 text-xs font-semibold text-slate-500"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <button
                onClick={() => { setShowNewRoom(true); setRoom(''); setRoomError(null) }}
                className="flex items-center gap-2 text-sm text-slate-400"
              >
                <span className="text-lg leading-none">+</span> New room
              </button>
            )}
          </div>

          {roomError && (
            <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4 leading-relaxed">
              {roomError}
            </p>
          )}

          <div className="flex gap-3">
            <button onClick={handleClose} className="flex-1 py-3 rounded-xl bg-slate-100 text-sm font-semibold text-slate-600">
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
          {taskInputs()}

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
            <button onClick={handleClose} className="flex-1 py-3 rounded-xl bg-slate-100 text-sm font-semibold text-slate-600">
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

      {/* Laundry — one service (wash / dry / wash & dry / fold / iron) with its own quantity */}
      {step === 'laundry' && (
        <>
          {taskInputs()}

          {switchedNotice && laundryService === 'washDry' && (
            <p role="status" className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-3 mb-5 leading-relaxed">
              {switchedNotice}
            </p>
          )}

          <p id="laundry-service-label" className="text-sm font-semibold text-slate-900 mb-3">
            Which laundry task?<span className="text-brand">*</span>
          </p>
          <div role="radiogroup" aria-labelledby="laundry-service-label" className="flex flex-col gap-2.5 mb-6">
            {LAUNDRY_SERVICES.map(service => (
              <button
                key={service}
                type="button"
                role="radio"
                aria-checked={laundryService === service}
                className="flex items-start gap-3 cursor-pointer text-left"
                onClick={() => chooseLaundryService(service)}
              >
                <div className={`w-5 h-5 mt-px flex-shrink-0 rounded-full border-2 flex items-center justify-center ${laundryService === service ? 'border-brand' : 'border-slate-300'}`}>
                  {laundryService === service && <div className="w-2.5 h-2.5 rounded-full bg-brand" />}
                </div>
                <span className="flex flex-col">
                  <span className="text-sm text-slate-700">{LAUNDRY_SERVICE_LABEL[service]}</span>
                  {LAUNDRY_SERVICE_HINT[service] && (
                    <span className="text-xs text-slate-400 mt-0.5">{LAUNDRY_SERVICE_HINT[service]}</span>
                  )}
                </span>
              </button>
            ))}
          </div>

          {laundryService === 'iron' ? (
            <IronItemsPicker items={ironItems} onChange={setIronItems} />
          ) : laundryService ? (
            <BasketQuantityPicker
              choice={shownBasketChoice}
              moreBaskets={shownMoreBaskets}
              onChoiceChange={(c) => {
                setBasketChoice(c)
                setMoreBaskets(shownMoreBaskets)
              }}
              onMoreBasketsChange={(n) => {
                setBasketChoice(shownBasketChoice)
                setMoreBaskets(n)
              }}
            />
          ) : null}

          {linkCandidate && (
            <div className="mb-6">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={linkSameLaundry}
                  onChange={e => setLinkSameLaundry(e.target.checked)}
                  aria-describedby="same-laundry-help"
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`w-5 h-5 mt-px rounded border-2 flex items-center justify-center flex-shrink-0 peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 ${linkSameLaundry ? 'border-brand bg-brand' : 'border-slate-300'}`}
                >
                  {linkSameLaundry && (
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <path d="M2 5.5l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </span>
                <span className="text-sm text-slate-700">
                  Same laundry as your {LAUNDRY_SERVICE_LABEL[linkCandidate.laundryService!]} task
                  <span className="text-slate-400"> ({linkCandidate.name || linkCandidate.room})</span>
                </span>
              </label>
              <p id="same-laundry-help" className="text-xs mt-1.5 ml-8 leading-relaxed text-slate-400">
                {linkSameLaundry
                  ? 'Your Tidy Pro moves the load from the washer to the dryer, so the visit is booked for 2 hours.'
                  : 'Treated as different laundry from that task.'}
              </p>
            </div>
          )}

          {startOnlyService && (
            <div className="mb-6">
              <p id="start-only-label" className="text-sm font-semibold text-slate-900 mb-3">
                {startOnlyQuestion(startOnlyService, linkedTask != null)}
                <span className="text-brand">*</span>
              </p>
              <div role="radiogroup" aria-labelledby="start-only-label" className="flex flex-col gap-2.5">
                {([true, false] as const).map(value => (
                  <button
                    key={String(value)}
                    type="button"
                    role="radio"
                    aria-checked={startLoadOnly === value}
                    className="flex items-center gap-3 cursor-pointer text-left"
                    onClick={() => (value ? setStartLoadOnly(true) : switchToWashDry())}
                  >
                    <div className={`w-5 h-5 flex-shrink-0 rounded-full border-2 flex items-center justify-center ${startLoadOnly === value ? 'border-brand' : 'border-slate-300'}`}>
                      {startLoadOnly === value && <div className="w-2.5 h-2.5 rounded-full bg-brand" />}
                    </div>
                    <span className="text-sm text-slate-700">{value ? START_ONLY_YES : START_ONLY_NO}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {needsMachineLoads(laundryService) && (
            <MachineLoadsPicker loads={machineLoads} onChange={setMachineLoadsSet} />
          )}

          {needsWasherDryer(laundryService) && (
            <div className="mb-6">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasWasherDryer}
                  onChange={e => setHasWasherDryer(e.target.checked)}
                  aria-describedby="washer-dryer-help"
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`w-5 h-5 mt-px rounded border-2 flex items-center justify-center flex-shrink-0 peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 ${hasWasherDryer ? 'border-brand bg-brand' : 'border-slate-300'}`}
                >
                  {hasWasherDryer && (
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <path d="M2 5.5l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </span>
                <span className="text-sm text-slate-700">I have a working washer and dryer</span>
              </label>
              <p
                id="washer-dryer-help"
                className={`text-xs mt-1.5 ml-8 leading-relaxed ${hasWasherDryer ? 'text-slate-400' : 'text-amber-700'}`}
              >
                {hasWasherDryer
                  ? 'Your Tidy Pro will use your washer and dryer.'
                  : 'Not checked: your Tidy Pro will take your laundry to the nearest laundromat.'}
              </p>
              {laundromatPartialCycle && (
                <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mt-2 ml-8 leading-relaxed">
                  {LAUNDROMAT_FULL_CYCLE_ONLY_MESSAGE}
                </p>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={handleClose} className="flex-1 py-3 rounded-xl bg-slate-100 text-sm font-semibold text-slate-600">
              Cancel
            </button>
            <button
              onClick={handleLaundrySave}
              disabled={!laundryStepValid}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
              style={{ backgroundColor: '#1a2332' }}
            >
              Next
            </button>
          </div>
        </>
      )}

      {/* Pet enclosure / litter box — options, photos checked by AI, estimate */}
      {step === 'pet' && petDraft && (
        <PetTaskStep
          name={name}
          notes={notes}
          draft={petDraft}
          setDraft={update => setPetDraft(prev => (prev ? update(prev) : prev))}
          taskInputs={taskInputs('Cleaning instructions (optional)')}
          onCancel={handleClose}
          onAdd={handlePetAdd}
        />
      )}

      {/* Step 2 — Dirt level */}
      {step === 'dirt' && (
        <>
          {taskInputs()}

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
            <button onClick={handleClose} className="flex-1 py-3 rounded-xl bg-slate-100 text-sm font-semibold text-slate-600">
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
          {taskInputs()}

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
            <button onClick={handleClose} className="flex-1 py-3 rounded-xl bg-slate-100 text-sm font-semibold text-slate-600">
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
