import Link from 'next/link'
import type { CleanerReview } from '@/lib/cleanerReviews'

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} width="14" height="14" viewBox="0 0 24 24" fill={n <= rating ? '#f5a623' : 'none'} stroke="#f5a623" strokeWidth="1.5">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  )
}

// Shared by customers viewing a cleaner and a cleaner viewing their own profile as
// a customer would, so both see the same screen.
export default function CleanerReviewsView({
  name,
  rating,
  reviewCount,
  reviews,
  backHref,
  embedded = false,
}: {
  name: string
  rating: number
  reviewCount: number
  reviews: CleanerReview[]
  backHref: string
  // Shown inside another page's <main> (the admin console), so it can't be one itself.
  embedded?: boolean
}) {
  const Root = embedded ? 'div' : 'main'
  return (
    <Root id={embedded ? undefined : 'main-content'} className={`${embedded ? '' : 'min-h-screen '}bg-white flex flex-col`}>
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-16 max-w-sm mx-auto w-full">
        <Link
          href={backHref}
          aria-label="Back"
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-2 mb-4"
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>

        <h1 className="text-2xl font-bold text-slate-900 mb-1">Reviews</h1>
        <p className="text-sm text-slate-400 mb-4">{name}</p>

        {reviewCount > 0 && (
          <div className="flex items-center gap-2 mb-6">
            <Stars rating={Math.round(rating)} />
            <span className="text-sm font-semibold text-slate-800">{rating.toFixed(1)}</span>
            <span className="text-sm text-slate-400">
              {reviewCount} review{reviewCount === 1 ? '' : 's'}
            </span>
          </div>
        )}

        {reviews.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
            <p className="text-sm text-slate-400">No reviews yet</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-slate-100">
            {reviews.map((review) => (
              <div key={review.id} className="py-4">
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <p className="text-sm font-semibold text-slate-900">{review.reviewerFirstName}</p>
                  <p className="text-xs text-slate-400">
                    {new Date(review.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <Stars rating={review.rating} />
                {review.text && <p className="text-sm text-slate-600 leading-relaxed mt-2 whitespace-pre-wrap">{review.text}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </Root>
  )
}
