'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from '@/app/components/NavigationSpinner'
import { cancelBookingRequestAction } from '@/app/dashboard/messages/[bookingId]/actions'
import { sendChainReplacementAction } from './actions'
import CancelReasonSheet from '@/app/components/CancelReasonSheet'
import { CUSTOMER_CANCEL_REASONS, type Cancellation } from '@/lib/cancellationReasons'
import TidyProPickList, { usePersistedPicks } from '@/app/components/TidyProPickList'
import type { ReplacementOption } from '@/lib/replacementChain'

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatSchedule(date: string | null, time: string | null): string {
  if (!date) return ''
  const d = new Date(`${date}T00:00:00`)
  const dateLabel = `${WEEKDAYS_SHORT[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`
  if (!time) return dateLabel
  const [h, m] = time.split(':').map(Number)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${dateLabel} at ${h12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

// What picking this Tidy Pro does to what the customer has paid: plus what they'd be
// charged, or minus what they'd be refunded.
function PriceDifference({ price }: { price: ReplacementOption['price'] }) {
  if (price.extraCharge > 0) {
    return (
      <p className="mt-1">
        <span className="text-sm font-semibold text-slate-900">+{money(price.extraCharge)}</span>
        <span className="block text-[11px] text-slate-500">Charged to your card when you confirm</span>
      </p>
    )
  }
  if (price.refund > 0) {
    return (
      <p className="mt-1">
        <span className="text-sm font-semibold text-emerald-700">−{money(price.refund)}</span>
        <span className="block text-[11px] text-slate-500">You&apos;ll be refunded this amount</span>
      </p>
    )
  }
  return <p className="mt-1 text-sm font-semibold text-slate-500">Same price</p>
}

// A Standard / Deep Cleaning whose Tidy Pro declined or canceled: the customer asks one
// replacement at a time, sees their price, and confirms. See lib/replacementChain.
export default function ChainReplacementPickerView({
  bookingId,
  scheduledDate,
  scheduledTime,
  paidTotal,
  options,
}: {
  bookingId: string
  scheduledDate: string | null
  scheduledTime: string | null
  paidTotal: number
  options: ReplacementOption[]
}) {
  const router = useRouter()
  // Kept while they look over profiles (TidyProPickList links to each one).
  const { picks, toggle, clear } = usePersistedPicks(`booking:${bookingId}`, options.map((o) => o.id), 1)
  const chosen = options.find((o) => o.id === picks[0]) ?? null
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [askingReason, setAskingReason] = useState(false)

  async function handleCancelBooking(cancellation: Cancellation): Promise<string | null> {
    const result = await cancelBookingRequestAction(bookingId, cancellation)
    if ('error' in result) return result.error
    clear()
    router.push(`/dashboard/messages/${bookingId}`)
    return null
  }

  async function handleConfirm() {
    if (!chosen) return
    setSending(true)
    setError(null)
    const result = await sendChainReplacementAction(bookingId, chosen.id, Math.round(chosen.price.difference * 100))
    if ('error' in result) {
      setSending(false)
      setError(result.error)
      return
    }
    clear()
    router.push('/dashboard/messages')
  }

  return (
    <main id="main-content" className="min-h-svh bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-10 max-w-sm mx-auto w-full">
        <Link
          href={`/dashboard/messages/${bookingId}`}
          aria-label="Back"
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-2 mb-4"
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 12L6 8l4-4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>

        <h1 className="text-2xl font-bold text-slate-900 mb-1">Choose a replacement</h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-1">
          Pick one available Tidy Pro to send your booking to. Each Tidy Pro sets their own price, so yours may go up or down. If they decline, you can
          choose someone else, or cancel your booking for a refund.
        </p>
        <p className="text-sm font-semibold text-slate-900 mb-1">{formatSchedule(scheduledDate, scheduledTime)}</p>
        <p className="text-xs text-slate-500 mb-5">You&apos;ve paid {money(paidTotal)} so far.</p>

        {options.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
            <p className="text-sm text-slate-500 leading-relaxed">
              No other Tidy Pros are available at that time. You can cancel your booking below for a refund.
            </p>
          </div>
        ) : (
          <TidyProPickList
            options={options}
            picks={picks}
            onToggle={toggle}
            max={1}
            disabled={sending}
            detail={(cleaner) => <PriceDifference price={(cleaner as ReplacementOption).price} />}
          />
        )}

        {chosen && (
          <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700 leading-relaxed" aria-live="polite">
            <p className="font-semibold text-slate-900 mb-1">Sending to {chosen.name}</p>
            {chosen.price.extraCharge > 0 ? (
              <p>
                Their price is higher, so your card will be charged {money(chosen.price.extraCharge)} more (including the card processing fee) when you
                confirm. Your new total is {money(chosen.price.newTotal)}.
              </p>
            ) : chosen.price.refund > 0 ? (
              <p>
                Their price is lower, so {money(chosen.price.refund)} will be refunded to your card when you confirm. Your new total is{' '}
                {money(chosen.price.newTotal)}. Refunds usually reach your card within 5–10 business days.
              </p>
            ) : (
              <p>Their price is the same as what you&apos;ve paid, so there&apos;s nothing more to pay.</p>
            )}
          </div>
        )}

        {options.length > 0 && (
          <p className="text-xs text-slate-500 leading-relaxed mt-5">
            If nobody accepts by an hour before your booking, it&apos;s canceled and everything you&apos;ve paid is refunded, minus the nonrefundable booking fees.
          </p>
        )}

        {error && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mt-4 leading-relaxed">{error}</p>}
      </div>

      <div className="px-5 pb-8 max-w-sm mx-auto w-full flex flex-col gap-3">
        {options.length > 0 && (
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!chosen || sending}
            className="w-full py-3.5 rounded-2xl font-semibold text-sm text-white disabled:text-slate-400"
            style={{ backgroundColor: chosen ? 'var(--color-brand)' : '#e5e9ef' }}
          >
            {sending ? 'Sending…' : chosen ? 'Confirm request' : 'Choose a Tidy Pro'}
          </button>
        )}
        <button
          type="button"
          onClick={() => setAskingReason(true)}
          disabled={sending}
          className="w-full py-3 rounded-2xl bg-white border border-slate-200 text-sm font-semibold text-slate-600 disabled:opacity-50"
        >
          Cancel booking and get a refund
        </button>
        {askingReason && (
          <CancelReasonSheet reasons={CUSTOMER_CANCEL_REASONS} onConfirm={handleCancelBooking} onClose={() => setAskingReason(false)} />
        )}
        <p className="text-xs text-slate-400 text-center">Booking fees are nonrefundable.</p>
      </div>
    </main>
  )
}
