'use client'

import { useState } from 'react'
import { useRouter } from '@/app/components/NavigationSpinner'
import Link from 'next/link'
import { cityAndState } from '@/lib/address'
import type { BookingTaskRow } from './CurrentBookingView'
import BookingSummary, { type OrderLine } from './BookingSummary'
import ReviewForm from './ReviewForm'

type Props = {
  cardFeePercentage?: number
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
  alreadyReviewed: boolean
  status: 'completed' | 'cancelled' | 'declined'
}

export default function PastBookingDetailView({
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
  alreadyReviewed,
  status,
  cardFeePercentage,
}: Props) {
  const router = useRouter()
  const firstName = cleanerName.split(' ')[0]
  const [showReviewForm, setShowReviewForm] = useState(false)

  return (
    <BookingSummary
      eyebrow={status === 'cancelled' ? 'Cancelled Booking' : status === 'declined' ? 'Declined Booking' : 'Past Booking'}
      cleanerName={cleanerName}
      scheduledDate={scheduledDate}
      scheduledTime={scheduledTime}
      durationMinutes={durationMinutes}
      addressLabel={addressLabel}
      addressSubline={cityAndState(addressLine)}
      tasks={tasks}
      suppliesNote={suppliesProvided ? 'You provided the cleaning supplies' : 'Cleaning supplies provided'}
      pets={pets}
      notes={notes}
      orderLines={orderLines}
      totalPrice={totalPrice}
    >
      {showReviewForm ? (
        <ReviewForm cardFeePercentage={cardFeePercentage} bookingId={bookingId} firstName={firstName} totalPrice={totalPrice} onSubmitted={() => router.refresh()} />
      ) : (
        <div className="flex flex-col gap-3">
          {status === 'completed' && !alreadyReviewed && (
            <button
              type="button"
              onClick={() => setShowReviewForm(true)}
              className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-500 text-base"
            >
              Leave a review
            </button>
          )}
          <Link
            href={`/dashboard/messages/${bookingId}`}
            className="block w-full py-4 rounded-xl text-center text-base text-white"
            style={{ backgroundColor: 'var(--color-brand)' }}
          >
            Send a message
          </Link>
        </div>
      )}
    </BookingSummary>
  )
}
