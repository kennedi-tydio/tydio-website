'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from '@/app/components/NavigationSpinner'
import AddTaskModal from '@/app/dashboard/AddTaskModal'
import TidyTaskList from '@/app/dashboard/TidyTaskList'
import OverlapPrompt from '@/app/components/OverlapPrompt'
import { saveTasks } from '@/app/dashboard/actions'
import type { TidyTask } from '@/app/dashboard/types'
import { ADD_TASKS_COPY, FULL_SERVICE_LABEL, type AddOnKey, type FullServiceSelection } from '@/lib/fullService'
import { canAddWithCleaning, decideOverlap, type OverlapDecision } from '@/lib/fullServiceScope'
import WizardFrame from '../WizardFrame'
import { saveFullServiceStepAction } from '../actions'
import { actionErrorMessage } from '@/lib/networkError'

type Pending =
  | { mode: 'add'; task: TidyTask; decision: Exclude<OverlapDecision, { kind: 'none' }> }
  | { mode: 'select'; task: TidyTask; decision: Exclude<OverlapDecision, { kind: 'none' }> }

export default function TasksStep({
  draftId,
  selection: initialSelection,
  initialTasks,
  savedRooms,
}: {
  draftId: string
  selection: FullServiceSelection
  initialTasks: TidyTask[]
  savedRooms: string[]
}) {
  const router = useRouter()
  const [selection, setSelection] = useState(initialSelection)
  const [tasks, setTasks] = useState<TidyTask[]>(initialTasks)
  // Back / Forward shows this page from Next's cached copy, which can be from
  // before tasks were selected here or deleted on Home. Reload it on arrival,
  // and take the saved list whenever a fresh one comes in.
  const [loadedTasks, setLoadedTasks] = useState(initialTasks)
  if (initialTasks !== loadedTasks) {
    setLoadedTasks(initialTasks)
    setTasks(initialTasks)
  }
  useEffect(() => {
    router.refresh()
  }, [router])
  const [showModal, setShowModal] = useState(false)
  const [roomsSavedThisVisit, setRoomsSavedThisVisit] = useState<string[]>([])
  const [pending, setPending] = useState<Pending | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, startTransition] = useTransition()
  // The latest save, so Continue waits for it, and how to send it again if the
  // connection dropped while it was saving.
  const lastSave = useRef<Promise<unknown>>(Promise.resolve())
  const redoLastSave = useRef<() => Promise<unknown>>(() => Promise.resolve())

  function startSave(run: () => Promise<unknown>) {
    redoLastSave.current = run
    const save = run()
    save.catch(() => {}) // Continue handles a failed save; don't report it twice.
    lastSave.current = save
  }

  function persist(updated: TidyTask[]) {
    setTasks(updated)
    startSave(() => saveTasks(updated, draftId))
  }

  function addTask(task: TidyTask, differentRoom: boolean) {
    const withAnswer: TidyTask = { ...task, completed: true, ...(differentRoom ? { overlapAnswer: 'different_room' as const } : {}) }
    const linked = tasks.map((t) => (task.sameLaundryAsTaskId === t.id ? { ...t, sameLaundryAsTaskId: task.id } : t))
    persist([...linked, withAnswer])
  }

  function selectTask(taskId: string, differentRoom: boolean) {
    persist(
      tasks.map((t) =>
        t.id === taskId ? { ...t, completed: true, ...(differentRoom ? { overlapAnswer: 'different_room' as const } : {}) } : t
      )
    )
  }

  function handleSave(task: TidyTask) {
    setShowModal(false)
    setNotice(null)
    const decision = decideOverlap(task, selection)
    if (decision.kind === 'none') {
      addTask(task, false)
      if (decision.outOfScope) setNotice(`“${task.name}” isn’t part of your cleaning, so it’s added as a Tidy Task.`)
      return
    }
    setPending({ mode: 'add', task, decision })
  }

  function handleToggle(taskId: string) {
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return
    setNotice(null)
    if (task.completed) {
      persist(tasks.map((t) => (t.id === task.id ? { ...t, completed: false } : t)))
      return
    }
    const decision = decideOverlap(task, selection)
    if (decision.kind === 'none') selectTask(task.id, false)
    else setPending({ mode: 'select', task, decision })
  }

  function handleAddAddOn(key: AddOnKey) {
    const addOns = { ...selection.addOns, [key]: (selection.addOns[key] ?? 0) + 1 }
    setSelection((s) => ({ ...s, addOns }))
    setPending(null)
    setNotice('Added to your cleaning’s add-ons. You can change how many on the Add-ons step.')
    startSave(() => saveFullServiceStepAction({ addOns }, 'tasks'))
  }

  function handleRemoveTask(taskId: string) {
    persist(
      tasks.filter((t) => t.id !== taskId).map((t) => (t.sameLaundryAsTaskId === taskId ? { ...t, sameLaundryAsTaskId: null } : t))
    )
  }

  function handleContinue() {
    setError(null)
    startTransition(async () => {
      try {
        try {
          await lastSave.current
        } catch {
          // The last change didn't save (dropped connection): send it again first.
          startSave(redoLastSave.current)
          await lastSave.current
        }
        const result = await saveFullServiceStepAction({}, 'notes')
        if (result.error) setError(result.error)
        else router.push('/book/full-service/notes')
      } catch (err) {
        setError(actionErrorMessage(err))
      }
    })
  }

  const selectedCount = tasks.filter((t) => t.completed).length
  // Hide tasks this cleaning already covers and that can't be added anyway.
  // They stay on the saved list (Home still shows them); a selected one stays
  // visible so it can be deselected.
  const visibleTasks = tasks.filter((t) => t.completed || canAddWithCleaning(t, selection))

  return (
    <WizardFrame
      type={selection.type}
      step="tasks"
      backHref="/book/full-service/add-ons"
      title={ADD_TASKS_COPY.title}
      description={ADD_TASKS_COPY.body}
      onContinue={handleContinue}
      continueLabel={selectedCount > 0 ? 'Continue' : 'Skip'}
      pending={saving}
      error={error}
    >
      {notice && (
        <p role="status" className="text-xs text-slate-600 bg-slate-50 rounded-xl px-3 py-2 mb-4">
          {notice}
        </p>
      )}

      {visibleTasks.length === 0 && tasks.length > 0 ? (
        // Every saved task is one this cleaning already covers. A customer with
        // no saved tasks still gets TidyTaskList's "No tasks yet".
        <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
          <p className="font-semibold text-slate-900 mb-1">No tasks to add</p>
          <p className="text-sm text-slate-400">
            Your saved tasks are already included in your {FULL_SERVICE_LABEL[selection.type]}.
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-500 mb-2">Tap a task to add it to this booking.</p>
          <TidyTaskList tasks={visibleTasks} onToggle={handleToggle} />
        </>
      )}

      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="mt-4 w-full py-4 rounded-2xl text-white font-semibold text-base tracking-wide"
        style={{ backgroundColor: '#1a2332' }}
      >
        + Add Task
      </button>

      {showModal && (
        <AddTaskModal
          savedRooms={[...savedRooms, ...roomsSavedThisVisit]}
          existingRooms={Array.from(new Set(tasks.map((t) => t.room)))}
          existingTasks={tasks}
          onRoomSaved={(room) => setRoomsSavedThisVisit((prev) => (prev.includes(room) ? prev : [...prev, room]))}
          onRemoveTask={handleRemoveTask}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}

      {pending && (
        <OverlapPrompt
          decision={pending.decision}
          onAdd={(differentRoom) => {
            if (pending.mode === 'add') addTask(pending.task, differentRoom)
            else selectTask(pending.task.id, differentRoom)
            setPending(null)
          }}
          onAddAddOn={(key) => {
            // A brand-new task that's really an add-on isn't kept; a saved one stays on their list.
            handleAddAddOn(key)
          }}
          onClose={() => {
            // "Same room": not added, but a new task stays on their list
            // (unselected) so they can pick it again for another room.
            if (pending.mode === 'add') persist([...tasks, { ...pending.task, completed: false }])
            setPending(null)
          }}
        />
      )}
    </WizardFrame>
  )
}
