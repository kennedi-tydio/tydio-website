'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from '@/app/components/NavigationSpinner'
import type { TidyTask } from '@/app/dashboard/types'
import PetTaskDetails from '@/app/components/PetTaskDetails'
import { cancelAcceptedBookingAction, cancelRecurringSeriesAction, markOnTheWayAction, proposeStartTimeAction } from '@/app/pro/messages/[bookingId]/actions'
import CancelReasonSheet from '@/app/components/CancelReasonSheet'
import CancelScopeSheet from '@/app/components/CancelScopeSheet'
import { occurrenceLabel } from '@/lib/recurrence'
import { CLEANER_CANCEL_REASONS, type Cancellation } from '@/lib/cancellationReasons'
import TimeSelect from '@/app/components/form/TimeSelect'
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
import ReportCustomerButton from './ReportCustomerButton'
import FullServiceSummary, { type SummaryLine } from '@/app/components/FullServiceSummary'
import type { FullServiceSelection } from '@/lib/fullService'
import type { BookingPhotoPair } from '@/lib/portfolioItems'
import { TASK_PHOTO_RETENTION_DAYS } from '@/lib/taskPhotoRetention'
import AddToProfileModal from './AddToProfileModal'

type Props = {
  // An accepted booking that hasn't started yet shows the same summary,
  // worded for the future and without the review / tip parts.
  variant: 'past' | 'upcoming'
  bookingId: string
  customerName: string
  // The booking's Standard / Deep Cleaning: what to clean and what matters most.
  fullService?: { selection: FullServiceSelection; lines: SummaryLine[] } | null
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
  // A visit of a recurring booking: changing its time changes only this visit.
  isRecurring?: boolean
  // A finished booking's before/after pairs, while its photos are still kept.
  profilePhotoPairs?: BookingPhotoPair[]
}

