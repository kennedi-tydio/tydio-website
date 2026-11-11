'use client'

import { useId, useState } from 'react'
import {
  BASKET_STEP,
  MACHINE_LOADS_HINT,
  MACHINE_LOADS_QUESTION,
  MAX_BASKETS,
  MAX_IRON_ITEMS,
  MAX_MACHINE_LOADS,
  MORE_THAN_ONE_BASKET_MIN,
  formatBaskets,
  formatIronItems,
  formatMachineLoads,
} from '@/lib/laundry'

export type BasketChoice = 'half' | 'one' | 'more'

// The stored basket count for a card choice.
export function basketsForChoice(choice: BasketChoice | null, moreBaskets: number): number | null {
  if (choice === 'half') return 0.5
  if (choice === 'one') return 1
  if (choice === 'more') return moreBaskets
  return null
}

// ── Basket illustration ──────────────────────────────────────────────────────
// One basket drawing reused for every card, so only the amount of laundry
// changes between them. `level` is how full it is: 0.5 or 1 (to the rim,
// not overflowing).

function Basket({ level, x = 0, y = 0, scale = 1 }: { level: 0.5 | 1; x?: number; y?: number; scale?: number }) {
  // useId's punctuation isn't safe inside url(#...).
  const clipId = `basket-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  // Basket interior runs from the rim (y=20) to the floor (y=54).
  const top = level === 1 ? 21 : 37
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <defs>
        <clipPath id={clipId}>
          <path d="M8 20h56l-6 34H14z" />
        </clipPath>
      </defs>
      {/* Laundry inside, clipped to the basket */}
      <g clipPath={`url(#${clipId})`}>
        <path
          d={`M6 ${top + 3} q7 -5 14 -1 q8 -6 16 0 q8 -5 16 -1 q7 -4 14 1 V58 H6z`}
          fill="var(--color-brand)"
          opacity="0.55"
        />
        <path d={`M6 ${top + 9} q10 -4 20 0 q10 -4 20 0 q10 -4 20 0 V58 H6z`} fill="#f59e0b" opacity="0.45" />
        <path d={`M6 ${top + 15} q12 -4 24 0 q12 -4 24 0 q6 -2 12 0 V58 H6z`} fill="#94a3b8" opacity="0.5" />
      </g>
      {/* Basket body and weave */}
      <path d="M8 20h56l-6 34H14z" fill="#f8fafc" fillOpacity="0.25" stroke="#475569" strokeWidth="2" strokeLinejoin="round" />
      <path d="M10 31h52M12 42h48" stroke="#475569" strokeWidth="1.25" opacity="0.6" />
      <path d="M24 20l2 34M36 20v34M48 20l-2 34" stroke="#475569" strokeWidth="1.25" opacity="0.6" />
      {/* Rim and handle cut-outs */}
      <rect x="5" y="17" width="62" height="5" rx="2.5" fill="#e2e8f0" stroke="#475569" strokeWidth="2" />
      <rect x="15" y="24.5" width="8" height="3" rx="1.5" fill="#475569" />
      <rect x="49" y="24.5" width="8" height="3" rx="1.5" fill="#475569" />
    </g>
  )
}

function BasketArt({ choice }: { choice: BasketChoice }) {
  return (
    <svg viewBox="0 0 72 60" className="w-full h-auto" aria-hidden="true" focusable="false">
      {choice === 'half' && <Basket level={0.5} />}
      {choice === 'one' && <Basket level={1} />}
      {choice === 'more' && (
        <>
          <Basket level={1} x={-1} y={14} scale={0.62} />
          <Basket level={1} x={28} y={14} scale={0.62} />
          <Basket level={1} x={13.5} y={-4} scale={0.62} />
        </>
      )}
    </svg>
  )
}

// ── Controls ─────────────────────────────────────────────────────────────────

function Stepper({
  label,
  display,
  onDecrease,
  onIncrease,
  canDecrease,
  canIncrease,
}: {
  label: string
  display: string
  onDecrease: () => void
  onIncrease: () => void
  canDecrease: boolean
  canIncrease: boolean
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
      <span className="text-sm text-slate-700">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onDecrease}
          disabled={!canDecrease}
          className="w-11 h-11 rounded-full bg-slate-100 text-slate-600 text-lg font-semibold flex items-center justify-center disabled:opacity-40"
          aria-label={`Decrease ${label.toLowerCase()}`}
        >
          −
        </button>
        <span
          className="min-w-[5.5rem] text-center text-sm font-semibold text-slate-900"
          aria-live="polite"
        >
          {display}
        </span>
        <button
          type="button"
          onClick={onIncrease}
          disabled={!canIncrease}
          className="w-11 h-11 rounded-full bg-slate-100 text-slate-600 text-lg font-semibold flex items-center justify-center disabled:opacity-40"
          aria-label={`Increase ${label.toLowerCase()}`}
        >
          +
        </button>
      </div>
    </div>
  )
}

const BASKET_CARDS: { value: BasketChoice; label: string }[] = [
  { value: 'half', label: 'Half a basket' },
  { value: 'one', label: 'One full basket' },
  { value: 'more', label: 'More than one basket' },
]

