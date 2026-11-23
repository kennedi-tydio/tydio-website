'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from '@/app/components/NavigationSpinner'
import type { TidyTask } from '@/app/dashboard/types'
import type { QuoteRequestStatus } from '@/lib/quoteRequests'
import { lateCancelRefund } from '@/lib/pricingRules'
import { laundryDetailLabel } from '@/lib/laundry'
import { petDetailLabel } from '@/lib/petTasks'
import { QUOTE_TASK_LABEL } from '@/lib/taskQuotes'
import PetTaskDetails from '@/app/components/PetTaskDetails'
import { approveQuoteAction, declineQuoteAction, removeQuotePromoAction } from './actions'

export type QuotePricing = {
  servicePrice: number
  promo: { code: string; label: string; discount: number } | null
  promoProblem: string | null
  discountedPrice: number
  processingFee: number
  totalPrice: number
}

type Props = {
  quoteId: string
  status: QuoteRequestStatus
  bookingId: string | null
  tasks: TidyTask[]
  fullServiceLabel: string | null
  photoUrls: Record<string, string>
  date: string
  time: string
  recurring: boolean
  addressName: string
  addressLine: string | null
  cleanerName: string
  cleanerPhotoUrl: string | null
  tidyProNote: string | null
  declineReason: string | null
  // Set once there's a quote to pay.
  pricing: QuotePricing | null
  selectedCard: { brand: string; last4: string } | null
  hasPaymentMethods: boolean
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatDateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`
}

function formatClockTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function Row({ label, value, strong = false, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 last:border-b-0">
      <span className={`text-sm ${strong ? 'font-bold' : 'text-slate-800'}`} style={strong ? { color: 'var(--color-brand)' } : undefined}>
        {label}
      </span>
      <span
        className={`text-sm ${strong ? 'font-bold' : 'font-semibold text-slate-900'} ${tone ?? ''}`}
        style={strong ? { color: 'var(--color-brand)' } : undefined}
      >
        {value}
      </span>
    </div>
  )
}

export default function QuoteView(props: Props) {
  const { quoteId, status, bookingId, tasks, pricing, cleanerName, selectedCard } = props
  const router = useRouter()
  const [busy, setBusy] = useState<'pay' | 'decline' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paymentFailed, setPaymentFailed] = useState(false)
  const [promoFailed, setPromoFailed] = useState(false)
  const [confirmDecline, setConfirmDecline] = useState(false)

  const paymentHref = `/dashboard/profile/payment-methods?quoteId=${quoteId}`
  const open = status === 'requested' || status === 'quoted'

  async function handleApprove() {
    setBusy('pay')
    setError(null)
    setPaymentFailed(false)
    setPromoFailed(false)
    const result = await approveQuoteAction(quoteId)
    if ('error' in result) {
      setBusy(null)
      setError(result.error)
      setPaymentFailed(!!result.paymentFailed)
      setPromoFailed(!!result.promoFailed)
      return
    }
    router.push(`/dashboard/messages/${result.bookingId}?from=booking`)
  }

  async function handleDecline() {
    setBusy('decline')
    setError(null)
    const result = await declineQuoteAction(quoteId)
    setBusy(null)
    setConfirmDecline(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  async function handleRemovePromo() {
    setError(null)
    setPromoFailed(false)
    await removeQuotePromoAction(quoteId)
    router.refresh()
  }

  const heading =
    status === 'requested' ? 'Quote Requested'
    : status === 'quoted' || status === 'paying' ? 'Your Quote'
    : status === 'paid' ? 'Quote Approved'
    : 'Quote Request Closed'

  return (
    <main id="main-content" className="min-h-svh bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-48 max-w-sm mx-auto w-full safe-area-inset-bottom">
        <Link href="/dashboard/messages" aria-label="Back to messages" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-2 mb-4">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>

        <h1 className="text-3xl font-bold text-slate-900 mb-3">{heading}</h1>

        {/* Where things stand. */}
        {status === 'requested' && (
          <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 mb-5">
            <p className="text-sm font-semibold text-amber-900 mb-1">Waiting for {cleanerName}&apos;s quote</p>
            <p className="text-xs text-amber-900 leading-relaxed">
              We couldn&apos;t price some of your tasks automatically, so {cleanerName} is looking them over. We&apos;ll let you know when
              your quote is ready. You haven&apos;t been charged.
            </p>
          </div>
        )}
        {status === 'quoted' && (
          <p className="text-sm text-slate-500 mb-5">
            {cleanerName} sent you a quote. Approve &amp; pay to send your booking request, or decline it. Your request goes to {cleanerName} to
            accept once you&apos;ve paid.
          </p>
        )}
        {status === 'paying' && <p role="status" className="text-sm text-slate-500 mb-5">Your payment is going through…</p>}
        {status === 'paid' && (
          <div role="status" className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 mb-5">
            <p className="text-sm font-semibold text-emerald-900 mb-1">Paid. Your booking request was sent.</p>
            <p className="text-xs text-emerald-900 leading-relaxed">{cleanerName} will accept or decline it like any booking request.</p>
            {bookingId && (
              <Link href={`/dashboard/messages/${bookingId}`} className="inline-block text-sm font-semibold mt-2" style={{ color: 'var(--color-brand)' }}>
                View your booking request
              </Link>
            )}
          </div>
        )}
        {(status === 'pro_declined' || status === 'customer_declined' || status === 'expired') && (
          <div role="status" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 mb-5">
            <p className="text-sm font-semibold text-slate-900 mb-1">
              {status === 'pro_declined'
                ? `${cleanerName} can’t quote this booking`
                : status === 'customer_declined'
                  ? 'You declined this quote'
                  : 'This quote request expired'}
            </p>
            {status === 'pro_declined' && props.declineReason && (
              <p className="text-xs text-slate-600 leading-relaxed mb-1">“{props.declineReason}”</p>
            )}
            <p className="text-xs text-slate-600 leading-relaxed">
              You weren&apos;t charged. Your tasks are back on your dashboard, so you can book them again.
            </p>
            <Link href="/dashboard" className="inline-block text-sm font-semibold mt-2" style={{ color: 'var(--color-brand)' }}>
              Go to your tasks
            </Link>
          </div>
        )}

        <div className="flex items-start justify-between gap-3 mb-6">
          <div>
            <p className="text-sm font-bold text-slate-900">{formatDateLabel(props.date)}</p>
            <p className="text-sm text-slate-500">{formatClockTime(props.time)}</p>
            {props.recurring && <p className="text-xs text-slate-500 mt-0.5">Repeats on the schedule you chose</p>}
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-slate-900">{props.addressName}</p>
            {props.addressLine && <p className="text-sm text-slate-500">{props.addressLine}</p>}
          </div>
        </div>

        <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--color-brand)' }}>Your Tidy Pro</h2>
        <div className="rounded-2xl border border-slate-100 px-3 py-2.5 flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-200 flex-shrink-0">
            {props.cleanerPhotoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={props.cleanerPhotoUrl} alt="" className="w-full h-full object-cover" />
            )}
          </div>
          <p className="text-sm font-semibold text-slate-900 truncate">{cleanerName}</p>
        </div>

        {props.fullServiceLabel && (
          <>
            <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--color-brand)' }}>Your Cleaning</h2>
            <p className="text-sm text-slate-700 mb-6">{props.fullServiceLabel}</p>
          </>
        )}

        <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--color-brand)' }}>Tidy Tasks</h2>
        <ul className="flex flex-col mb-4">
          {tasks.map((task) => {
            const quoteDetail =
              task.quotedPrice != null
                ? `${cleanerName.split(' ')[0]}’s quote: $${task.quotedPrice.toFixed(2)}`
                : task.needsQuote ? QUOTE_TASK_LABEL : null
            const meta = [task.room, laundryDetailLabel(task), petDetailLabel(task)].filter(Boolean).join(' · ')
            return (
              <li key={task.id} className="border-b border-slate-100 py-2">
                <p className="text-sm text-slate-700">{task.name || task.room}</p>
                {meta && <p className="text-xs text-slate-400 mt-0.5">{meta}</p>}
                {quoteDetail && <p className="text-xs font-semibold text-amber-700 mt-0.5">{quoteDetail}</p>}
              </li>
            )
          })}
        </ul>

        <PetTaskDetails tasks={tasks} photoUrls={props.photoUrls} showPrepNotice className="mb-6" />

        {props.tidyProNote && (status === 'quoted' || status === 'paying') && (
          <div className="rounded-2xl bg-slate-50 px-4 py-3 mb-6">
            <p className="text-xs font-semibold text-slate-700 mb-0.5">Note from {cleanerName}</p>
            <p className="text-sm text-slate-600 whitespace-pre-line break-words">{props.tidyProNote}</p>
          </div>
        )}

        {status === 'quoted' && !pricing && (
          <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4 leading-relaxed">
            We couldn&apos;t work out the price right now. Please refresh in a moment.
          </p>
        )}

        {status === 'quoted' && pricing && (
          <>
            <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--color-brand)' }}>Order Summary</h2>
            <div className="rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
                <div>
                  <p className="text-sm text-slate-800">Payment method</p>
                  {selectedCard && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      {selectedCard.brand} •••• {selectedCard.last4}
                    </p>
                  )}
                </div>
                <Link href={paymentHref} className="text-sm font-semibold" style={{ color: 'var(--color-brand)' }}>
                  {!props.hasPaymentMethods ? 'Add payment method' : selectedCard ? 'Change payment method' : 'Choose payment method'}
                </Link>
              </div>
              <Row label="Booking price" value={`$${pricing.servicePrice.toFixed(2)}`} />
              {pricing.promo && pricing.promo.discount > 0 && (
                <Row label={`Promo (${pricing.promo.code})`} value={`−$${pricing.promo.discount.toFixed(2)}`} tone="text-green-700" />
              )}
              {pricing.promoProblem && (
                <div className="px-4 py-3 border-b border-slate-100">
                  <p role="alert" className="text-xs text-red-600">{pricing.promoProblem}</p>
                  <button type="button" onClick={handleRemovePromo} className="text-xs font-semibold text-slate-500 mt-1">
                    Remove promo code
                  </button>
                </div>
              )}
              <Row label="Stripe processing fee" value={`$${pricing.processingFee.toFixed(2)}`} />
              <Row label="Total" value={`$${pricing.totalPrice.toFixed(2)}`} strong />
              <p className="text-xs text-slate-500 leading-relaxed px-4 pb-3.5">
                The ${pricing.processingFee.toFixed(2)} Stripe processing fee is nonrefundable. If your booking is canceled or {cleanerName}{' '}
                doesn&apos;t accept it, you&apos;ll be refunded ${pricing.discountedPrice.toFixed(2)}. If you cancel an accepted booking less than
                2 hours before it starts, you&apos;ll be refunded 50% (${lateCancelRefund(pricing.totalPrice).toFixed(2)}).
              </p>
            </div>
          </>
        )}
      </div>

      {open && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 px-5 py-4 safe-area-inset-bottom">
          <div className="max-w-sm mx-auto">
            {error && (
              <div role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-3 leading-relaxed">
                {paymentFailed && (
                  <p className="font-semibold">
                    {selectedCard ? `We couldn’t charge your ${selectedCard.brand} •••• ${selectedCard.last4}.` : 'We couldn’t charge your card.'}
                  </p>
                )}
                <p>{error}</p>
                {paymentFailed && <p className="mt-1 text-slate-600">Add a new card or choose another one. You haven&apos;t been charged.</p>}
                {promoFailed && (
                  <button type="button" onClick={handleRemovePromo} className="mt-1 font-semibold text-slate-700">
                    Remove promo code
                  </button>
                )}
              </div>
            )}

            {confirmDecline ? (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmDecline(false)}
                  disabled={busy != null}
                  className="flex-1 py-3.5 rounded-2xl bg-slate-100 text-sm font-semibold text-slate-600"
                >
                  Keep it
                </button>
                <button
                  type="button"
                  onClick={handleDecline}
                  disabled={busy != null}
                  className="flex-1 py-3.5 rounded-2xl text-sm font-semibold text-white bg-red-600 disabled:opacity-60"
                >
                  {busy === 'decline' ? 'Declining…' : status === 'requested' ? 'Yes, cancel request' : 'Yes, decline'}
                </button>
              </div>
            ) : status === 'quoted' ? (
              <div className="flex flex-col gap-2">
                {paymentFailed || !selectedCard ? (
                  <Link
                    href={paymentHref}
                    className="block w-full py-4 rounded-2xl font-semibold text-base tracking-wide text-white text-center"
                    style={{ backgroundColor: 'var(--color-brand)' }}
                  >
                    {paymentFailed ? 'Use a different payment method' : props.hasPaymentMethods ? 'Choose a payment method' : 'Add a payment method'}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={busy != null || !pricing}
                    className="w-full py-4 rounded-2xl font-semibold text-base tracking-wide text-white disabled:opacity-60"
                    style={{ backgroundColor: 'var(--color-brand)' }}
                  >
                    {busy === 'pay' ? 'Paying…' : pricing ? `Approve & Pay $${pricing.totalPrice.toFixed(2)}` : 'Approve & Pay'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setConfirmDecline(true)}
                  disabled={busy != null}
                  className="w-full py-3 rounded-2xl text-sm font-semibold text-slate-500 bg-slate-100"
                >
                  Decline
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDecline(true)}
                disabled={busy != null}
                className="w-full py-3.5 rounded-2xl text-sm font-semibold text-slate-600 bg-slate-100"
              >
                Cancel quote request
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
