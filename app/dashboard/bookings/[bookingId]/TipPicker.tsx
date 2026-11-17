'use client'

import { useState } from 'react'
import { grossUpForStripeFee } from '@/lib/pricingRules'

// Shown as dollar amounts, but stored as a percent of the booking total.
const TIP_PRESETS = [10, 15] as const

function roundCents(amount: number): number {
  return Math.round(amount * 100) / 100
}

export function newTipAttemptId(): string {
  return crypto.randomUUID()
}

// No tip / two presets / custom, with what the card will be charged. Used when leaving
// a review and when sending a tip afterwards. Reports the tip as a percent of the total.
export default function TipPicker({
  totalPrice,
  cardFeePercentage,
  onChange,
  allowNoTip = true,
  disabled = false,
}: {
  totalPrice: number
  cardFeePercentage?: number
  onChange: (tipPercent: number) => void
  allowNoTip?: boolean
  disabled?: boolean
}) {
  const [tipOption, setTipOption] = useState<number | 'custom' | null>(null)
  const [customAmount, setCustomAmount] = useState('')

  function percentFor(option: number | 'custom' | null, custom: string): number {
    if (option === 'custom') {
      const dollars = Math.max(0, Number(custom) || 0)
      return totalPrice > 0 ? (dollars / totalPrice) * 100 : 0
    }
    return option ?? 0
  }

  function choose(option: number | 'custom' | null) {
    setTipOption(option)
    onChange(percentFor(option, customAmount))
  }

  function changeCustom(value: string) {
    setCustomAmount(value)
    onChange(percentFor('custom', value))
  }

  const tipPercent = percentFor(tipOption, customAmount)
  const tipAmount = roundCents((totalPrice * tipPercent) / 100)
  // The cleaner gets 100% of tipAmount — Stripe's processing fee is charged
  // on top rather than taken out of it (see lib/pricingRules.ts).
  const tipChargeAmount = tipAmount > 0 ? grossUpForStripeFee(tipAmount, cardFeePercentage) : 0
  const tipProcessingFee = roundCents(tipChargeAmount - tipAmount)

  const options: { key: number | 'custom' | null; label: string }[] = [
    ...(allowNoTip ? [{ key: null, label: 'No tip' }] : []),
    ...TIP_PRESETS.map((p) => ({ key: p, label: `$${roundCents((totalPrice * p) / 100).toFixed(2)}` })),
    { key: 'custom', label: 'Custom' },
  ]

  return (
    <>
      <div className={`grid gap-2 mb-2 ${options.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
        {options.map((option) => {
          const selected = tipOption === option.key
          return (
            <button
              key={String(option.key)}
              type="button"
              onClick={() => choose(option.key)}
              disabled={disabled}
              aria-pressed={selected}
              className={`py-1.5 rounded-md text-sm border disabled:opacity-60 ${
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
            onChange={(e) => changeCustom(e.target.value)}
            disabled={disabled}
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
    </>
  )
}
