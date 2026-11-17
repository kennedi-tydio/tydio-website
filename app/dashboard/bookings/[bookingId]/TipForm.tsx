'use client'

import { useState } from 'react'
import TipPicker, { newTipAttemptId } from './TipPicker'
import { sendTipAction } from './actions'

// "Send a tip" on a completed booking with no tip yet: the one left with the review
// didn't go through, or they didn't tip then.
export default function TipForm({
  bookingId,
  firstName,
  totalPrice,
  cardFeePercentage,
  onSent,
  onCancel,
}: {
  bookingId: string
  firstName: string
  totalPrice: number
  cardFeePercentage?: number
  onSent: () => void
  onCancel: () => void
}) {
  const [tipPercent, setTipPercent] = useState(0)
  const [attemptId, setAttemptId] = useState(newTipAttemptId)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSend() {
    if (tipPercent <= 0) return
    setSending(true)
    setError(null)
    const result = await sendTipAction(bookingId, tipPercent, attemptId)
    setSending(false)
    if ('error' in result) {
      setError(result.error)
      // Trying again is a new charge attempt, not Stripe's saved answer to this one.
      setAttemptId(newTipAttemptId())
      return
    }
    onSent()
  }

  return (
    <div>
      <p className="text-base font-bold text-slate-900 mb-1">Send {firstName} a tip</p>
      <p className="text-xs text-slate-500 mb-3">Tips go directly to your Tidy Pro, charged to the card you booked with.</p>
      <TipPicker totalPrice={totalPrice} cardFeePercentage={cardFeePercentage} onChange={setTipPercent} allowNoTip={false} disabled={sending} />

      {error && <p role="alert" className="text-xs text-red-600 mt-2">{error}</p>}

      <button
        type="button"
        onClick={handleSend}
        disabled={tipPercent <= 0 || sending}
        className="w-full py-4 rounded-xl text-base text-white mt-4 disabled:opacity-60 bg-brand"
      >
        {sending ? 'Sending tip…' : 'Send tip'}
      </button>
      <button type="button" onClick={onCancel} disabled={sending} className="w-full py-2.5 mt-2 text-sm text-slate-500 disabled:opacity-60">
        Cancel
      </button>
    </div>
  )
}
