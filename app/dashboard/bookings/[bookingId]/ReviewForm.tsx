'use client'

import { useState } from 'react'
import StarPicker from './StarPicker'
import TipPicker, { newTipAttemptId } from './TipPicker'
import { submitReviewAction } from './actions'

export default function ReviewForm({
  bookingId,
  firstName,
  totalPrice,
  onSubmitted,
  cardFeePercentage,
}: {
  bookingId: string
  firstName: string
  totalPrice: number
  onSubmitted: () => void
  cardFeePercentage?: number
}) {
  const [rating, setRating] = useState(0)
  const [reviewText, setReviewText] = useState('')
  const [tipPercent, setTipPercent] = useState(0)
  const [attemptId, setAttemptId] = useState(newTipAttemptId)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (rating === 0) return
    setSubmitting(true)
    setError(null)
    const result = await submitReviewAction(bookingId, rating, reviewText, tipPercent, attemptId)
    setSubmitting(false)
    if ('error' in result) {
      setError(result.error)
      setAttemptId(newTipAttemptId())
      return
    }
    onSubmitted()
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 text-center mb-3">How did {firstName} do?</h2>
      <StarPicker value={rating} onChange={setRating} />

      <textarea
        aria-label="Leave a review"
        value={reviewText}
        onChange={(e) => setReviewText(e.target.value)}
        placeholder="Leave a review"
        rows={3}
        className="w-full mt-5 px-4 py-3 text-sm text-slate-800 placeholder-slate-500 rounded-xl border border-slate-200 focus:outline-none focus:border-brand resize-none"
      />

      <p className="text-base font-bold text-slate-900 mt-5 mb-1">Would you like to leave a tip?</p>
      <p className="text-xs text-slate-500 mb-3">Tips go directly to your Tidy Pro. Thank you for supporting great service!</p>
      <TipPicker totalPrice={totalPrice} cardFeePercentage={cardFeePercentage} onChange={setTipPercent} disabled={submitting} />

      {error && <p role="alert" className="text-xs text-red-600 mt-2">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={rating === 0 || submitting}
        className="w-full py-4 rounded-xl text-base text-white transition-opacity mt-6 disabled:opacity-60"
        style={{ backgroundColor: 'var(--color-brand)' }}
      >
        {submitting ? 'Submitting…' : 'Submit'}
      </button>
    </div>
  )
}
