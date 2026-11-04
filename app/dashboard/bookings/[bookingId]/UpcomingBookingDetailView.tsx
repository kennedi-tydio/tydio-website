'use client'

import { useState } from 'react'
import { useRouter } from '@/app/components/NavigationSpinner'
import Link from 'next/link'
import type { BookingTaskRow } from './CurrentBookingView'
import BookingSummary, { type OrderLine } from './BookingSummary'
import ReportNoShowButton from './ReportNoShowButton'

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
  cancelBookingRequestAction: (bookingId: string, acceptLateFee?: boolean) => Promise<{ success: true } | { error: string }>
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
}: Props) {
  const router = useRouter()
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  async function handleCancel() {
    setCancelling(true)
    setCancelError(null)
    const result = await cancelBookingRequestAction(bookingId, lateCancelRefund != null)
    setCancelling(false)
    if ('error' in result) {
      setCancelError(result.error)
      return
    }
    router.push('/dashboard/bookings')
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
      {cancelError && <p role="alert" className="text-xs text-red-600 mb-3">{cancelError}</p>}
      {lateCancelRefund != null && (
        <p className="text-xs text-slate-500 mb-3">
          Your booking is less than 12 hours away, so canceling refunds 50% (${lateCancelRefund.toFixed(2)}).
        </p>
      )}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={handleCancel}
          disabled={cancelling}
          className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-500 text-base disabled:opacity-60"
        >
          {cancelling ? 'Cancelling…' : 'Cancel booking'}
        </button>
        <Link
          href={`/dashboard/messages/${bookingId}`}
          className="block w-full py-4 rounded-xl text-center text-base text-white"
          style={{ backgroundColor: 'var(--color-brand)' }}
        >
          Send a message
        </Link>
      </div>
    </BookingSummary>
  )
}
