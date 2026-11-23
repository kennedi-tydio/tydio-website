'use client'

import { useId, useState } from 'react'
import {
  STRIPE_FIXED_FEE,
  STRIPE_INTERNATIONAL_PERCENTAGE_FEE,
  STRIPE_PERCENTAGE_FEE,
  TRUST_SUPPORT_FEE,
} from '@/lib/pricingRules'

function percent(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`
}

function dollars(value: number): string {
  return `$${value.toFixed(2)}`
}

// The "Booking fees" line on a booking's price: Stripe's card processing fee and the
// Trust & Support fee shown together (see bookingChargeTotal), with an ⓘ
// toggle that splits them out. `amount` is the whole line in dollars. `variant: 'dl'`
// renders dt/dd for use inside a <dl>.
export default function BookingFeesRow({
  amount,
  prefix = '',
  variant = 'div',
  className = '',
  labelClassName = '',
  valueClassName = '',
}: {
  amount: number
  // Shown before the amount, like "+" on the homepage example.
  prefix?: string
  variant?: 'div' | 'dl'
  className?: string
  labelClassName?: string
  valueClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const Label = variant === 'dl' ? 'dt' : 'span'
  const Value = variant === 'dl' ? 'dd' : 'span'
  const Panel = variant === 'dl' ? 'dd' : 'div'
  const cardFee = Math.max(0, Math.round((amount - TRUST_SUPPORT_FEE) * 100) / 100)

  return (
    <div className={`grid grid-cols-[1fr_auto] items-baseline gap-x-4 ${className}`}>
      <Label className={labelClassName}>
        Booking fees{' '}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label="What booking fees include"
          title="What booking fees include"
          className="inline-flex items-center justify-center align-middle -my-1.5 w-6 h-6 rounded-full text-slate-400 hover:text-slate-700"
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 7v4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8" cy="4.75" r="0.9" fill="currentColor" />
          </svg>
        </button>
      </Label>
      <Value className={`tabular-nums ${valueClassName}`}>
        {prefix}
        {dollars(amount)}
      </Value>
      <Panel
        id={panelId}
        hidden={!open}
        className="col-span-2 mt-2 rounded-lg bg-white border border-slate-200 px-3 py-2.5 text-xs text-slate-600 leading-relaxed font-normal"
      >
        <p className="font-semibold text-slate-800 mb-1">Booking fees include:</p>
        <ul className="flex flex-col gap-1.5">
          <li className="flex justify-between gap-3">
            <span>
              <span className="font-medium text-slate-800">Card processing.</span> Stripe&apos;s fee for your card:{' '}
              {percent(STRIPE_PERCENTAGE_FEE)} + {Math.round(STRIPE_FIXED_FEE * 100)}¢, or {percent(STRIPE_INTERNATIONAL_PERCENTAGE_FEE)} +{' '}
              {Math.round(STRIPE_FIXED_FEE * 100)}¢ for cards issued outside the US.
            </span>
            <span className="tabular-nums shrink-0">{dollars(cardFee)}</span>
          </li>
          <li className="flex justify-between gap-3">
            <span>
              <span className="font-medium text-slate-800">Trust &amp; Support.</span> Supports our trust and safety work and
              customer support.
            </span>
            <span className="tabular-nums shrink-0">{dollars(TRUST_SUPPORT_FEE)}</span>
          </li>
        </ul>
        <p className="mt-1.5">Booking fees are nonrefundable, except where our refund policy says otherwise.</p>
      </Panel>
    </div>
  )
}
