'use client'

import { SQUARE_FOOTAGE_OPTIONS, type SquareFootage } from '@/lib/squareFootage'

type Props = {
  value: SquareFootage | null
  onChange: (value: SquareFootage) => void
  disabled?: boolean
}

export default function SquareFootageSelect({ value, onChange, disabled }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {SQUARE_FOOTAGE_OPTIONS.map((opt) => {
        const selected = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            aria-pressed={selected}
            className={`px-3 py-2.5 rounded-xl border text-sm text-left transition-colors disabled:opacity-40 ${
              selected ? 'border-brand bg-[#e8f9fa] font-semibold text-slate-900' : 'border-slate-200 text-slate-700'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
