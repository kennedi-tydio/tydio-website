'use client'

import { useState } from 'react'
import StarPicker from './StarPicker'
import { submitReviewAction } from './actions'
import { grossUpForStripeFee } from '@/lib/pricingRules'

// Shown as dollar amounts, but stored as a percent of the booking total.
const TIP_PRESETS = [10, 15] as const

function roundCents(amount: number): number {
  return Math.round(amount * 100) / 100
}

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
  const [tipOption, setTipOption] = useState<number | 'custom' | null>(null)
  const [customAmount, setCustomAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const customDollars = Math.max(0, Number(customAmount) || 0)
  const tipPercent =
    tipOption === 'custom' ? (totalPrice > 0 ? (customDollars / totalPrice) * 100 : 0) : tipOption ?? 0
  const tipAmount = roundCents((totalPrice * tipPercent) / 100)
  // The cleaner gets 100% of tipAmount — Stripe's processing fee is charged
  // on top rather than taken out of it (see lib/pricingRules.ts).
  const tipChargeAmount = tipAmount > 0 ? grossUpForStripeFee(tipAmount, cardFeePercentage) : 0
  const tipProcessingFee = roundCents(tipChargeAmount - tipAmount)

  async function handleSubmit() {
    if (rating === 0) return
    setSubmitting(true)
    setError(null)
    const result = await submitReviewAction(bookingId, rating, reviewText, tipPercent)
    setSubmitting(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    onSubmitted()
  }

  const options: { key: number | 'custom' | null; label: string }[] = [
    { key: null, label: 'No tip' },
    ...TIP_PRESETS.map((p) => ({ key: p, label: `$${roundCents((totalPrice * p) / 100).toFixed(2)}` })),
    { key: 'custom', label: 'Custom' },
  ]

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
      <div className="grid grid-cols-4 gap-2 mb-2">
        {options.map((option) => {
          const selected = tipOption === option.key
          return (
            <button
              key={String(option.key)}
              type="button"
              onClick={() => setTipOption(option.key)}
              aria-pressed={selected}
              className={`py-1.5 rounded-md text-sm border ${
                selected ? 'border-brand bg-[#e8f9fa] text-slate-900' : 'border-slate-200 bg-slate-100 text-slate-500'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      {tipOption === 'custom' && (
        <div className="flex items-center gap-2 mb-2 rounded-xl border border-slate-200 px-3 py-2 focus-within:border-brand">
          <span className="text-sm text-slate-500">$</span>
          <input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            placeholder="Tip amount"
            aria-label="Custom tip amount"
            className="flex-1 text-sm focus:outline-none"
          />
        </div>
      )}
      {tipAmount > 0 && (
        <p className="text-xs text-slate-400 mb-2">
          ${tipAmount.toFixed(2)} tip + ${tipProcessingFee.toFixed(2)} processing fee = ${tipChargeAmount.toFixed(2)} charged
        </p>
      )}

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