export function BasketQuantityPicker({
  choice,
  moreBaskets,
  onChoiceChange,
  onMoreBasketsChange,
}: {
  choice: BasketChoice | null
  moreBaskets: number
  onChoiceChange: (choice: BasketChoice) => void
  onMoreBasketsChange: (baskets: number) => void
}) {
  const questionId = useId()
  const helperId = useId()

  // Arrow keys move between cards, as in a native radio group.
  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = (index + delta + BASKET_CARDS.length) % BASKET_CARDS.length
    onChoiceChange(BASKET_CARDS[next].value)
    const group = e.currentTarget.parentElement
    group?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
  }

  const focusIndex = Math.max(0, BASKET_CARDS.findIndex((c) => c.value === choice))

  return (
    <div className="mb-6">
      <p id={questionId} className="text-sm font-semibold text-slate-900 mb-1">
        How much laundry do you have?<span className="text-brand">*</span>
      </p>
      <p id={helperId} className="text-xs text-slate-400 mb-3">
        Use a standard household laundry basket as your reference.
      </p>

      <div
        role="radiogroup"
        aria-labelledby={questionId}
        aria-describedby={helperId}
        aria-required="true"
        className="grid grid-cols-3 gap-2"
      >
        {BASKET_CARDS.map((card, i) => {
          const selected = choice === card.value
          return (
            <button
              key={card.value}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={i === focusIndex ? 0 : -1}
              onClick={() => onChoiceChange(card.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`relative flex flex-col items-center gap-1.5 rounded-2xl border-2 px-1.5 pt-3 pb-2.5 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
                selected ? 'border-brand bg-[#f0fafa]' : 'border-slate-200 bg-white'
              }`}
            >
              {selected && (
                <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-brand flex items-center justify-center" aria-hidden="true">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              )}
              <span className="w-full max-w-[72px]">
                <BasketArt choice={card.value} />
              </span>
              <span className={`text-xs leading-tight ${selected ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                {card.label}
              </span>
            </button>
          )
        })}
      </div>

      {choice === 'more' && (
        <div className="mt-3">
          <Stepper
            label="Baskets"
            display={formatBaskets(moreBaskets)}
            canDecrease={moreBaskets > MORE_THAN_ONE_BASKET_MIN}
            canIncrease={moreBaskets < MAX_BASKETS}
            onDecrease={() => onMoreBasketsChange(Math.max(MORE_THAN_ONE_BASKET_MIN, moreBaskets - BASKET_STEP))}
            onIncrease={() => onMoreBasketsChange(Math.min(MAX_BASKETS, moreBaskets + BASKET_STEP))}
          />
        </div>
      )}
    </div>
  )
}

// The basket card and "more" count that show a saved basket count.
export function choiceForBaskets(baskets: number): { choice: BasketChoice; moreBaskets: number } {
  if (baskets === 0.5) return { choice: 'half', moreBaskets: MORE_THAN_ONE_BASKET_MIN }
  if (baskets === 1) return { choice: 'one', moreBaskets: MORE_THAN_ONE_BASKET_MIN }
  return { choice: 'more', moreBaskets: Math.max(MORE_THAN_ONE_BASKET_MIN, baskets) }
}

// Wash & dry only: Wash or Dry on its own is always one load.
export function MachineLoadsPicker({
  loads,
  onChange,
}: {
  loads: number
  onChange: (loads: number) => void
}) {
  const questionId = useId()
  const hintId = useId()
  return (
    <div className="mb-6" role="group" aria-labelledby={questionId} aria-describedby={hintId}>
      <p id={questionId} className="text-sm font-semibold text-slate-900 mb-1">
        {MACHINE_LOADS_QUESTION}
        <span className="text-brand">*</span>
      </p>
      <p id={hintId} className="text-xs text-slate-400 mb-3">
        {MACHINE_LOADS_HINT}
      </p>
      <Stepper
        label="Loads"
        display={formatMachineLoads(loads)}
        canDecrease={loads > 1}
        canIncrease={loads < MAX_MACHINE_LOADS}
        onDecrease={() => onChange(Math.max(1, loads - 1))}
        onIncrease={() => onChange(Math.min(MAX_MACHINE_LOADS, loads + 1))}
      />
    </div>
  )
}

export function IronItemsPicker({ items, onChange }: { items: number; onChange: (items: number) => void }) {
  const questionId = useId()
  // What's typed in the box while it has focus, so it can be cleared mid-edit
  // without snapping back. null shows the saved count.
  const [draft, setDraft] = useState<string | null>(null)

  function onType(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, String(MAX_IRON_ITEMS).length)
    setDraft(digits)
    const n = Number(digits)
    if (digits && n >= 1) onChange(Math.min(MAX_IRON_ITEMS, n))
  }

  return (
    <div className="mb-6">
      <p id={questionId} className="text-sm font-semibold text-slate-900 mb-3">
        How many items need ironing?<span className="text-brand">*</span>
      </p>
      <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
        <span className="text-sm text-slate-700">Items</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onChange(Math.max(1, items - 1))}
            disabled={items <= 1}
            className="w-11 h-11 rounded-full bg-slate-100 text-slate-600 text-lg font-semibold flex items-center justify-center disabled:opacity-40"
            aria-label="Decrease items"
          >
            −
          </button>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={draft ?? String(items)}
            onFocus={(e) => {
              setDraft(String(items))
              e.currentTarget.select()
            }}
            onChange={(e) => onType(e.target.value)}
            onBlur={() => setDraft(null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
            aria-labelledby={questionId}
            aria-describedby={`${questionId}-range`}
            className="w-16 h-11 rounded-lg border border-slate-200 text-center text-base font-semibold text-slate-900 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
          />
          <span id={`${questionId}-range`} className="sr-only">
            Enter a number from 1 to {MAX_IRON_ITEMS}. Currently {formatIronItems(items)}.
          </span>
          <button
            type="button"
            onClick={() => onChange(Math.min(MAX_IRON_ITEMS, items + 1))}
            disabled={items >= MAX_IRON_ITEMS}
            className="w-11 h-11 rounded-full bg-slate-100 text-slate-600 text-lg font-semibold flex items-center justify-center disabled:opacity-40"
            aria-label="Increase items"
          >
            +
          </button>
        </div>
      </div>
    </div>
  )
}
