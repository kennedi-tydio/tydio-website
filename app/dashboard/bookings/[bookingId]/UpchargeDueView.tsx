'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from '@/app/components/NavigationSpinner'
import type { BookingTaskRow } from './CurrentBookingView'
import BookingSummary, { type OrderLine } from './BookingSummary'
import CancelReasonSheet from '@/app/components/CancelReasonSheet'
import { CUSTOMER_CANCEL_REASONS, type Cancellation } from '@/lib/cancellationReasons'
import { payUpchargeAction } from './actions'
import CardPayForm, { type PayCard } from './CardPayForm'

// What this card would be charged: the upcharge plus Stripe's fee for it.
export type UpchargeCard = PayCard

type Props = {
  bookingId: string
  upcharge: { id: string; amount: number; reason: string }
  cards: UpchargeCard[]
  defaultCardId: string | null
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
  // Null once the Tidy Pro has arrived: then it can only be paid, or settled with support.
  cancel: {
    lateCancelRefund: number | null
    action: (bookingId: string, cancellation: Cancellation, acceptLateFee?: boolean) => Promise<{ success: true } | { error: string }>
  } | null
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

// A booking suspended until the customer pays an upcharge: "Needs attention" with the
// reason and a Pay button up top, and the booking itself underneath.
export default function UpchargeDueView({ bookingId, upcharge, cards, defaultCardId, cancel, ...booking }: Props) {
  const router = useRouter()
  const [paid, setPaid] = useState(false)
  const [askingReason, setAskingReason] = useState(false)
  const amountCents = Math.round(upcharge.amount * 100)

  async function handleCancel(cancellation: Cancellation): Promise<string | null> {
    if (!cancel) return null
    const result = await cancel.action(bookingId, cancellation, cancel.lateCancelRefund != null)
    if ('error' in result) return result.error
    router.push('/dashboard/bookings')
    return null
  }

  const banner = (
    <section aria-labelledby="upcharge-heading" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 mb-7">
      <h2 id="upcharge-heading" className="text-sm font-bold text-amber-900 mb-1">
        {paid ? 'Payment received' : 'Your booking is on hold'}
      </h2>
      {paid ? (
        <p className="text-xs text-amber-900">Thanks! Your booking is back on.</p>
      ) : (
        <>
          <p className="text-xs text-amber-900 mb-3">
            The Tydio team added {money(amountCents)} to this booking. {booking.cleanerName.split(' ')[0]} can&apos;t start or carry on until it&apos;s paid.
          </p>
          <p className="text-xs text-slate-900 mb-1 font-semibold">Why</p>
          <p className="text-xs text-slate-700 mb-4 whitespace-pre-line">{upcharge.reason}</p>

          <CardPayForm
            cards={cards}
            defaultCardId={defaultCardId}
            itemLabel="Extra charge"
            amountCents={amountCents}
            onPay={(card, attemptId) => payUpchargeAction(bookingId, upcharge.id, card.id, card.chargeCents, attemptId)}
            onPaid={() => {
              setPaid(true)
              router.refresh()
            }}
          />
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
      {cancel?.lateCancelRefund != null && (
        <p className="text-xs text-slate-500 mb-3">
          Your booking is less than 2 hours away, so canceling refunds 50% (${cancel.lateCancelRefund.toFixed(2)}).
        </p>
      )}
      <div className="flex flex-col gap-3">
        {cancel && (
          <button type="button" onClick={() => setAskingReason(true)} className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-500 text-base">
            Cancel booking
          </button>
        )}
        <Link href={`/dashboard/messages/${bookingId}`} className="block w-full py-4 rounded-xl text-center text-base text-white bg-brand">
          Send a message
        </Link>
      </div>
      {askingReason && cancel && (
        <CancelReasonSheet
          reasons={CUSTOMER_CANCEL_REASONS}
          warning={cancel.lateCancelRefund != null ? `Canceling now refunds 50% ($${cancel.lateCancelRefund.toFixed(2)}).` : null}
          onConfirm={handleCancel}
          onClose={() => setAskingReason(false)}
        />
      )}
    </BookingSummary>
  )
}
