'use client'

import { useState } from 'react'
import type { TidyTask } from '@/app/dashboard/types'
import { bookedTaskName, formatVisitDuration } from '@/lib/laundry'
import PetTaskDetails from '@/app/components/PetTaskDetails'

// A request to add tasks to a booking (lib/bookingTaskAdditions), shown in both message
// threads as an updated booking request: the whole booking, with the added tasks, the
// extra money and the extra time picked out. The Tidy Pro accepts or declines it; the
// customer, who has already paid, can cancel it while it's waiting.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatDateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`
}

function clock(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24
  const m = totalMinutes % 60
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function startMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function money(value: number): string {
  return `$${value.toFixed(2)}`
}

type Result = { success: true } | { error: string }

export type UpdatedBookingRequest = {
  tasks: TidyTask[]
  // What the added tasks add to the money line: the Tidy Pro's pay, or the customer's charge.
  extraAmount: number
  newDurationMinutes: number
  applyToSeries: boolean
}

export default function UpdatedBookingRequestCard({
  request,
  viewer,
  otherFirstName,
  photoUrls = {},
  currentTasks,
  currentAmount,
  currentDurationMinutes,
  scheduledDate,
  scheduledTime,
  onAccept,
  onDecline,
  onCancel,
}: {
  request: UpdatedBookingRequest
  viewer: 'tidypro' | 'customer'
  // The other side: the customer's name for the Tidy Pro, the Tidy Pro's for the customer.
  otherFirstName: string
  photoUrls?: Record<string, string>
  currentTasks: TidyTask[]
  // The Tidy Pro's payout, or the customer's total, before the added tasks.
  currentAmount: number
  currentDurationMinutes: number
  scheduledDate: string | null
  scheduledTime: string | null
  onAccept?: () => Promise<Result>
  onDecline?: () => Promise<Result>
  onCancel?: () => Promise<Result>
}) {
  const [working, setWorking] = useState<'accept' | 'decline' | 'cancel' | null>(null)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const plural = request.tasks.length !== 1
  const extraMinutes = Math.max(0, request.newDurationMinutes - currentDurationMinutes)
  const isPro = viewer === 'tidypro'

  async function run(kind: 'accept' | 'decline' | 'cancel', action?: () => Promise<Result>) {
    if (!action) return
    setWorking(kind)
    setError(null)
    const result = await action()
    setWorking(null)
    if ('error' in result) setError(result.error)
  }

  return (
    <section aria-label="Updated booking request" className="mt-4">
      <div
        className={`rounded-2xl px-4 py-3 mb-4 max-w-[85%] text-sm leading-relaxed text-white ${isPro ? 'rounded-bl-sm mr-auto' : 'rounded-br-sm ml-auto'}`}
        style={{ backgroundColor: isPro ? '#1a2332' : 'var(--color-brand)' }}
      >
        {isPro
          ? `${otherFirstName} would like to add ${plural ? 'tasks' : 'a task'} to ${request.applyToSeries ? 'this visit and every future visit' : 'this booking'}. Please review and confirm.`
          : `You asked to add ${plural ? 'tasks' : 'a task'} to ${request.applyToSeries ? 'this visit and every future visit' : 'this booking'}. You'll be notified when ${otherFirstName} accepts.`}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
        <p className="text-sm font-bold mb-3" style={{ color: 'var(--color-brand)' }}>
          Updated Booking Request
        </p>

        {request.applyToSeries && (
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-brand)' }}>
            For this visit and every future visit
          </p>
        )}

        {scheduledDate && <p className="text-sm font-semibold text-slate-900">{formatDateLabel(scheduledDate)}</p>}
        {scheduledTime && (
          <p className="text-sm text-slate-500">
            {clock(startMinutes(scheduledTime))} -{' '}
            {extraMinutes > 0 ? (
              <>
                <span className="line-through text-slate-400">{clock(startMinutes(scheduledTime) + currentDurationMinutes)}</span>{' '}
                <span className="font-bold text-slate-900">{clock(startMinutes(scheduledTime) + request.newDurationMinutes)}</span>
              </>
            ) : (
              clock(startMinutes(scheduledTime) + request.newDurationMinutes)
            )}
          </p>
        )}

        <p className="text-sm font-bold text-slate-900 mt-3">Tasks</p>
        {currentTasks.map((task) => (
          <p key={task.id} className="text-sm text-slate-600">
            {bookedTaskName(task)}
          </p>
        ))}
        {request.tasks.map((task) => (
          <div key={task.id} className="flex items-start justify-between gap-2 rounded-lg bg-brand/10 border-l-4 border-brand px-2.5 py-1.5 my-1">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">{bookedTaskName(task)}</p>
              {task.room && <p className="text-xs text-slate-500">{task.room}</p>}
              {task.notes && <p className="text-xs text-slate-500">{task.notes}</p>}
            </div>
            <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wide text-white bg-brand rounded-full px-1.5 py-0.5">New</span>
          </div>
        ))}
        <PetTaskDetails tasks={request.tasks} photoUrls={photoUrls} className="mt-2" />

        <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 mt-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Visit length</span>
            <span className="text-slate-900">
              {formatVisitDuration(currentDurationMinutes)} → <span className="font-bold">{formatVisitDuration(request.newDurationMinutes)}</span>
              {extraMinutes > 0 && (
                <span className="ml-1.5 text-xs font-bold" style={{ color: 'var(--color-brand)' }}>
                  +{formatVisitDuration(extraMinutes)}
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">{isPro ? 'Your payout' : 'Total'}</span>
            <span className="text-slate-900">
              {money(currentAmount)} → <span className="font-bold">{money(currentAmount + request.extraAmount)}</span>
              <span className="ml-1.5 text-xs font-bold" style={{ color: 'var(--color-brand)' }}>
                +{money(request.extraAmount)}
              </span>
            </span>
          </div>
        </div>

        <p className="text-xs text-slate-500 mt-2">
          {isPro
            ? `${otherFirstName} has already paid for ${plural ? 'these' : 'this'}. If you decline, they're refunded and the booking stays as it was.`
            : `You've paid the ${money(request.extraAmount)}. If ${otherFirstName} declines or doesn't answer before the booking starts, you're refunded in full.`}
        </p>

        {error && (
          <p role="alert" className="text-xs text-red-600 mt-2">
            {error}
          </p>
        )}

        {isPro ? (
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => run('decline', onDecline)}
              disabled={working !== null}
              className="flex-1 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600 disabled:opacity-50"
            >
              {working === 'decline' ? 'Declining…' : 'Decline'}
            </button>
            <button
              type="button"
              onClick={() => run('accept', onAccept)}
              disabled={working !== null}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand disabled:opacity-50"
            >
              {working === 'accept' ? 'Accepting…' : 'Accept'}
            </button>
          </div>
        ) : confirmingCancel ? (
          <div className="mt-3">
            <p className="text-xs text-slate-600 mb-2">
              Cancel {plural ? 'these tasks' : 'this task'}? You&apos;ll be refunded in full, and {plural ? 'they go' : 'it goes'} back on your dashboard.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmingCancel(false)}
                disabled={working !== null}
                className="flex-1 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600 disabled:opacity-50"
              >
                Keep it
              </button>
              <button
                type="button"
                onClick={() => run('cancel', onCancel)}
                disabled={working !== null}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-sm font-semibold text-white disabled:opacity-60"
              >
                {working === 'cancel' ? 'Canceling…' : 'Cancel request'}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingCancel(true)}
            className="w-full mt-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600"
          >
            Cancel request
          </button>
        )}
      </div>
    </section>
  )
}
