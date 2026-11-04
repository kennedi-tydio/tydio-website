'use client'

import { useState } from 'react'
import { useRouter } from '@/app/components/NavigationSpinner'
import { submitCustomerReviewAction } from './actions'

function IconStar({ filled }: { filled: boolean }) {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill={filled ? '#f5a623' : 'none'} stroke="#f5a623" strokeWidth="1.5">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function StarPicker({ value, onChange }: { value: number; onChange: (rating: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={n === value} onClick={() => onChange(n)} className="p-0.5">
          <IconStar filled={n <= value} />
        </button>
      ))}
    </div>
  )
}

function IconCheckBadge() {
  return (
    <span
      className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center border-2 border-white"
      style={{ backgroundColor: '#22c55e' }}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
        <path d="M3 8.5l3.5 3.5L13 5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

function Avatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  return (
    <div className="relative w-20 h-20 mx-auto mb-4">
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt={name} className="w-20 h-20 rounded-full object-cover" />
      ) : (
        <div className="w-20 h-20 rounded-full flex items-center justify-center bg-slate-100 text-slate-500 font-bold text-2xl">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      <IconCheckBadge />
    </div>
  )
}

export default function LeaveReviewView({
  bookingId,
  customerName,
  customerPhotoUrl,
  hoursLeft,
}: {
  bookingId: string
  customerName: string
  customerPhotoUrl: string | null
  hoursLeft: number
}) {
  const router = useRouter()
  const [rating, setRating] = useState(0)
  const [reviewText, setReviewText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (rating === 0) return
    setSubmitting(true)
    setError(null)
    const result = await submitCustomerReviewAction(bookingId, rating, reviewText)
    setSubmitting(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    // The same page now renders the customer's review, unlocked by this one.
    router.refresh()
  }

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-10 max-w-sm mx-auto w-full">
        <button
          type="button"
          onClick={() => router.push(`/pro/bookings/${bookingId}`)}
          aria-label="Back"
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-2 mb-4"
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <Avatar name={customerName} photoUrl={customerPhotoUrl} />
        <h1 className="text-2xl font-bold text-slate-900 text-center mb-1">You&apos;re all done!</h1>
        <p className="text-sm text-slate-400 text-center mb-2">Rate your experience with the customer</p>
        <p className="text-xs text-slate-400 text-center mb-6">
          {`You have ${hoursLeft} hour${hoursLeft === 1 ? '' : 's'} left. You'll see the customer's review of you after you submit yours.`}
        </p>

        <StarPicker value={rating} onChange={setRating} />

        <p className="text-sm font-bold text-slate-900 mt-6 mb-2">Leave a review</p>
        <textarea
          aria-label="Leave a review"
          value={reviewText}
          onChange={(e) => setReviewText(e.target.value)}
          rows={4}
          className="w-full px-4 py-3 text-sm text-slate-800 placeholder-slate-400 rounded-xl border border-slate-200 focus:outline-none focus:border-brand resize-none"
        />

        {error && <p role="alert" className="text-xs text-red-600 mt-3">{error}</p>}
      </div>

      <div className="px-5 pb-8 max-w-sm mx-auto w-full flex flex-col gap-3">
        <button
          type="button"
          onClick={() => router.push('/pro/dashboard')}
          className="w-full py-3 rounded-2xl text-center bg-slate-100 text-sm font-semibold text-slate-500"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={rating === 0 || submitting}
          className="w-full py-3.5 rounded-2xl font-semibold text-base text-white disabled:text-slate-400"
          style={{ backgroundColor: rating > 0 ? 'var(--color-brand)' : '#e5e9ef' }}
        >
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </main>
  )
}
