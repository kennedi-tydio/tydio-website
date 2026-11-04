import Link from 'next/link'
import { CLEANER_REVIEW_WINDOW_HOURS } from '@/lib/cleanerReviewWindow'

type Review = { rating: number | null; text: string | null }

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} width="18" height="18" viewBox="0 0 24 24" fill={n <= rating ? '#f5a623' : 'none'} stroke="#f5a623" strokeWidth="1.5">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  )
}

function ReviewCard({ title, review, emptyText }: { title: string; review: Review | null; emptyText: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 shadow-sm p-4 mb-4">
      <p className="text-sm font-bold text-slate-900 mb-2">{title}</p>
      {review ? (
        <>
          {review.rating != null && <Stars rating={review.rating} />}
          {review.text && <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{review.text}</p>}
        </>
      ) : (
        <p className="text-sm text-slate-400">{emptyText}</p>
      )}
    </div>
  )
}

export default function BookingReviewsView({
  bookingId,
  customerName,
  customerReview,
  ownReview,
}: {
  bookingId: string
  customerName: string
  customerReview: Review | null
  ownReview: Review | null
}) {
  const firstName = customerName.split(' ')[0]

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-10 max-w-sm mx-auto w-full">
        <Link
          href={`/pro/bookings/${bookingId}`}
          aria-label="Back"
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-2 mb-4"
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>

        <h1 className="text-2xl font-bold text-slate-900 mb-1">Reviews</h1>
        <p className="text-sm text-slate-400 mb-6">Your job with {customerName}</p>

        <ReviewCard
          title={`${firstName}'s review of you`}
          review={customerReview}
          emptyText={`${firstName} hasn't left a review yet.`}
        />
        <ReviewCard
          title={`Your review of ${firstName}`}
          review={ownReview}
          emptyText={`You didn't leave a review within ${CLEANER_REVIEW_WINDOW_HOURS} hours.`}
        />

        <Link
          href={`/pro/messages/${bookingId}`}
          className="block w-full py-2.5 rounded-xl text-center bg-white border border-slate-200 text-sm font-semibold text-slate-600"
        >
          View messages
        </Link>
      </div>
    </main>
  )
}
