'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from '@/app/components/NavigationSpinner'
import type { BookingTaskRow } from './CurrentBookingView'
import BookingSummary, { type OrderLine } from './BookingSummary'
import CancelReasonSheet from '@/app/components/CancelReasonSheet'
import { CUSTOMER_CANCEL_REASONS, type Cancellation } from '@/lib/cancellationReasons'
import { payRecurringVisitAction } from './actions'
import CardPayForm, { type PayCard } from './CardPayForm'

type Props = {
  bookingId: string
  amountDue: number
  cards: PayCard[]
  defaultCardId: string | null
  // Still unpaid a day before it starts: it has to be paid for a new date (see
  // lib/recurringPayments).
  suspended: boolean
  paymentError: string | null
  // The new date and time picked on the reschedule page, carried here in the URL.
  newSlot: { date: string; time: string; label: string } | null
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
  cancelAction: (bookingId: string, cancellation: Cancellation, acceptLateFee?: boolean) => Promise<{ success: true } | { error: string }>
}

// A recurring visit whose card charge didn't go through. Before the cutoff, paying keeps
// its date. After it, the visit is on hold: the customer chooses a new date, then pays.
// Canceling it costs nothing, since nothing was charged.
export default function VisitPaymentDueView({ bookingId, amountDue, cards, defaultCardId, suspended, paymentError, newSlot, cancelAction, ...booking }: Props) {
  const router = useRouter()
  const [paid, setPaid] = useState(false)
  const [askingReason, setAskingReason] = useState(false)
  const amountCents = Math.round(amountDue * 100)
  const cleanerFirstName = booking.cleanerName.split(' ')[0]
  const rescheduleHref = `/dashboard/bookings/${bookingId}/reschedule`

  async function handleCancel(cancellation: Cancellation): Promise<string | null> {
    const result = await cancelAction(bookingId, cancellation, false)
    if ('error' in result) return result.error
    router.push('/dashboard/bookings')
    return null
  }

  const payForm = (
    <CardPayForm
      cards={cards}
      defaultCardId={defaultCardId}
      itemLabel="Booking"
      amountCents={amountCents}
      onPay={(card, attemptId) => payRecurringVisitAction(bookingId, card.id, card.chargeCents, attemptId, newSlot ? { date: newSlot.date, time: newSlot.time } : null)}
      onPaid={() => {
        setPaid(true)
        router.replace(`/dashboard/bookings/${bookingId}`)
        router.refresh()
      }}
    />
  )

  const banner = (
    <section aria-labelledby="visit-payment-heading" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 mb-7">
      <h2 id="visit-payment-heading" className="text-sm font-bold text-amber-900 mb-1">
        {paid ? 'Payment received' : suspended ? 'Your booking is on hold' : 'Payment needed'}
      </h2>
      {paid ? (
        <p className="text-xs text-amber-900">Thanks! Your cleaning is confirmed.</p>
      ) : suspended ? (
        <>
          <p className="text-xs text-amber-900 mb-3">
            We couldn&apos;t charge your card for this recurring cleaning, so it&apos;s on hold. To keep it, choose a new date with {cleanerFirstName} and
            pay. If you don&apos;t, it&apos;s canceled at its original time, and you won&apos;t be charged.
          </p>
          {newSlot ? (
            <>
              <div className="rounded-xl border border-amber-200 bg-white px-3.5 py-3 mb-3 text-xs text-slate-900 flex items-center justify-between gap-2">
                <span>
                  <span className="font-semibold">New date:</span> {newSlot.label}
                </span>
                <Link href={rescheduleHref} className="underline text-slate-500">
                  Change
                </Link>
              </div>
              {payForm}
            </>
          ) : (
            <Link href={rescheduleHref} className="block w-full py-3 rounded-xl text-center text-sm font-semibold text-white bg-brand">
              Choose a new date
            </Link>
          )}
        </>
      ) : (
        <>
          <p className="text-xs text-amber-900 mb-3">
            We couldn&apos;t charge your card for this recurring cleaning{paymentError ? `: ${paymentError}` : '.'} Pay at least 24 hours before it
            starts to keep it. We&apos;ll also try your card again each day.
          </p>
          {payForm}
        </>
      )}
    </section>
  )

  return (
    <BookingSummary
      eyebrow="Needs attention"
      cleanerName={booking.cleanerName}
      scheduledDate={booking.scheduledDate}
      scheduledTime={booking.scheduledTime}
      durationMinutes={booking.durationMinutes}
      addressLabel={booking.addressLabel}
      addressSubline={booking.addressLine}
      tasks={booking.tasks}
      suppliesNote={booking.suppliesProvided ? "You'll provide the cleaning supplies" : 'Cleaning supplies will be provided'}
      pets={booking.pets}
      notes={booking.notes}
      orderLines={booking.orderLines}
      totalPrice={booking.totalPrice}
      banner={banner}
    >
      <div className="flex flex-col gap-3">
        {!paid && (
          <button type="button" onClick={() => setAskingReason(true)} className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-500 text-base">
            Cancel this visit
          </button>
        )}
        <Link href={`/dashboard/messages/${bookingId}`} className="block w-full py-4 rounded-xl text-center text-base text-white bg-brand">
          Send a message
        </Link>
      </div>
      {askingReason && (
        <CancelReasonSheet
          reasons={CUSTOMER_CANCEL_REASONS}
          warning="You haven't been charged for this visit, so there's nothing to refund. Your other recurring visits stay on."
          onConfirm={handleCancel}
          onClose={() => setAskingReason(false)}
        />
      )}
    </BookingSummary>
  )
}
