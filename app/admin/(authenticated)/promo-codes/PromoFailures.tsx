'use client'

import { useState, useTransition } from 'react'
import { setPromoFailureResolvedAction } from './actions'

export type PromoFailure = {
  id: string
  code: string
  discount_label: string
  stage: 'applied' | 'confirmed'
  customer_label: string | null
  tidy_pro_label: string | null
  scheduled_date: string | null
  scheduled_time: string | null
  task_names: string[]
  service_price: number
  discount: number
  customer_pays: number
  cleaner_pay: number
  shortfall: number
  available_balance: number | null
  committed: number
  resolved_at: string | null
  created_at: string
}

function money(n: number | null): string {
  return n == null ? 'Could not be checked' : `$${Number(n).toFixed(2)}`
}

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  })
}

function bookingWhen(date: string | null, time: string | null): string {
  if (!date) return '—'
  const d = new Date(`${date}T00:00:00`)
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  if (!time) return day
  const [h, m] = time.split(':').map(Number)
  const clock = `${h % 12 || 12}:${String(m ?? 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
  return `${day} at ${clock}`
}

function toAdd(f: PromoFailure): number | null {
  if (f.available_balance == null) return null
  return Math.max(0, Math.round((Number(f.shortfall) + Number(f.committed) - Number(f.available_balance)) * 100) / 100)
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className={strong ? 'font-bold text-red-600' : 'font-medium text-slate-800'}>{value}</span>
    </div>
  )
}

export default function PromoFailures({ failures }: { failures: PromoFailure[] }) {
  const [showResolved, setShowResolved] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const open = failures.filter((f) => !f.resolved_at)
  const visible = showResolved ? failures : open

  function setResolved(id: string, resolved: boolean) {
    setError(null)
    startTransition(async () => {
      const result = await setPromoFailureResolvedAction(id, resolved)
      if (result.error) setError(result.error)
    })
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <h2 className="font-semibold text-slate-900">
          Codes that didn&apos;t work{' '}
          {open.length > 0 && (
            <span className="ml-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700">{open.length} open</span>
          )}
        </h2>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} className="accent-brand" />
          Show resolved
        </label>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Turned away because Tydio&apos;s Stripe balance couldn&apos;t cover the difference between the Tidy Pro&apos;s pay and
        the discounted price. The customer was told &ldquo;Promo code is no longer valid.&rdquo; You were emailed each one.
      </p>
      {error && <p role="alert" className="text-red-500 text-xs mb-3">{error}</p>}

      {visible.length === 0 ? (
        <p className="text-sm text-slate-400">{failures.length === 0 ? 'Every promo code has worked so far.' : 'Nothing open.'}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((f) => {
            const add = toAdd(f)
            return (
              <div
                key={f.id}
                className={`rounded-xl border p-4 space-y-3 ${f.resolved_at ? 'border-slate-100 opacity-60' : 'border-red-100 bg-red-50/30'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono font-semibold text-slate-900">
                      {f.code} <span className="font-sans font-normal text-xs text-slate-500">· {f.discount_label}</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {when(f.created_at)} · {f.stage === 'applied' ? 'Applied at checkout' : 'At booking confirmation'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setResolved(f.id, !f.resolved_at)}
                    className="text-xs font-semibold px-2.5 py-1 rounded-full border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-50 flex-shrink-0"
                  >
                    {f.resolved_at ? 'Reopen' : 'Mark resolved'}
                  </button>
                </div>

                <div className="space-y-1 text-xs">
                  <p><span className="text-slate-500">Customer: </span><span className="text-slate-800">{f.customer_label ?? '—'}</span></p>
                  <p><span className="text-slate-500">Tidy Pro: </span><span className="text-slate-800">{f.tidy_pro_label ?? '—'}</span></p>
                  <p><span className="text-slate-500">Booking: </span><span className="text-slate-800">{bookingWhen(f.scheduled_date, f.scheduled_time)}</span></p>
                  {f.task_names.length > 0 && (
                    <p><span className="text-slate-500">Tasks: </span><span className="text-slate-800">{f.task_names.join(', ')}</span></p>
                  )}
                </div>

                <div className="space-y-1 border-t border-slate-100 pt-3">
                  <Row label="Booking price (full)" value={money(f.service_price)} />
                  <Row label="Promo discount" value={`−${money(f.discount)}`} />
                  <Row label="Customer would pay" value={money(f.customer_pays)} />
                  <Row label="Tidy Pro payout (80%)" value={money(f.cleaner_pay)} />
                  <Row label="Tydio would have to cover" value={money(f.shortfall)} strong />
                </div>

                <div className="space-y-1 border-t border-slate-100 pt-3">
                  <Row label="Available Stripe balance" value={money(f.available_balance)} />
                  <Row label="Set aside for other promo bookings" value={money(f.committed)} />
                  {add != null && <Row label="Add at least" value={money(add)} strong />}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
