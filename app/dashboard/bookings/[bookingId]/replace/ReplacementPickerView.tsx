'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from '@/app/components/NavigationSpinner'
import type { CleanerMatch } from '@/lib/cleanerMatching'
import { cancelBookingRequestAction } from '@/app/dashboard/messages/[bookingId]/actions'
import { sendReplacementRequestsAction } from './actions'

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

function IconStar() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="#f5a623" stroke="#f5a623" strokeWidth="1">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
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
  const [selected, setSelected] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [cancelling, setCancelling] = useState(false)
  const atLimit = selected.length >= MAX_CHOICES

  async function handleCancelBooking() {
    setCancelling(true)
    setError(null)
    const result = await cancelBookingRequestAction(bookingId)
    if ('error' in result) {
      setCancelling(false)
      setError(result.error)
      return
    }
    router.push(`/dashboard/messages/${bookingId}`)
  }

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < MAX_CHOICES ? [...prev, id] : prev))
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
          Pick up to {MAX_CHOICES} Tidy Pros. The first to accept gets your booking, and the other requests are canceled.
        </p>
        <p className="text-sm font-semibold text-slate-900 mb-5">{formatSchedule(scheduledDate, scheduledTime)}</p>

        {options.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
            <p className="text-sm text-slate-500 leading-relaxed">
              No other Tidy Pros are available at that time. You can cancel your booking below for a refund.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {options.map((cleaner) => {
              const isSelected = selected.includes(cleaner.id)
              return (
                <button
                  key={cleaner.id}
                  type="button"
                  role="checkbox"
                  aria-checked={isSelected}
                  onClick={() => toggle(cleaner.id)}
                  disabled={sending || (atLimit && !isSelected)}
                  className="w-full rounded-2xl border px-4 py-3.5 flex items-center gap-3 text-left shadow-sm transition-colors disabled:opacity-50"
                  style={{ borderColor: isSelected ? 'var(--color-brand)' : '#f1f5f9', backgroundColor: isSelected ? '#e8f9fa' : 'white' }}
                >
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-200 flex-shrink-0">
                    {cleaner.photoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cleaner.photoUrl} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{cleaner.name}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <IconStar />
                      <span className="text-xs text-slate-600">{cleaner.rating.toFixed(1)}</span>
                      <span className="text-xs text-slate-400">· {cleaner.distanceMiles} miles</span>
                    </div>
                    {cleaner.isTopTidyPro && (
                      <span className="text-[10px] font-semibold" style={{ color: 'var(--color-brand)' }}>
                        Top Tidy Pro
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
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
            disabled={selected.length === 0 || sending || cancelling}
            className="w-full py-3.5 rounded-2xl font-semibold text-sm text-white disabled:text-slate-400"
            style={{ backgroundColor: selected.length > 0 ? 'var(--color-brand)' : '#e5e9ef' }}
          >
            {sending ? 'Sending…' : selected.length > 0 ? `Send ${selected.length === 1 ? 'request' : `${selected.length} requests`}` : 'Choose a Tidy Pro'}
          </button>
        )}
        <button
          type="button"
          onClick={handleCancelBooking}
          disabled={sending || cancelling}
          className="w-full py-3 rounded-2xl bg-white border border-slate-200 text-sm font-semibold text-slate-600 disabled:opacity-50"
        >
          {cancelling ? 'Cancelling…' : 'Cancel booking and get a refund'}
        </button>
        <p className="text-xs text-slate-400 text-center">The Stripe processing fee is nonrefundable.</p>
      </div>
    </main>
  )
}
