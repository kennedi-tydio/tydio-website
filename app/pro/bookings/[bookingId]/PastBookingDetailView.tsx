'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from '@/app/components/NavigationSpinner'
import type { TidyTask } from '@/app/dashboard/types'
import PetTaskDetails from '@/app/components/PetTaskDetails'
import { markOnTheWayAction } from '@/app/pro/messages/[bookingId]/actions'
import { useStartBookingWindow } from '@/app/pro/useStartBookingWindow'
import {
  CategoryIcon,
  IconBack,
  formatDateLabel,
  formatTimeRange,
  groupByCategory,
  type ProBookingTaskRow,
} from './TaskListView'
import { formatVisitDuration } from '@/lib/laundry'

type Props = {
  // An accepted booking that hasn't started yet shows the same summary,
  // worded for the future and without the review / tip parts.
  variant: 'past' | 'upcoming'
  bookingId: string
  customerName: string
  scheduledDate: string | null
  scheduledTime: string | null
  // The real start instant — only needed for an upcoming booking's
  // "Start booking" button.
  startsAtMs?: number | null
  durationMinutes: number
  addressLabel: string | null
  addressArea: string | null
  tasks: ProBookingTaskRow[]
  // Pet enclosure / litter box details and signed photo URLs.
  petTasks?: TidyTask[]
  photoUrls?: Record<string, string>
  suppliesProvided: boolean
  pets: string | null
  notes: string | null
  bookingEarnings: number
  tipAmount: number
  canLeaveReview: boolean
}

export default function PastBookingDetailView({
  variant,
  bookingId,
  customerName,
  scheduledDate,
  scheduledTime,
  startsAtMs = null,
  durationMinutes,
  addressLabel,
  addressArea,
  tasks,
  petTasks = [],
  photoUrls = {},
  suppliesProvided,
  pets,
  notes,
  bookingEarnings,
  tipAmount,
  canLeaveReview,
}: Props) {
  const router = useRouter()
  const isUpcoming = variant === 'upcoming'
  const canStartBooking = useStartBookingWindow(startsAtMs) && isUpcoming
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  async function handleStartBooking() {
    setStarting(true)
    setStartError(null)
    const result = await markOnTheWayAction(bookingId)
    if ('error' in result) {
      setStarting(false)
      setStartError(result.error)
      return
    }
    router.push(`/pro/bookings/${bookingId}`)
    router.refresh()
  }

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-10 max-w-sm mx-auto w-full">
        <Link
          href="/pro/bookings"
          aria-label="Back"
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-2 mb-4"
        >
          <IconBack />
        </Link>

        <p className="text-xs font-semibold text-slate-400 mb-1">{isUpcoming ? 'Upcoming Booking' : 'Past Booking'}</p>
        <h1 className="text-2xl font-bold text-slate-900">{customerName}</h1>
        <Link
          href={`/pro/bookings/${bookingId}/customer`}
          className="inline-block text-sm font-semibold mb-4"
          style={{ color: 'var(--color-brand)' }}
        >
          View profile
        </Link>

        <div className="flex items-stretch gap-4 mb-6">
          <div>
            {scheduledDate && <p className="text-sm font-bold text-slate-900">{formatDateLabel(scheduledDate)}</p>}
            {scheduledTime && <p className="text-xs text-slate-500 mt-0.5">{formatTimeRange(scheduledTime, durationMinutes)} · Est. visit {formatVisitDuration(durationMinutes)}</p>}
          </div>
          {addressLabel && (
            <div className="border-l border-slate-200 pl-4 min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{addressLabel}</p>
              {addressArea && <p className="text-xs text-slate-500 mt-0.5">{addressArea}</p>}
            </div>
          )}
        </div>

        <p className="text-sm font-bold mb-3" style={{ color: 'var(--color-brand)' }}>
          Tasks
        </p>
        <div className="flex flex-col gap-3 mb-4">
          {groupByCategory(tasks).map((group) => (
            <div key={group.category}>
              <div className="flex items-center gap-2 mb-1">
                <CategoryIcon category={group.category} />
                <p className="text-sm font-bold text-slate-900">{group.category}</p>
              </div>
              {group.tasks.map((task) => (
                <p key={task.id} className="text-sm text-slate-600 pl-6">
                  {task.task_name}
                </p>
              ))}
            </div>
          ))}
        </div>
        <PetTaskDetails tasks={petTasks} photoUrls={photoUrls} className="mb-4" />
        <p className="text-xs text-slate-600 mb-5">
          {isUpcoming
            ? suppliesProvided
              ? 'Customer will provide the cleaning supplies'
              : 'Cleaning supplies will be provided'
            : suppliesProvided
              ? 'Customer provided the cleaning supplies'
              : 'Cleaning supplies provided'}
        </p>

        {(pets || notes) && (
          <div className="border-t border-slate-100 pt-5 mb-5">
            <p className="text-sm font-bold mb-3" style={{ color: 'var(--color-brand)' }}>
              Additional Details
            </p>
            {pets && (
              <div className="mb-3">
                <p className="text-sm font-medium text-slate-900">Pets</p>
                <p className="text-sm text-slate-400 whitespace-pre-line">{pets}</p>
              </div>
            )}
            {notes && (
              <div>
                <p className="text-sm font-medium text-slate-900">Notes</p>
                <p className="text-sm text-slate-400">{notes}</p>
              </div>
            )}
          </div>
        )}

        <div className="border-t border-slate-100 pt-5 mb-8">
          <p className="text-sm font-bold mb-3" style={{ color: 'var(--color-brand)' }}>
            Order Summary
          </p>
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm text-slate-800">
              <span>Booking earnings</span>
              <span>${bookingEarnings.toFixed(2)}</span>
            </div>
            {!isUpcoming && (
              <div className="flex items-center justify-between text-sm text-slate-800">
                <span>Tip amount</span>
                <span>${tipAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm font-bold text-slate-900">
              <span>Total</span>
              <span>${(bookingEarnings + tipAmount).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {startError && <p role="alert" className="text-xs text-red-600 mb-3">{startError}</p>}

        <div className="flex flex-col gap-3">
          {canStartBooking && (
            <button
              type="button"
              onClick={handleStartBooking}
              disabled={starting}
              className="w-full py-3.5 rounded-2xl text-center font-semibold text-sm text-white disabled:opacity-60"
              style={{ backgroundColor: '#1a2332' }}
            >
              {starting ? 'Starting…' : 'Start booking'}
            </button>
          )}
          {!isUpcoming && (
            <Link
              href={`/pro/bookings/${bookingId}/review`}
              className="block w-full py-3 rounded-xl text-center bg-slate-100 text-slate-500 font-semibold text-sm"
            >
              {canLeaveReview ? 'Leave a review' : 'View review'}
            </Link>
          )}
          <Link
            href={`/pro/messages/${bookingId}`}
            className="block w-full py-3.5 rounded-2xl text-center font-semibold text-sm text-white"
            style={{ backgroundColor: 'var(--color-brand)' }}
          >
            Send a message
          </Link>
        </div>
      </div>
    </main>
  )
}
