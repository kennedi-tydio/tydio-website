'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from '@/app/components/NavigationSpinner'
import AddTaskModal from '@/app/dashboard/AddTaskModal'
import { saveTasks } from '@/app/dashboard/actions'
import type { TidyTask } from '@/app/dashboard/types'
import { bookedTaskName } from '@/lib/laundry'
import CardPayForm from '../CardPayForm'
import { quoteTaskAdditionAction, requestTaskAdditionAction, type TaskAdditionQuoteView } from './actions'

type Props = {
  bookingId: string
  cleanerFirstName: string
  isRecurring: boolean
  draftId: string | null
  // Everything on the dashboard; tasks already on the booking aren't offered.
  dashboardTasks: TidyTask[]
  bookingTaskIds: string[]
  savedRooms: string[]
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} hr ${m} min` : `${h} hr`
}

function IconBack() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function AddTasksView({ bookingId, cleanerFirstName, isRecurring, draftId: initialDraftId, dashboardTasks, bookingTaskIds, savedRooms }: Props) {
  const router = useRouter()
  const [allTasks, setAllTasks] = useState<TidyTask[]>(dashboardTasks)
  const [draftId, setDraftId] = useState(initialDraftId)
  const [selected, setSelected] = useState<string[]>([])
  const [scope, setScope] = useState<'visit' | 'series'>('visit')
  const [showModal, setShowModal] = useState(false)
  const [quote, setQuote] = useState<TaskAdditionQuoteView | null>(null)
  // The selection the quote and error are for.
  const [quotedKey, setQuotedKey] = useState('')
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const quoteRun = useRef(0)

  const onBooking = new Set(bookingTaskIds)
  const offered = allTasks.filter((t) => !onBooking.has(t.id))

  // Re-priced on the server each time the selection changes; a slower earlier answer
  // never replaces a newer one.
  useEffect(() => {
    const run = ++quoteRun.current
    if (selected.length === 0) return
    const key = selected.join(',')
    const timer = setTimeout(async () => {
      const result = await quoteTaskAdditionAction(bookingId, selected)
      if (run !== quoteRun.current) return
      setQuotedKey(key)
      if ('error' in result) {
        setQuote(null)
        setQuoteError(result.error)
      } else {
        setQuote(result)
        setQuoteError(null)
        if (!result.offerSeries) setScope('visit')
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [bookingId, selected])

  function toggle(taskId: string) {
    setSelected((ids) => (ids.includes(taskId) ? ids.filter((id) => id !== taskId) : [...ids, taskId]))
  }

  // Nothing picked: nothing to show, whatever the last answer was.
  const hasSelection = selected.length > 0
  const isCurrent = hasSelection && quotedKey === selected.join(',')
  const shownQuote = isCurrent ? quote : null
  const shownError = isCurrent ? quoteError : null

  async function persist(tasks: TidyTask[]) {
    const id = await saveTasks(tasks, draftId)
    if (id) setDraftId(id)
  }

  // A new task goes on the dashboard like any other, and is picked for this booking once
  // it's saved there (the price is worked out from the saved dashboard).
  async function handleNewTask(task: TidyTask) {
    const linked = allTasks.map((t) => (task.sameLaundryAsTaskId === t.id ? { ...t, sameLaundryAsTaskId: task.id } : t))
    const updated = [...linked, task]
    setAllTasks(updated)
    setShowModal(false)
    await persist(updated)
    setSelected((ids) => [...ids, task.id])
  }

  function handleRemoveTask(taskId: string) {
    const updated = allTasks.filter((t) => t.id !== taskId).map((t) => (t.sameLaundryAsTaskId === taskId ? { ...t, sameLaundryAsTaskId: null } : t))
    setAllTasks(updated)
    setSelected((ids) => ids.filter((id) => id !== taskId))
    void persist(updated)
  }

  const rooms = [...new Set(allTasks.map((t) => t.room))]

  return (
    <main id="main-content" className="min-h-screen bg-white">
      <div className="max-w-md mx-auto px-5 py-6">
        <Link href={`/dashboard/bookings/${bookingId}`} className="inline-flex items-center gap-1 text-sm text-slate-500 mb-4">
          <IconBack /> Back to booking
        </Link>
        <h1 className="text-xl font-bold text-slate-900 mb-1">Add tasks</h1>
        <p className="text-sm text-slate-500 mb-5">
          Pick tasks from your dashboard. You&apos;ll pay for them now, and {cleanerFirstName} can accept or decline. If they decline, you&apos;re refunded in full and the
          tasks go back on your dashboard.
        </p>

        <fieldset className="mb-4">
          <legend className="text-sm font-semibold text-slate-900 mb-2">Your tasks</legend>
          {offered.length === 0 ? (
            <p className="text-sm text-slate-500 mb-2">You don&apos;t have any other tasks on your dashboard yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {offered.map((task) => (
                <label
                  key={task.id}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-sm ${selected.includes(task.id) ? 'border-brand' : 'border-slate-200'}`}
                >
                  <input type="checkbox" checked={selected.includes(task.id)} onChange={() => toggle(task.id)} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-slate-900">{bookedTaskName(task)}</span>
                    <span className="block text-xs text-slate-400">{task.room}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setShowModal(true)} className="mt-3 text-sm font-semibold text-brand underline">
            + Create a new task
          </button>
        </fieldset>

        {shownQuote?.offerSeries && isRecurring && (
          <fieldset className="mb-4">
            <legend className="text-sm font-semibold text-slate-900 mb-2">This is a recurring booking</legend>
            <div className="flex flex-col gap-2">
              <label className={`flex items-start gap-3 rounded-xl border px-3 py-3 text-sm ${scope === 'visit' ? 'border-brand' : 'border-slate-200'}`}>
                <input type="radio" name="scope" className="mt-0.5" checked={scope === 'visit'} onChange={() => setScope('visit')} />
                <span>
                  <span className="block text-slate-900">Just this visit</span>
                </span>
              </label>
              <label className={`flex items-start gap-3 rounded-xl border px-3 py-3 text-sm ${scope === 'series' ? 'border-brand' : 'border-slate-200'}`}>
                <input type="radio" name="scope" className="mt-0.5" checked={scope === 'series'} onChange={() => setScope('series')} />
                <span>
                  <span className="block text-slate-900">This and every future visit</span>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    You pay for this visit&apos;s tasks now. After that they&apos;re part of each visit&apos;s total, charged 3 days before it like the rest of the visit (about $
                    {(shownQuote.amountCents / 100).toFixed(2)} more per visit, before the card fee).
                  </span>
                </span>
              </label>
            </div>
          </fieldset>
        )}

        {hasSelection && !isCurrent && <p className="text-xs text-slate-500 mb-3">Working out the price…</p>}
        {shownError && (
          <p role="alert" className="text-xs text-red-600 mb-3">
            {shownError}
          </p>
        )}

        {shownQuote && (
          <>
            {shownQuote.addedMinutes > 0 && <p className="text-xs text-slate-500 mb-3">Adds about {formatMinutes(shownQuote.addedMinutes)} to the visit.</p>}
            <CardPayForm
              key={`${selected.join(',')}-${shownQuote.amountCents}`}
              cards={shownQuote.cards}
              defaultCardId={shownQuote.defaultCardId}
              itemLabel="Added tasks"
              amountCents={shownQuote.amountCents}
              onPay={(card, attemptId) => requestTaskAdditionAction(bookingId, selected, scope === 'series', card.id, card.chargeCents, attemptId)}
              onPaid={() => {
                router.push(`/dashboard/bookings/${bookingId}`)
                router.refresh()
              }}
            />
            <p className="text-xs text-slate-400 mt-2">Sent to {cleanerFirstName} as an additional task request once you pay.</p>
          </>
        )}
      </div>

      {showModal && (
        <AddTaskModal
          savedRooms={savedRooms}
          existingRooms={rooms}
          existingTasks={allTasks}
          onRemoveTask={handleRemoveTask}
          onSave={handleNewTask}
          onClose={() => setShowModal(false)}
        />
      )}
    </main>
  )
}
