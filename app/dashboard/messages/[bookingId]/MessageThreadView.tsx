'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from '@/app/components/NavigationSpinner'
import type { TidyTask } from '@/app/dashboard/types'
import { cancelBookingRequestAction, respondToTimeProposalAction, sendMessageAction, startCallAction } from './actions'

export type ChatMessage = {
  id: string
  senderRole: 'USER' | 'TIDYPRO'
  body: string
  createdAt: string
  // A new start time the Tidy Pro suggested, in the booking's time zone.
  proposal?: { date: string; time: string; status: string } | null
}

function formatMessageTime(iso: string): string {
  const d = new Date(iso)
  const h = d.getHours()
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(d.getMinutes()).padStart(2, '0')} ${period}`
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatDateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`
}

function formatClockTime(minutesSinceMidnight: number): string {
  const h = Math.floor(minutesSinceMidnight / 60) % 24
  const m = minutesSinceMidnight % 60
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function formatTimeRange(time: string, durationMinutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const start = h * 60 + m
  return `${formatClockTime(start)} - ${formatClockTime(start + durationMinutes)}`
}

function IconBack() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M10 12L6 8l4-4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconPhone() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    </svg>
  )
}

function IconSend() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

function IconX() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M4 4l8 8M4 12L12 4" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M3 8.5l3.5 3.5L13 5" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Avatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt={name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
  }
  return (
    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-slate-100 text-slate-500 font-semibold text-sm">
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className={open ? 'rotate-180' : ''}>
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function BookingDetails({
  isAccepted,
  distanceMiles,
  addressLabel,
  addressLine,
  tasks,
  suppliesProvided,
  pets,
  notes,
}: {
  isAccepted: boolean
  distanceMiles: number | null
  addressLabel: string | null
  addressLine: string | null
  tasks: TidyTask[]
  suppliesProvided: boolean
  pets: string | null
  notes: string | null
}) {
  return (
    <>
      <p className="text-sm font-bold text-slate-900 mt-2">Location</p>
      {isAccepted ? (
        <>
          <p className="text-sm text-slate-600">{addressLabel ?? 'Address on file'}</p>
          {addressLine && <p className="text-xs text-slate-400">{addressLine}</p>}
        </>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            {distanceMiles != null ? `${distanceMiles.toFixed(1)} miles away` : 'Nearby'}
          </p>
          <p className="text-xs text-slate-400">Address will be revealed if the booking is accepted</p>
        </>
      )}

      <p className="text-sm font-bold text-slate-900 mt-3">Tasks</p>
      {tasks.map((task) => (
        <p key={task.id} className="text-sm text-slate-600">
          {task.name || task.room}
        </p>
      ))}
      <p className="text-xs text-slate-400">
        {suppliesProvided ? "You'll provide the cleaning supplies" : 'Cleaning supplies will be provided'}
      </p>

      {pets && (
        <>
          <p className="text-sm font-bold text-slate-900 mt-3">Pets</p>
          <p className="text-sm text-slate-600">{pets}</p>
        </>
      )}

      {notes && (
        <>
          <p className="text-sm font-bold text-slate-900 mt-3">Notes</p>
          <p className="text-sm text-slate-600">{notes}</p>
        </>
      )}
    </>
  )
}

type Props = {
  bookingId: string
  cleanerName: string
  cleanerPhotoUrl: string | null
  // Calls go through Tydio's number, so the other side's phone is never sent here.
  canCall: boolean
  scheduledDate: string | null
  scheduledTime: string | null
  durationMinutes: number
  distanceMiles: number | null
  addressLabel: string | null
  addressLine: string | null
  tasks: TidyTask[]
  pets: string | null
  notes: string | null
  suppliesProvided: boolean
  totalPrice: number
  canChooseReplacements: boolean
  // The cleaner accepted, then canceled. Shown like a decline otherwise.
  cleanerCancelled: boolean
  cancelledNote: string | null
  status: string
  decisionStatus: string
  progressStatus: string | null
  messages: ChatMessage[]
}

export default function MessageThreadView({
  bookingId,
  cleanerName,
  cleanerPhotoUrl,
  canCall,
  scheduledDate,
  scheduledTime,
  durationMinutes,
  distanceMiles,
  addressLabel,
  addressLine,
  tasks,
  pets,
  notes,
  suppliesProvided,
  totalPrice,
  canChooseReplacements,
  cleanerCancelled,
  cancelledNote,
  status: initialStatus,
  decisionStatus,
  progressStatus,
  messages: initialMessages,
}: Props) {
  const router = useRouter()
  const [status, setStatus] = useState(initialStatus)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  // `initialMessages` comes straight from the server component, so anything
  // already in it is authoritative — only an in-flight send that the server
  // hasn't echoed back yet needs to live in local state.
  const [pendingMessages, setPendingMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const scrollEndRef = useRef<HTMLDivElement>(null)
  const firstName = cleanerName.split(' ')[0]
  const messages = [...initialMessages, ...pendingMessages]

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  // Picks up the cleaner's replies without the customer needing to reload —
  // this thread has no realtime subscription yet, so polling is the cheapest
  // way to approximate it.
  useEffect(() => {
    const interval = setInterval(() => router.refresh(), 4000)
    return () => clearInterval(interval)
  }, [router])

  const [calling, setCalling] = useState(false)
  const [callNote, setCallNote] = useState<{ message: string; error: boolean } | null>(null)

  async function handleCall() {
    if (calling) return
    setCalling(true)
    setCallNote(null)
    const result = await startCallAction(bookingId)
    setCalling(false)
    setCallNote(
      'error' in result
        ? { message: result.error, error: true }
        : { message: "We're calling your phone now. Answer and press 1 to be connected.", error: false }
    )
  }

  async function handleSend() {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    const optimisticId = `optimistic-${Date.now()}`
    setPendingMessages((prev) => [...prev, { id: optimisticId, senderRole: 'USER', body, createdAt: new Date().toISOString() }])
    setDraft('')
    const result = await sendMessageAction(bookingId, body)
    setSending(false)
    if ('error' in result) {
      setPendingMessages((prev) => prev.filter((m) => m.id !== optimisticId))
      setDraft(body)
      return
    }
    setPendingMessages((prev) => prev.filter((m) => m.id !== optimisticId))
    router.refresh()
  }

  // The cleaner's own accept/decline actions aren't wired up yet (that's the
  // next piece — their side of this same thread), but this view already
  // renders whichever outcome the booking row ends up in.
  const outcome: 'pending' | 'cancelled' | 'declined' | 'accepted' =
    status === 'cancelled' ? 'cancelled' : status === 'declined' ? 'declined' : decisionStatus === 'accepted' ? 'accepted' : 'pending'
  const isAccepted = outcome === 'accepted'
  const canChangeTime = status === 'pending' || (status === 'scheduled' && progressStatus == null)
  const pendingProposal = messages.find((m) => m.proposal?.status === 'pending')?.proposal ?? null
  const statusLabel =
    status === 'completed'
      ? 'Completed'
      : outcome === 'accepted'
        ? 'Accepted'
        : outcome === 'declined'
          ? 'Declined'
          : outcome === 'cancelled'
            ? 'Canceled'
            : 'Pending'
  const [answering, setAnswering] = useState<{ id: string; approve: boolean } | null>(null)
  const [proposalError, setProposalError] = useState<{ id: string; message: string } | null>(null)

  async function handleProposalAnswer(messageId: string, approve: boolean) {
    setAnswering({ id: messageId, approve })
    setProposalError(null)
    const result = await respondToTimeProposalAction(messageId, approve)
    setAnswering(null)
    if ('error' in result) {
      setProposalError({ id: messageId, message: result.error })
      return
    }
    router.refresh()
  }

  async function handleCancel() {
    setCancelling(true)
    setCancelError(null)
    const result = await cancelBookingRequestAction(bookingId)
    setCancelling(false)
    if ('error' in result) {
      setCancelError(result.error)
      return
    }
    setStatus('cancelled')
  }

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <h1 className="sr-only">Messages</h1>
      {/* Header and booking summary stay pinned while the chat scrolls */}
      <div className="sticky top-0 z-20 bg-white shadow-sm">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
        <button
          type="button"
          onClick={() => router.push('/dashboard/messages')}
          aria-label="Back"
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-2"
        >
          <IconBack />
        </button>
        <Avatar name={cleanerName} photoUrl={cleanerPhotoUrl} />
        <p className="font-semibold text-slate-900 flex-1 truncate">{cleanerName}</p>
        {canCall && (
          <button
            type="button"
            onClick={handleCall}
            disabled={calling}
            aria-label={`Call ${cleanerName}`}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 disabled:opacity-50"
          >
            <IconPhone />
          </button>
        )}
      </div>
      {callNote && (
        <p
          role={callNote.error ? 'alert' : 'status'}
          className={`px-5 py-2 text-xs border-b border-slate-100 ${callNote.error ? 'text-red-600' : 'text-slate-600'}`}
        >
          {callNote.message}
        </p>
      )}

      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
        <div className="max-w-sm mx-auto w-full">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold" style={{ color: 'var(--color-brand)' }}>
                Booking Summary · {statusLabel}
              </p>
              {scheduledDate && (
                <p className="text-sm font-semibold text-slate-900">
                  {formatDateLabel(scheduledDate)}
                  {scheduledTime && <span className="font-normal text-slate-500"> · {formatTimeRange(scheduledTime, durationMinutes)}</span>}
                </p>
              )}
              {pendingProposal && canChangeTime && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {`${firstName} suggested ${formatTimeRange(pendingProposal.time, durationMinutes)} · waiting for your approval`}
                </p>
              )}
            </div>
            <p className="text-sm font-bold flex-shrink-0" style={{ color: 'var(--color-brand)' }}>
              ${totalPrice}
            </p>
          </div>

          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => setDetailsOpen((open) => !open)}
              aria-expanded={detailsOpen}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-600"
            >
              {detailsOpen ? 'Hide details' : 'Details'} <IconChevron open={detailsOpen} />
            </button>
          </div>

          {detailsOpen && (
            <div className="mt-2 max-h-[45vh] overflow-y-auto">
              <BookingDetails
                isAccepted={isAccepted}
                distanceMiles={distanceMiles}
                addressLabel={addressLabel}
                addressLine={addressLine}
                tasks={tasks}
                suppliesProvided={suppliesProvided}
                pets={pets}
                notes={notes}
              />
            </div>
          )}
        </div>
      </div>
      </div>

      {/* Thread */}
      <div className="flex-1 overflow-y-auto px-5 py-6 max-w-sm mx-auto w-full">
        <div
          className="rounded-2xl rounded-br-sm px-4 py-3 mb-4 ml-auto max-w-[85%] text-sm leading-relaxed text-white"
          style={{ backgroundColor: 'var(--color-brand)' }}
        >
          You have requested a Tidy Task Booking from {firstName}. You will be notified when she accepts the booking!
        </div>

        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
          <p className="text-sm font-bold mb-3" style={{ color: 'var(--color-brand)' }}>
            Booking Request
          </p>

          {scheduledDate && <p className="text-sm font-semibold text-slate-900">{formatDateLabel(scheduledDate)}</p>}
          {scheduledTime && (
            <p className="text-sm text-slate-500 mb-3">{formatTimeRange(scheduledTime, durationMinutes)}</p>
          )}

          <BookingDetails
            isAccepted={isAccepted}
            distanceMiles={distanceMiles}
            addressLabel={addressLabel}
            addressLine={addressLine}
            tasks={tasks}
            suppliesProvided={suppliesProvided}
            pets={pets}
            notes={notes}
          />

          <div className="flex items-center justify-between border-t border-slate-200 mt-4 pt-3">
            <span className="text-sm font-bold" style={{ color: 'var(--color-brand)' }}>
              Total
            </span>
            <span className="text-sm font-bold" style={{ color: 'var(--color-brand)' }}>
              ${totalPrice}
            </span>
          </div>

          {cancelError && <p role="alert" className="text-xs text-red-600 mt-3">{cancelError}</p>}

          {outcome === 'pending' && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
              className="w-full mt-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600 disabled:opacity-50"
            >
              {cancelling ? 'Cancelling…' : 'Cancel'}
            </button>
          )}
          {outcome === 'cancelled' && (
            <div className="flex items-center justify-center gap-1.5 w-full mt-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-bold text-red-600">
              <IconX /> Canceled
            </div>
          )}
          {outcome === 'declined' && (
            <div className="flex items-center justify-center gap-1.5 w-full mt-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-bold text-red-600">
              <IconX /> {cleanerCancelled ? 'Canceled' : 'Declined'}
            </div>
          )}
          {outcome === 'accepted' && (
            <div className="flex items-center justify-center gap-1.5 w-full mt-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-bold text-green-600">
              <IconCheck /> Accepted
            </div>
          )}
        </div>

        {outcome === 'cancelled' && (
          <div
            className={`rounded-2xl px-4 py-3 mt-4 max-w-[85%] text-sm leading-relaxed text-white ${cancelledNote ? 'rounded-bl-sm mr-auto' : 'rounded-br-sm ml-auto'}`}
            style={{ backgroundColor: cancelledNote ? '#1a2332' : 'var(--color-brand)' }}
          >
            {cancelledNote ?? 'You canceled your booking'}
          </div>
        )}
        {outcome === 'declined' && (
          <div
            className="rounded-2xl rounded-bl-sm px-4 py-3 mt-4 mr-auto max-w-[85%] text-sm leading-relaxed text-white"
            style={{ backgroundColor: '#1a2332' }}
          >
            {cleanerCancelled ? `${firstName} canceled your booking` : `${firstName} declined your booking request`}
          </div>
        )}
        {outcome === 'declined' && canChooseReplacements && (
          <Link
            href={`/dashboard/bookings/${bookingId}/replace`}
            className="block w-full mt-4 py-3 rounded-2xl text-center text-sm font-semibold text-white"
            style={{ backgroundColor: 'var(--color-brand)' }}
          >
            Choose other Tidy Pros
          </Link>
        )}
        {outcome === 'declined' && canChooseReplacements && (
          <>
            <p className="text-xs text-slate-500 text-center leading-relaxed mt-2">You won&apos;t be charged again. Your payment is held for your booking. If you cancel, you&apos;re refunded minus the nonrefundable Stripe fee.</p>
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
              className="w-full mt-3 py-3 rounded-2xl bg-white border border-slate-200 text-sm font-semibold text-slate-600 disabled:opacity-50"
            >
              {cancelling ? 'Cancelling…' : 'Cancel booking and get a refund'}
            </button>
          </>
        )}
        {outcome === 'accepted' && (
          <div
            className="rounded-2xl rounded-bl-sm px-4 py-3 mt-4 mr-auto max-w-[85%] text-sm leading-relaxed text-white"
            style={{ backgroundColor: '#1a2332' }}
          >
            {`${firstName} accepted your booking request`}
          </div>
        )}

        {messages.map((message) =>
          message.proposal ? (
            <div key={message.id} className="rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-3 mt-4 mr-auto max-w-[85%]">
              <p className="text-xs font-bold" style={{ color: 'var(--color-brand)' }}>
                {`${firstName} suggested a new start time`}
              </p>
              <p className="text-sm font-semibold text-slate-900 mt-1">{formatDateLabel(message.proposal.date)}</p>
              <p className="text-sm text-slate-500">{formatTimeRange(message.proposal.time, durationMinutes)}</p>
              {scheduledTime && message.proposal.status === 'pending' && (
                <p className="text-xs text-slate-400 mt-1">{`Currently ${formatTimeRange(scheduledTime, durationMinutes)}`}</p>
              )}

              {message.proposal.status === 'pending' && canChangeTime ? (
                <>
                  {proposalError?.id === message.id && <p role="alert" className="text-xs text-red-600 mt-2">{proposalError.message}</p>}
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => handleProposalAnswer(message.id, false)}
                      disabled={answering !== null}
                      className="flex-1 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600 disabled:opacity-50"
                    >
                      {answering?.id === message.id && !answering.approve ? 'Declining…' : 'Decline'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleProposalAnswer(message.id, true)}
                      disabled={answering !== null}
                      className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                      style={{ backgroundColor: 'var(--color-brand)' }}
                    >
                      {answering?.id === message.id && answering.approve ? 'Approving…' : 'Approve'}
                    </button>
                  </div>
                </>
              ) : (
                <p
                  className={`text-xs font-semibold mt-2 ${
                    message.proposal.status === 'approved'
                      ? 'text-green-600'
                      : message.proposal.status === 'declined'
                        ? 'text-red-600'
                        : 'text-slate-400'
                  }`}
                >
                  {message.proposal.status === 'approved'
                    ? 'You approved the new time'
                    : message.proposal.status === 'declined'
                      ? 'You declined, so the booking keeps its time'
                      : 'No longer active'}
                </p>
              )}
              <p className="text-[10px] text-slate-400 mt-1">{formatMessageTime(message.createdAt)}</p>
            </div>
          ) : message.senderRole === 'USER' ? (
            <div
              key={message.id}
              className="rounded-2xl rounded-br-sm px-4 py-3 mt-4 ml-auto max-w-[85%] text-sm leading-relaxed text-white"
              style={{ backgroundColor: 'var(--color-brand)' }}
            >
              <p className="whitespace-pre-wrap break-words">{message.body}</p>
              <p className="text-[10px] text-white/70 mt-1 text-right">{formatMessageTime(message.createdAt)}</p>
            </div>
          ) : (
            <div
              key={message.id}
              className="rounded-2xl rounded-bl-sm px-4 py-3 mt-4 mr-auto max-w-[85%] text-sm leading-relaxed text-white"
              style={{ backgroundColor: '#1a2332' }}
            >
              <p className="whitespace-pre-wrap break-words">{message.body}</p>
              <p className="text-[10px] text-white/50 mt-1">{formatMessageTime(message.createdAt)}</p>
            </div>
          )
        )}
        <div ref={scrollEndRef} />
      </div>

      <div className="px-5 py-4 border-t border-slate-100 safe-area-inset-bottom">
        <div className="flex items-center gap-2 max-w-sm mx-auto w-full">
          <input
            aria-label="Message"
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Message..."
            className="flex-1 rounded-full border border-slate-200 px-4 py-2.5 text-sm placeholder-slate-400"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !draft.trim()}
            aria-label="Send"
            className="w-9 h-9 flex items-center justify-center rounded-full text-white disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-brand)' }}
          >
            <IconSend />
          </button>
        </div>
      </div>
    </main>
  )
}
