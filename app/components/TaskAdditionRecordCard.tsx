'use client'

import { useState } from 'react'
import type { TidyTask } from '@/app/dashboard/types'
import { bookedTaskName } from '@/lib/laundry'

// A request to add tasks to a booking, shown in the message thread under the original
// booking request: what was added, what it cost or pays, and how it was answered. The
// customer sees every one; the Tidy Pro sees answered ones here (an open one gets the
// full Updated Booking Request card instead).
export type TaskAdditionRecordView = {
  id: string
  tasks: TidyTask[]
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled' | 'removed'
  // What the viewer sees as the money line: the customer's charge, or the Tidy Pro's pay.
  amount: number
  applyToSeries: boolean
  // The visit length if the tasks are accepted.
  newDurationMinutes?: number
}

export default function TaskAdditionRecordCard({
  record,
  viewer,
  otherFirstName,
  onCancel,
}: {
  record: TaskAdditionRecordView
  viewer: 'customer' | 'tidypro'
  // The other side, e.g. the Tidy Pro's name for the customer.
  otherFirstName: string
  // The customer taking back a request still waiting on the Tidy Pro.
  onCancel?: () => Promise<{ success: true } | { error: string }>
}) {
  const plural = record.tasks.length !== 1
  const [confirming, setConfirming] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCancel() {
    if (!onCancel) return
    setWorking(true)
    setError(null)
    const result = await onCancel()
    setWorking(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setConfirming(false)
  }
  const statusLine =
    record.status === 'pending'
      ? { text: `Waiting for ${otherFirstName} to accept`, className: 'text-slate-500' }
      : record.status === 'accepted'
        ? { text: viewer === 'customer' ? `${otherFirstName} accepted. Your booking is updated.` : 'You accepted. The booking is updated.', className: 'text-green-700' }
        : record.status === 'declined'
          ? { text: viewer === 'customer' ? `${otherFirstName} declined. You were refunded in full.` : 'You declined. The customer was refunded.', className: 'text-red-600' }
          : record.status === 'removed'
            ? { text: 'Removed from the booking.', className: 'text-slate-500' }
            : record.status === 'cancelled'
              ? { text: viewer === 'customer' ? 'Canceled. You were refunded in full.' : 'Canceled. The customer was refunded.', className: 'text-slate-500' }
            : { text: viewer === 'customer' ? 'Not answered in time. You were refunded in full.' : 'Not answered in time. The customer was refunded.', className: 'text-slate-500' }

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 mt-4">
      <p className="text-sm font-bold mb-2" style={{ color: 'var(--color-brand)' }}>
        Added Task{plural ? 's' : ''} Request
      </p>
      {record.applyToSeries && <p className="text-xs text-slate-500 mb-2">For this visit and every future visit</p>}
      {record.tasks.map((task) => (
        <div key={task.id} className="flex items-start justify-between gap-2 rounded-lg bg-brand/10 border-l-4 border-brand px-2.5 py-1.5 my-1">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">{bookedTaskName(task)}</p>
            {task.room && <p className="text-xs text-slate-500">{task.room}</p>}
          </div>
          <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wide text-white bg-brand rounded-full px-1.5 py-0.5">New</span>
        </div>
      ))}
      <div className="flex items-center justify-between border-t border-slate-200 mt-3 pt-2.5 text-sm">
        <span className="font-semibold text-slate-700">{viewer === 'customer' ? 'You paid' : 'Extra pay'}</span>
        <span className="font-bold" style={{ color: 'var(--color-brand)' }}>
          +${record.amount.toFixed(2)}
        </span>
      </div>
      {/* An answered request gets its own bubble under the card (TaskAdditionOutcomeBubble). */}
      {record.status === 'pending' && <p className={`text-xs font-semibold mt-2 ${statusLine.className}`}>{statusLine.text}</p>}

      {record.status === 'pending' && onCancel && (
        <div className="mt-3">
          {confirming ? (
            <>
              <p className="text-xs text-slate-600 mb-2">
                Cancel {plural ? 'these tasks' : 'this task'}? You&apos;ll be refunded in full, and {plural ? 'they go' : 'it goes'} back on your dashboard.
              </p>
              {error && (
                <p role="alert" className="text-xs text-red-600 mb-2">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={working}
                  className="flex-1 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600 disabled:opacity-50"
                >
                  Keep it
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={working}
                  className="flex-1 py-2 rounded-xl bg-red-600 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {working ? 'Canceling…' : 'Cancel request'}
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="w-full py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600"
            >
              Cancel request
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// The answer to a request to add tasks, as a chat bubble under its card, the same way the
// original booking request's answer sits under it: from the Tidy Pro (dark, left) or from
// the customer (teal, right).
export function TaskAdditionOutcomeBubble({
  status,
  viewer,
  otherFirstName,
}: {
  status: TaskAdditionRecordView['status']
  viewer: 'customer' | 'tidypro'
  otherFirstName: string
}) {
  if (status === 'pending') return null
  const isCustomer = viewer === 'customer'
  // Who the bubble comes from: the Tidy Pro answered it, or the customer canceled it.
  const fromTidyPro = status !== 'cancelled'
  const text = isCustomer
    ? status === 'accepted'
      ? `${otherFirstName} accepted the booking modification`
      : status === 'declined'
        ? `${otherFirstName} declined the booking modification. You were refunded in full.`
        : status === 'expired'
          ? `${otherFirstName} didn't answer the booking modification before the booking started. You were refunded in full.`
          : status === 'removed'
            ? 'The booking modification was removed, and you were refunded.'
            : 'You canceled the booking modification. You were refunded in full.'
    : status === 'accepted'
      ? 'You accepted the booking modification'
      : status === 'declined'
        ? 'You declined the booking modification'
        : status === 'expired'
          ? 'The booking modification expired before you answered'
          : status === 'removed'
            ? 'The booking modification was removed'
            : `${otherFirstName} canceled the booking modification`
  // The viewer's own side is on the right in their brand color.
  const mine = isCustomer ? !fromTidyPro : fromTidyPro
  return (
    <div
      className={`rounded-2xl px-4 py-3 mt-4 max-w-[85%] text-sm leading-relaxed text-white ${mine ? 'rounded-br-sm ml-auto' : 'rounded-bl-sm mr-auto'}`}
      style={{ backgroundColor: mine ? 'var(--color-brand)' : '#1a2332' }}
    >
      {text}
    </div>
  )
}
