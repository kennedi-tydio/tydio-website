'use client'

import { useState } from 'react'
import { useRouter } from '@/app/components/NavigationSpinner'
import Link from 'next/link'
import type { BookingTaskRow } from './CurrentBookingView'
import type { TidyTask } from '@/app/dashboard/types'
import BookingSummary, { type OrderLine } from './BookingSummary'
import ReportNoShowButton from './ReportNoShowButton'
import ReportTidyProSheet from './ReportTidyProSheet'

function IconFlag() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22V4" />
      <path d="M4 4h13l-2.5 4L17 12H4" />
    </svg>
  )
}
import CancelReasonSheet from '@/app/components/CancelReasonSheet'
import CancelScopeSheet from '@/app/components/CancelScopeSheet'
import TaskAdditionRecordCard from '@/app/components/TaskAdditionRecordCard'
import { cancelTaskAdditionAction } from '@/app/dashboard/messages/[bookingId]/actions'
import { occurrenceLabel } from '@/lib/recurrence'
import { cancelRecurringBookingAction } from '../recurring/actions'
import { CUSTOMER_CANCEL_REASONS, type Cancellation } from '@/lib/cancellationReasons'

type Props = {
  bookingId: string
  cleanerName: string
  scheduledDate: string | null
  scheduledTime: string | null
  durationMinutes: number
  addressLabel: string | null
  addressLine: string | null
  tasks: BookingTaskRow[]
  suppliesProvided: boolean
  pets: string | null
  notes: string | null
  orderLines: OrderLine[]
  totalPrice: number
  // Set when canceling now would only refund this much (see isLateCancellation).
  lateCancelRefund: number | null
  // When a no-show can be reported (see noShowReportableAt).
  noShowReportableAtMs: number | null
  // A recurring visit not charged yet: when it will be (see lib/recurringPayments).
  chargeDateLabel?: string | null
  // Its start time has come (the Tidy Pro hasn't headed over yet), so it's active.
  started?: boolean
  // A visit of a recurring booking: Cancel asks whether it's this visit or the whole series.
  recurringSeriesId?: string | null
  cancelBookingRequestAction: (bookingId: string, cancellation: Cancellation, acceptLateFee?: boolean) => Promise<{ success: true } | { error: string }>
  // Adding dashboard tasks to this booking (lib/bookingTaskAdditions): whether it can be
  // done now, why not if not, and a request already waiting on the Tidy Pro.
  taskAddition?: {
    canAdd: boolean
    blockedReason: string | null
    pending: { id: string; tasks: TidyTask[]; taskNames: string[]; charge: number; applyToSeries: boolean } | null
  }
}

