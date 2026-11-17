'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from '@/app/components/NavigationSpinner'
import type { CleanerMatch } from '@/lib/cleanerMatching'
import { cancelBookingRequestAction } from '@/app/dashboard/messages/[bookingId]/actions'
import { sendReplacementRequestsAction } from './actions'
import CancelReasonSheet from '@/app/components/CancelReasonSheet'
import { CUSTOMER_CANCEL_REASONS, type Cancellation } from '@/lib/cancellationReasons'
import TidyProPickList, { usePersistedPicks } from '@/app/components/TidyProPickList'

const MAX_CHOICES = 3

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

export default function ReplacementPickerView({
  bookingId,
  scheduledDate,
  scheduledTime,
  options,
}: {
  bookingId: string
  scheduledDate: string | null
  scheduledTime: string | null
  options: CleanerMatch[]
}) {
  const router = useRouter()
  // Kept while they look over profiles (TidyProPickList links to each one).
  const { picks: selected, toggle, clear: clearPicks } = usePersistedPicks(`booking:${bookingId}`, options.map((o) => o.id), MAX_CHOICES)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [askingReason, setAskingReason] = useState(false)

  async function handleCancelBooking(cancellation: Cancellation): Promise<string | null> {
    const result = await cancelBookingRequestAction(bookingId, cancellation)
    if ('error' in result) return result.error
    router.push(`/dashboard/messages/${bookingId}`)
    return null
  }

  async function handleSend() {
    setSending(true)
    setError(null)
    const result = await sendReplacementRequestsAction(bookingId, selected)
    if ('error' in result) {
      setSending(false)
      setError(result.error)
      return
    }
    clearPicks()
    router.push('/dashboard/messages')
  }

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-10 max-w-sm mx-auto w-full">
        <Link
          href={`/dashboard/messages/${bookingId}`}
          aria-label="Back"
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-2 mb-4"
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>

        <h1 className="text-2xl font-bold text-slate-900 mb-1">Choose other Tidy Pros</h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-1">
          Check off up to {MAX_CHOICES} available Tidy Pros. If fewer are listed, those are everyone free at that time, and you can pick just one. Tap one to see
          their profile first. The first to accept gets your booking, and the other requests are canceled.
        </p>
        <p className="text-sm font-semibold text-slate-900 mb-5">{formatSchedule(scheduledDate, scheduledTime)}</p>

        {options.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
            <p className="text-sm text-slate-500 leading-relaxed">
              No other Tidy Pros are available at that time. You can cancel your booking below for a refund.
            </p>
          </div>
        ) : (
          <TidyProPickList options={options} picks={selected} onToggle={toggle} max={MAX_CHOICES} disabled={sending} />
        )}

        {options.length > 0 && (
          <p className="text-xs text-slate-500 leading-relaxed mt-5">
            You won&apos;t be charged again. Your payment is held and goes to the Tidy Pro who accepts. If nobody accepts by an hour before your booking, it&apos;s
            canceled and refunded, minus the nonrefundable Stripe fee.
          </p>
        )}

        {error && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mt-4 leading-relaxed">{error}</p>}
      </div>

      <div className="px-5 pb-8 max-w-sm mx-auto w-full flex flex-col gap-3">
        {options.length > 0 && (
          <button
            type="button"
            onClick={handleSend}
            disabled={selected.length === 0 || sending}
            className="w-full py-3.5 rounded-2xl font-semibold text-sm text-white disabled:text-slate-400"
            style={{ backgroundColor: selected.length > 0 ? 'var(--color-brand)' : '#e5e9ef' }}
          >
            {sending ? 'Sending…' : selected.length > 0 ? `Send ${selected.length === 1 ? 'request' : `${selected.length} requests`}` : 'Choose a Tidy Pro'}
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
        <p className="text-xs text-slate-400 text-center">The Stripe processing fee is nonrefundable.</p>
      </div>
    </main>
  )
}