export default function PastBookingDetailView({
  variant,
  bookingId,
  customerName,
  fullService = null,
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
  isRecurring = false,
  profilePhotoPairs = [],
}: Props) {
  const router = useRouter()
  const isUpcoming = variant === 'upcoming'
  const [choosingProfilePhotos, setChoosingProfilePhotos] = useState(false)
  const pairsToAdd = isUpcoming ? [] : profilePhotoPairs.filter((p) => !p.onProfile)
  const pairsOnProfile = profilePhotoPairs.length - pairsToAdd.length
  const canStartBooking = useStartBookingWindow(startsAtMs) && isUpcoming
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  // Suggesting a new start time for just this booking (one visit, if it's recurring). It
  // goes to the chat for the customer to approve, same as from the message thread.
  const [changingTime, setChangingTime] = useState(false)
  const [newTime, setNewTime] = useState(scheduledTime?.slice(0, 5) ?? '09:00')
  const [proposing, setProposing] = useState(false)
  const [proposeError, setProposeError] = useState<string | null>(null)

  // Canceling an upcoming booking. A recurring visit asks first: just this visit, or the
  // whole series. Same rules as canceling from the chat.
  const [choosingScope, setChoosingScope] = useState(false)
  const [cancelScope, setCancelScope] = useState<'visit' | 'series' | null>(null)
  const firstName = customerName.split(' ')[0]

  async function handleCancelConfirmed(cancellation: Cancellation): Promise<string | null> {
    const result =
      cancelScope === 'series' ? await cancelRecurringSeriesAction(bookingId, cancellation) : await cancelAcceptedBookingAction(bookingId, cancellation)
    if ('error' in result) return result.error
    setCancelScope(null)
    router.push('/pro/bookings')
    router.refresh()
    return null
  }

  async function handleProposeTime() {
    setProposing(true)
    setProposeError(null)
    const result = await proposeStartTimeAction(bookingId, newTime)
    if ('error' in result) {
      setProposing(false)
      setProposeError(result.error)
      return
    }
    router.push(`/pro/messages/${bookingId}`)
  }

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
    <main id="main-content" className="min-h-svh bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-10 max-w-sm mx-auto w-full">
        <div className="flex items-center justify-between mb-4">
          <Link
            href="/pro/bookings"
            aria-label="Back"
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-2"
          >
            <IconBack />
          </Link>
          <ReportCustomerButton bookingId={bookingId} />
        </div>

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

        {fullService && (
          <FullServiceSummary selection={fullService.selection} lines={fullService.lines} showPrices={false} className="mb-5" />
        )}

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

        {pairsToAdd.length > 0 && (
          <div className="border-t border-slate-100 pt-5 mb-5">
            <p className="text-sm font-bold mb-1" style={{ color: 'var(--color-brand)' }}>
              Show off your work
            </p>
            <p className="text-xs text-slate-500 mb-3">
              {pairsToAdd.length === 1 ? 'You have 1 before and after pair' : `You have ${pairsToAdd.length} before and after pairs`}{' '}
              from this booking{pairsOnProfile > 0 ? ' not yet on your profile' : ''}. Photos are deleted{' '}
              {TASK_PHOTO_RETENTION_DAYS} days after the booking ends, so add the ones you want before then.
            </p>
            <button
              type="button"
              onClick={() => setChoosingProfilePhotos(true)}
              className="w-full py-3 rounded-2xl text-sm font-semibold text-white bg-brand"
            >
              Add photos to your profile
            </button>
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

        {isUpcoming && !canStartBooking && (
          <div className="mb-5">
            {changingTime ? (
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-bold text-slate-900 mb-1">New start time</p>
                <p className="text-xs text-slate-500 mb-3">
                  {isRecurring
                    ? `Only this visit${scheduledDate ? ` on ${formatDateLabel(scheduledDate)}` : ''} changes. The rest of the recurring booking keeps its time. `
                    : ''}
                  {customerName.split(' ')[0]} gets it in your chat to approve, and the booking keeps its current time until they do.
                </p>
                <TimeSelect value={newTime} onChange={setNewTime} className="w-full" ariaLabel="New start time" />
                <p className="text-xs text-slate-500 mt-2">
                  {`${formatTimeRange(newTime, durationMinutes)}${scheduledDate ? ` on ${formatDateLabel(scheduledDate)}` : ''}`}
                </p>
                {proposeError && (
                  <p role="alert" className="text-xs text-red-600 mt-2">
                    {proposeError}
                  </p>
                )}
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setChangingTime(false)
                      setProposeError(null)
                    }}
                    disabled={proposing}
                    className="flex-1 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600 disabled:opacity-50"
                  >
                    Never mind
                  </button>
                  <button
                    type="button"
                    onClick={handleProposeTime}
                    disabled={proposing}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand disabled:opacity-50"
                  >
                    {proposing ? 'Sending…' : 'Send to customer'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setChangingTime(true)}
                className="w-full py-3 rounded-2xl bg-white border border-slate-200 text-sm font-semibold text-slate-700"
              >
                {isRecurring ? 'Change start time for this visit' : 'Change start time'}
              </button>
            )}
          </div>
        )}

        {startError && <p role="alert" className="text-xs text-red-600 mb-3">{startError}</p>}

        <div className="flex flex-col gap-3">
          {canStartBooking && (
            <button
              type="button"
              onClick={handleStartBooking}
              disabled={starting}
              className="w-full py-3.5 rounded-2xl text-center font-semibold text-sm text-white disabled:opacity-60 bg-brand"
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
            style={{ backgroundColor: '#1a2332' }}
          >
            Send a message
          </Link>
          {isUpcoming && (
            <button
              type="button"
              onClick={() => (isRecurring ? setChoosingScope(true) : setCancelScope('visit'))}
              className="w-full py-3 rounded-2xl border border-red-600 text-red-600 text-sm font-semibold"
            >
              Cancel
            </button>
          )}
        </div>
        {choosingScope && (
          <CancelScopeSheet
            visitLabel={scheduledDate && scheduledTime ? occurrenceLabel(scheduledDate, scheduledTime.slice(0, 5)) : null}
            onChoose={(scope) => {
              setChoosingScope(false)
              setCancelScope(scope)
            }}
            onClose={() => setChoosingScope(false)}
          />
        )}
        {cancelScope && (
          <CancelReasonSheet
            reasons={CLEANER_CANCEL_REASONS}
            warning={
              cancelScope === 'series'
                ? `You'll stop getting ${firstName}'s recurring visits, and every visit of it already on your schedule is canceled. ${firstName} will be asked to choose another Tidy Pro.`
                : isRecurring
                  ? `${firstName} is refunded for this visit and can choose another Tidy Pro for it. Their other visits stay with you.`
                  : `${firstName} will be asked to choose another Tidy Pro.`
            }
            confirmLabel={cancelScope === 'series' ? 'Cancel recurring booking' : isRecurring ? 'Cancel this visit' : 'Cancel booking'}
            onConfirm={handleCancelConfirmed}
            onClose={() => setCancelScope(null)}
          />
        )}
        {choosingProfilePhotos && (
          <AddToProfileModal
            bookingId={bookingId}
            pairs={profilePhotoPairs}
            onAdded={() => {
              setChoosingProfilePhotos(false)
              router.refresh()
            }}
            onClose={() => setChoosingProfilePhotos(false)}
          />
        )}
      </div>
    </main>
  )
}
