'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from '@/app/components/NavigationSpinner'
import type { TidyTask } from '@/app/dashboard/types'
import type { QuoteRequestStatus } from '@/lib/quoteRequests'
import { laundryDetailLabel } from '@/lib/laundry'
import { petDetailLabel } from '@/lib/petTasks'
import { MAX_QUOTE_PRICE, MIN_QUOTE_PRICE, isValidQuotePrice, needsQuote } from '@/lib/taskQuotes'
import PetTaskDetails from '@/app/components/PetTaskDetails'
import SuppliesNotice from '@/app/components/SuppliesNotice'
import { declineQuoteRequestAction, previewQuoteAction, sendQuoteAction } from './actions'

type Props = {
  quoteId: string
  status: QuoteRequestStatus
  bookingId: string | null
  customerName: string
  customerPhotoUrl: string | null
  date: string
  time: string
  recurring: boolean
  addressLabel: string | null
  addressLine: string | null
  distanceMiles: number | null
  // The home's square footage bucket, e.g. "1,000-1,999 sqft".
  homeSize: string | null
  // As the customer asked for them.
  tasks: TidyTask[]
  // Prices already sent, by task id, so the quote can be revised before it's paid.
  quotedPrices: Record<string, number>
  fullServiceLabel: string | null
  photoUrls: Record<string, string>
  pets: string
  notes: string | null
  suppliesProvided: boolean
  tidyProNote: string | null
  quotedServicePrice: number | null
  quotedCleanerPay: number | null
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DIRT_LABEL: Record<string, string> = { light: 'Light touch-up', standard: 'Standard cleaning', heavy: 'Heavy cleaning' }

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

export default function ProQuoteView(props: Props) {
  const { quoteId, status, tasks, customerName } = props
  const router = useRouter()
  const editable = status === 'requested' || status === 'quoted'
  const toQuote = tasks.filter(needsQuote)

  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(toQuote.map((t) => [t.id, props.quotedPrices[t.id] != null ? props.quotedPrices[t.id].toFixed(2) : '']))
  )
  const [note, setNote] = useState(props.tidyProNote ?? '')
  const [preview, setPreview] = useState<{ servicePrice: number; cleanerPay: number } | null>(
    props.quotedServicePrice != null && props.quotedCleanerPay != null
      ? { servicePrice: props.quotedServicePrice, cleanerPay: props.quotedCleanerPay }
      : null
  )
  const [busy, setBusy] = useState<'send' | 'decline' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [declining, setDeclining] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [sent, setSent] = useState(false)

  const parsed: Record<string, number> = {}
  for (const t of toQuote) parsed[t.id] = prices[t.id]?.trim() ? Number(prices[t.id]) : Number.NaN
  const allValid = toQuote.every((t) => isValidQuotePrice(parsed[t.id]))
  const parsedKey = JSON.stringify(parsed)

  // The booking's total for the prices entered, shortly after the Tidy Pro stops typing.
  const latestKey = useRef(parsedKey)
  useEffect(() => {
    latestKey.current = parsedKey
    if (!editable || !allValid) return
    const timer = setTimeout(async () => {
      const result = await previewQuoteAction(quoteId, JSON.parse(parsedKey) as Record<string, number>)
      if (latestKey.current !== parsedKey) return
      setPreview('error' in result ? null : result)
    }, 400)
    return () => clearTimeout(timer)
  }, [parsedKey, allValid, editable, quoteId])

  async function handleSend() {
    if (!allValid) return
    setBusy('send')
    setError(null)
    const result = await sendQuoteAction(quoteId, parsed, note)
    setBusy(null)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setSent(true)
    router.refresh()
  }

  async function handleDecline() {
    setBusy('decline')
    setError(null)
    const result = await declineQuoteRequestAction(quoteId, declineReason)
    setBusy(null)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setDeclining(false)
    router.refresh()
  }

  return (
    <main id="main-content" className="min-h-svh bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-48 max-w-sm mx-auto w-full safe-area-inset-bottom">
        <Link href="/pro/messages" aria-label="Back to messages" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-2 mb-4">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>

        <h1 className="text-3xl font-bold text-slate-900 mb-3">Quote Request</h1>

        {status === 'requested' && (
          <p className="text-sm text-slate-500 mb-5">
            Automatic pricing was down when {customerName} added some of these tasks. Enter your price for each one. {customerName} pays
            before the booking request comes to you to accept, and you earn 80% as usual.
          </p>
        )}
        {status === 'quoted' && (
          <div role="status" className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 mb-5">
            <p className="text-sm font-semibold text-emerald-900 mb-1">{sent ? 'Quote sent' : 'Your quote was sent'}</p>
            <p className="text-xs text-emerald-900 leading-relaxed">
              Waiting for {customerName} to approve &amp; pay. You can still change your prices until then.
            </p>
          </div>
        )}
        {status === 'paying' && <p role="status" className="text-sm text-slate-500 mb-5">{customerName} is paying for this booking now.</p>}
        {status === 'paid' && (
          <div role="status" className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 mb-5">
            <p className="text-sm font-semibold text-emerald-900 mb-1">{customerName} approved &amp; paid</p>
            <p className="text-xs text-emerald-900 leading-relaxed">Their booking request is waiting for you to accept or decline.</p>
            {props.bookingId && (
              <Link href={`/pro/messages/${props.bookingId}`} className="inline-block text-sm font-semibold mt-2" style={{ color: 'var(--color-brand)' }}>
                Open the booking request
              </Link>
            )}
          </div>
        )}
        {(status === 'pro_declined' || status === 'customer_declined' || status === 'expired') && (
          <div role="status" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 mb-5">
            <p className="text-sm font-semibold text-slate-900">
              {status === 'pro_declined' ? 'You declined this request' : status === 'customer_declined' ? `${customerName} declined` : 'This request expired'}
            </p>
          </div>
        )}

        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-100 flex-shrink-0 flex items-center justify-center text-slate-500 font-semibold">
            {props.customerPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={props.customerPhotoUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              customerName.charAt(0).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">{customerName}</p>
            <p className="text-xs text-slate-500">
              {formatDateLabel(props.date)} · {formatClockTime(props.time)}
              {props.recurring ? ' · Recurring' : ''}
            </p>
          </div>
        </div>

        {(props.addressLabel || props.addressLine) && (
          <p className={`text-sm text-slate-600 ${props.homeSize ? '' : 'mb-5'}`}>
            {[props.addressLabel, props.addressLine].filter(Boolean).join(' · ')}
            {props.distanceMiles != null && <span className="text-slate-400"> · {props.distanceMiles} miles away</span>}
          </p>
        )}
        {props.homeSize && <p className="text-sm text-slate-600 mb-5">Home size: {props.homeSize}</p>}

        {props.fullServiceLabel && (
          <>
            <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--color-brand)' }}>Cleaning</h2>
            <p className="text-sm text-slate-700 mb-5">{props.fullServiceLabel}</p>
          </>
        )}

        <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--color-brand)' }}>Tasks</h2>
        <ul className="flex flex-col gap-3 mb-5">
          {tasks.map((task) => {
            const quote = needsQuote(task)
            const meta = [
              task.room,
              task.dirtLevel ? DIRT_LABEL[task.dirtLevel] : null,
              laundryDetailLabel(task),
              petDetailLabel(task),
              ...(task.unusual ?? []),
            ].filter(Boolean).join(' · ')
            const value = prices[task.id] ?? ''
            const invalid = value.trim() !== '' && !isValidQuotePrice(Number(value))
            const earn = isValidQuotePrice(Number(value)) ? Math.round(Number(value) * 80) / 100 : null
            return (
              <li key={task.id} className={`rounded-2xl border px-4 py-3 ${quote ? 'border-amber-200' : 'border-slate-100'}`}>
                <p className="text-sm font-semibold text-slate-900">{task.name || task.room}</p>
                {meta && <p className="text-xs text-slate-400 mt-0.5">{meta}</p>}
                {task.notes && <p className="text-xs text-slate-500 italic mt-1 whitespace-pre-line break-words">{task.notes}</p>}
                {quote ? (
                  <div className="mt-3">
                    <label htmlFor={`price-${task.id}`} className="block text-xs font-semibold text-slate-700 mb-1">
                      Your price for this task
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-500">$</span>
                      <input
                        id={`price-${task.id}`}
                        type="number"
                        inputMode="decimal"
                        min={MIN_QUOTE_PRICE}
                        max={MAX_QUOTE_PRICE}
                        step={0.01}
                        value={value}
                        placeholder="0.00"
                        disabled={!editable || busy != null}
                        onChange={(e) => setPrices((prev) => ({ ...prev, [task.id]: e.target.value }))}
                        aria-invalid={invalid}
                        className={`w-28 rounded-xl border px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand ${invalid ? 'border-red-400' : 'border-slate-200'}`}
                      />
                      {earn != null && <span className="text-xs text-slate-500">You earn ${earn.toFixed(2)}</span>}
                    </div>
                    {invalid && (
                      <p className="text-xs text-red-600 mt-1">
                        Enter a price from ${MIN_QUOTE_PRICE} to ${MAX_QUOTE_PRICE}, in dollars and cents.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 mt-1">Already priced</p>
                )}
              </li>
            )
          })}
        </ul>

        <PetTaskDetails tasks={tasks} photoUrls={props.photoUrls} className="mb-5" />

        <div className="mb-5">
          <p className="text-sm font-bold text-slate-900 mb-1">Pets</p>
          <p className="text-sm text-slate-500 whitespace-pre-line break-words">{props.pets}</p>
        </div>
        {props.notes && (
          <div className="mb-5">
            <p className="text-sm font-bold text-slate-900 mb-1">Notes</p>
            <p className="text-sm text-slate-500 whitespace-pre-line break-words">{props.notes}</p>
          </div>
        )}
        <SuppliesNotice provided={props.suppliesProvided} className="mb-5" />

        {editable && (
          <div className="mb-5">
            <label htmlFor="quote-note" className="block text-sm font-bold text-slate-900 mb-1">
              Note to {customerName} <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              id="quote-note"
              value={note}
              maxLength={500}
              rows={2}
              disabled={busy != null}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything about your quote they should know"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand resize-none"
            />
          </div>
        )}

        {preview && ((editable && allValid) || status === 'paying') && (
          <div className="rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
              <span className="text-sm text-slate-800">{customerName} pays for the booking</span>
              <span className="text-sm font-semibold text-slate-900">${preview.servicePrice.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3.5">
              <span className="text-sm font-bold" style={{ color: 'var(--color-brand)' }}>You earn</span>
              <span className="text-sm font-bold" style={{ color: 'var(--color-brand)' }}>${preview.cleanerPay.toFixed(2)}</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed px-4 pb-3.5">
              Every task in the booking, plus any Top Tidy Pro or distance surcharge, before tips. The card fee is paid by the customer.
            </p>
          </div>
        )}
      </div>

      {editable && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 px-5 py-4 safe-area-inset-bottom">
          <div className="max-w-sm mx-auto">
            {error && (
              <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-3 leading-relaxed">
                {error}
              </p>
            )}
            {declining ? (
              <>
                <label htmlFor="decline-reason" className="block text-xs font-semibold text-slate-700 mb-1">
                  Why can&apos;t you quote it? <span className="font-normal text-slate-400">(optional, shown to {customerName})</span>
                </label>
                <textarea
                  id="decline-reason"
                  value={declineReason}
                  maxLength={500}
                  rows={2}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand resize-none mb-3"
                />
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setDeclining(false)}
                    disabled={busy != null}
                    className="flex-1 py-3.5 rounded-2xl bg-slate-100 text-sm font-semibold text-slate-600"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleDecline}
                    disabled={busy != null}
                    className="flex-1 py-3.5 rounded-2xl text-sm font-semibold text-white bg-red-600 disabled:opacity-60"
                  >
                    {busy === 'decline' ? 'Declining…' : 'Decline request'}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setDeclining(true)}
                  disabled={busy != null}
                  className="flex-1 py-3.5 rounded-2xl bg-slate-100 text-sm font-semibold text-slate-600"
                >
                  Decline
                </button>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!allValid || busy != null}
                  className="flex-[2] py-3.5 rounded-2xl text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: 'var(--color-brand)' }}
                >
                  {busy === 'send' ? 'Sending…' : status === 'quoted' ? 'Update quote' : 'Send quote'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