export default function UpcomingBookingDetailView({
  bookingId,
  cleanerName,
  scheduledDate,
  scheduledTime,
  durationMinutes,
  addressLabel,
  addressLine,
  tasks,
  suppliesProvided,
  pets,
  notes,
  orderLines,
  totalPrice,
  lateCancelRefund,
  noShowReportableAtMs,
  cancelBookingRequestAction,
  chargeDateLabel = null,
  taskAddition,
  started = false,
  recurringSeriesId = null,
}: Props) {
  const router = useRouter()
  const [askingReason, setAskingReason] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [choosingScope, setChoosingScope] = useState(false)
  const [cancelScope, setCancelScope] = useState<'visit' | 'series' | null>(null)

  async function handleCancelSeries(cancellation: Cancellation): Promise<string | null> {
    if (!recurringSeriesId) return 'This booking isn’t recurring.'
    const result = await cancelRecurringBookingAction(recurringSeriesId, cancellation)
    if ('error' in result) return result.error
    router.push('/dashboard/bookings')
    return null
  }

  async function handleCancel(cancellation: Cancellation): Promise<string | null> {
    const result = await cancelBookingRequestAction(bookingId, cancellation, lateCancelRefund != null)
    if ('error' in result) return result.error
    router.push('/dashboard/bookings')
    return null
  }

  return (
    <BookingSummary
      eyebrow={started ? 'Active Booking' : 'Upcoming Booking'}
      // Once it's started, the customer may need to report the Tidy Pro (e.g. a no-show);
      // "Cleaner didn't show up" files a no-show once that's allowed (reportTidyProAction).
      headerAction={
        started ? (
          <button
            type="button"
            onClick={() => setShowReport(true)}
            aria-label="Report Tidy Pro"
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100"
          >
            <IconFlag />
          </button>
        ) : undefined
      }
      cleanerName={cleanerName}
      scheduledDate={scheduledDate}
      scheduledTime={scheduledTime}
      durationMinutes={durationMinutes}
      addressLabel={addressLabel}
      addressSubline={addressLine}
      tasks={tasks}
      suppliesNote={suppliesProvided ? "You'll provide the cleaning supplies" : 'Cleaning supplies will be provided'}
      pets={pets}
      notes={notes}
      orderLines={orderLines}
      totalPrice={totalPrice}
    >
      {/* The same card as in the chat, so it can be canceled from here too. */}
      {taskAddition?.pending && (
        <div className="-mt-4 mb-3">
          <TaskAdditionRecordCard
            record={{
              id: taskAddition.pending.id,
              tasks: taskAddition.pending.tasks,
              status: 'pending',
              amount: taskAddition.pending.charge,
              applyToSeries: taskAddition.pending.applyToSeries,
            }}
            viewer="customer"
            otherFirstName={cleanerName.split(' ')[0]}
            onCancel={async () => {
              const result = await cancelTaskAdditionAction(taskAddition.pending!.id)
              if ('success' in result) router.refresh()
              return result
            }}
          />
          <p className="text-xs text-slate-500 mt-2">
            If {cleanerName.split(' ')[0]} declines, or doesn&apos;t answer before the booking starts, you&apos;re refunded in full and the tasks go back on
            your dashboard.
          </p>
        </div>
      )}
      {showReport && <ReportTidyProSheet bookingId={bookingId} noShowReportableAtMs={noShowReportableAtMs} onClose={() => setShowReport(false)} />}
      <ReportNoShowButton bookingId={bookingId} cleanerFirstName={cleanerName.split(' ')[0]} reportableAtMs={noShowReportableAtMs} />
      {chargeDateLabel && (
        <p className="text-xs text-slate-500 mb-3">
          Recurring visit. We&apos;ll charge your card on {chargeDateLabel}, 3 days before it starts. Canceling before then costs nothing.
        </p>
      )}
      {lateCancelRefund != null && (
        <p className="text-xs text-slate-500 mb-3">
          Your booking is less than 2 hours away, so canceling refunds 50% (${lateCancelRefund.toFixed(2)}).
        </p>
      )}

      <div className="flex flex-col gap-3">
        {taskAddition?.canAdd && (
          <Link
            href={`/dashboard/bookings/${bookingId}/add-tasks`}
            className="block w-full py-3 rounded-xl text-center text-base border border-brand text-brand bg-white"
          >
            Add tasks
          </Link>
        )}
        {taskAddition && !taskAddition.canAdd && !taskAddition.pending && taskAddition.blockedReason && (
          <p className="text-xs text-slate-500">{taskAddition.blockedReason}</p>
        )}
        <button
          type="button"
          onClick={() => {
            // A recurring visit asks first: just this visit, or the entire series.
            setCancelScope(null)
            if (recurringSeriesId) setChoosingScope(true)
            else setAskingReason(true)
          }}
          className="w-full py-2.5 rounded-xl border border-red-600 text-red-600 text-base"
        >
          {recurringSeriesId ? 'Cancel' : 'Cancel booking'}
        </button>
        <Link
          href={`/dashboard/messages/${bookingId}`}
          className="block w-full py-4 rounded-xl text-center text-base text-white"
          style={{ backgroundColor: 'var(--color-brand)' }}
        >
          Send a message
        </Link>
      </div>
      {choosingScope && (
        <CancelScopeSheet
          visitLabel={scheduledDate && scheduledTime ? occurrenceLabel(scheduledDate, scheduledTime.slice(0, 5)) : null}
          onChoose={(scope) => {
            setCancelScope(scope)
            setChoosingScope(false)
            setAskingReason(true)
          }}
          onClose={() => setChoosingScope(false)}
        />
      )}
      {askingReason && (
        <CancelReasonSheet
          reasons={CUSTOMER_CANCEL_REASONS}
          warning={
            cancelScope === 'series'
              ? 'No more visits will be booked. This visit and any others already booked are canceled: one you’ve paid for is refunded minus the nonrefundable booking fees, and one not charged yet is free.'
              : lateCancelRefund != null
                ? `Canceling now refunds 50% ($${lateCancelRefund.toFixed(2)}).`
                : recurringSeriesId
                  ? 'Your other recurring visits stay on.'
                  : null
          }
          confirmLabel={cancelScope === 'series' ? 'Cancel recurring booking' : recurringSeriesId ? 'Cancel this visit' : undefined}
          onConfirm={cancelScope === 'series' ? handleCancelSeries : handleCancel}
          onClose={() => setAskingReason(false)}
        />
      )}
    </BookingSummary>
  )
}
