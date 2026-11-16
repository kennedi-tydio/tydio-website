'use client'

import { useState } from 'react'
import Link from 'next/link'

// What this card would be charged, Stripe's fee for it included.
export type PayCard = { id: string; label: string; chargeCents: number }

export type PayResult = { success: true } | { error: string; paymentFailed?: true }

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function newAttemptId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

// Choose a saved card and pay: used for upcharges and for recurring visits whose charge
// failed. A declined card is greyed out so another can be picked. Each tap of Pay is a
// new attempt id, so a double tap charges once but a retry after a decline is a new try.
export default function CardPayForm({
  cards,
  defaultCardId,
  itemLabel,
  amountCents,
  onPay,
  onPaid,
  disabled = false,
}: {
  cards: PayCard[]
  defaultCardId: string | null
  // The line above the processing fee, like "Extra charge" or "Booking".
  itemLabel: string
  amountCents: number
  onPay: (card: PayCard, attemptId: string) => Promise<PayResult>
  onPaid: () => void
  disabled?: boolean
}) {
  const [cardId, setCardId] = useState<string | null>(defaultCardId ?? cards[0]?.id ?? null)
  const [declinedIds, setDeclinedIds] = useState<string[]>([])
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const card = cards.find((c) => c.id === cardId) ?? null

  async function handlePay() {
    if (!card || paying || disabled) return
    setPaying(true)
    setError(null)
    const result = await onPay(card, newAttemptId())
    setPaying(false)
    if ('error' in result) {
      setError(result.error)
      if (result.paymentFailed) {
        setDeclinedIds((ids) => [...ids, card.id])
        setCardId(null)
      }
      return
    }
    onPaid()
  }

  if (cards.length === 0) {
    return (
      <Link href="/dashboard/profile/payment-methods" className="block w-full py-3 rounded-xl text-center text-sm font-semibold text-white bg-brand">
        Add a card to pay
      </Link>
    )
  }

  return (
    <>
      <fieldset className="mb-3">
        <legend className="text-xs text-slate-900 font-semibold mb-1.5">Pay with</legend>
        <div className="flex flex-col gap-1.5">
          {cards.map((c) => {
            const declined = declinedIds.includes(c.id)
            return (
              <label
                key={c.id}
                className={`flex items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2.5 text-xs ${cardId === c.id ? 'border-brand' : 'border-slate-200'} ${declined ? 'opacity-50' : ''}`}
              >
                <span className="flex items-center gap-2">
                  <input type="radio" name="pay-card" value={c.id} checked={cardId === c.id} disabled={declined || paying} onChange={() => setCardId(c.id)} />
                  {c.label}
                  {declined && <span className="text-red-600">Declined</span>}
                </span>
              </label>
            )
          })}
        </div>
        <Link href="/dashboard/profile/payment-methods" className="inline-block text-xs mt-1.5 underline text-slate-500">
          Add another card
        </Link>
      </fieldset>

      {card && (
        <div className="rounded-xl border border-amber-200 bg-white px-3.5 py-3 flex flex-col gap-2 mb-3 text-xs text-slate-900">
          <div className="flex justify-between">
            <span>{itemLabel}</span>
            <span>{money(amountCents)}</span>
          </div>
          <div className="flex justify-between">
            <span>Processing fee</span>
            <span>{money(card.chargeCents - amountCents)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>Total</span>
            <span>{money(card.chargeCents)}</span>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-red-600 mb-2">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={handlePay}
        disabled={!card || paying || disabled}
        className="w-full py-3 rounded-xl text-sm font-semibold text-white bg-brand disabled:opacity-50"
      >
        {paying ? 'Paying…' : card ? `Pay ${money(card.chargeCents)}` : 'Choose a card'}
      </button>
    </>
  )
}
