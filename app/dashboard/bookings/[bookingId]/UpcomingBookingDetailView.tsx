'use client'

import { useState } from 'react'
import { useRouter } from '@/app/components/NavigationSpinner'
import Link from 'next/link'
import type { BookingTaskRow } from './CurrentBookingView'
import BookingSummary, { type OrderLine } from './BookingSummary'
import ReportNoShowButton from './ReportNoShowButton'
import CancelReasonSheet from '@/app/components/CancelReasonSheet'
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
  cancelBookingRequestAction: (bookingId: string, cancellation: Cancellation, acceptLateFee?: boolean) => Promise<{ success: true } | { error: string }>
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
}: Props) {
  const router = useRouter()
  const [askingReason, setAskingReason] = useState(false)

  async function handleCancel(cancellation: Cancellation): Promise<string | null> {
    const result = await cancelBookingRequestAction(bookingId, cancellation, lateCancelRefund != null)
    if ('error' in result) return result.error
    router.push('/dashboard/bookings')
    return null
  }

  return (
    <BookingSummary
      eyebrow="Upcoming Booking"
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
        <button
          type="button"
          onClick={() => setAskingReason(true)}
          className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-500 text-base"
        >
          Cancel booking
        </button>
        <Link
          href={`/dashboard/messages/${bookingId}`}
          className="block w-full py-4 rounded-xl text-center text-base text-white"
          style={{ backgroundColor: 'var(--color-brand)' }}
        >
          Send a message
        </Link>
      </div>
      {askingReason && (
        <CancelReasonSheet
          reasons={CUSTOMER_CANCEL_REASONS}
          warning={lateCancelRefund != null ? `Canceling now refunds 50% ($${lateCancelRefund.toFixed(2)}).` : null}
          onConfirm={handleCancel}
          onClose={() => setAskingReason(false)}
        />
      )}
    </BookingSummary>
  )
}
