'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from '@/app/components/NavigationSpinner'
import type { TidyTask } from '@/app/dashboard/types'
import { bookedTaskName } from '@/lib/laundry'
import { cancelBookingRequestAction, cancelTaskAdditionAction, respondToTimeProposalAction, sendMessageAction, startCallAction } from './actions'
import CancelReasonSheet from '@/app/components/CancelReasonSheet'
import ReportTidyProSheet from '@/app/dashboard/bookings/[bookingId]/ReportTidyProSheet'
import TaskAdditionRecordCard, { TaskAdditionOutcomeBubble, type TaskAdditionRecordView } from '@/app/components/TaskAdditionRecordCard'
import UpdatedBookingRequestCard from '@/app/components/UpdatedBookingRequestCard'
import { CUSTOMER_CANCEL_REASONS, type Cancellation } from '@/lib/cancellationReasons'

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

function IconFlag() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22V4" />
      <path d="M4 4h13l-2.5 4L17 12H4" />
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

// Customers only see what they booked. Location, pets and notes are left out
// on purpose: they matter to the Tidy Pro, not to the customer who entered them.
function BookingDetails({
  tasks,
  suppliesProvided,
}: {
  tasks: TidyTask[]
  suppliesProvided: boolean
}) {
  return (
    <>
      <p className="text-sm font-bold text-slate-900 mt-2">Tasks</p>
      {tasks.map((task) => (
        <p key={task.id} className="text-sm text-slate-600">
          {bookedTaskName(task)}
        </p>
      ))}
      <p className="text-xs text-slate-400">
        {suppliesProvided ? "You'll provide the cleaning supplies" : 'Cleaning supplies will be provided'}
      </p>
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
  tasks: TidyTask[]
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
  // Where the back button goes: the Tidy Tasks home right after a booking
  // request, otherwise the messages list.
  backHref: string
  // When "Cleaner didn't show up" can be reported (see noShowReportableAt).
  noShowReportableAtMs: number | null
  // A recurring booking: when it repeats, e.g. "Every Sunday at 9:00 AM".
  recurrence: string | null
  // Requests to add tasks to this booking (lib/bookingTaskAdditions), oldest first.
  taskAdditions: TaskAdditionRecordView[]
}

export default function MessageThreadView({
  bookingId,
  cleanerName,
  cleanerPhotoUrl,
  canCall,
  scheduledDate,
  scheduledTime,
  durationMinutes,
  tasks,
  suppliesProvided,
  totalPrice,
  canChooseReplacements,
  cleanerCancelled,
  cancelledNote,
  status: initialStatus,
  decisionStatus,
  progressStatus,
  messages: initialMessages,
  backHref,
  noShowReportableAtMs,
  recurrence,
  taskAdditions,
}: Props) {
  const router = useRouter()
  const [status, setStatus] = useState(initialStatus)
  const [askingReason, setAskingReason] = useState(false)
  // `initialMessages` comes straight from the server component, so anything
  // already in it is authoritative — only an in-flight send that the server
  // hasn't echoed back yet needs to live in local state.
  const [pendingMessages, setPendingMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  // Why the last message didn't send (e.g. it had a phone number or email in it).
  const [sendError, setSendError] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const threadRef = useRef<HTMLDivElement>(null)
  const firstName = cleanerName.split(' ')[0]
  const messages = [...initialMessages, ...pendingMessages]

  // Scroll only the message list. scrollIntoView also scrolled the window on
  // phones, which pushed the header (and its back button) off screen.
  useEffect(() => {
    const thread = threadRef.current
    if (thread) thread.scrollTop = thread.scrollHeight
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
        : { message: `We're calling your phone now from ${result.from}. Answer it and press 1 to be connected.`, error: false }
    )
  }

  async function handleSend() {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setSendError(null)
    const optimisticId = `optimistic-${Date.now()}`
    setPendingMessages((prev) => [...prev, { id: optimisticId, senderRole: 'USER', body, createdAt: new Date().toISOString() }])
    setDraft('')
    const result = await sendMessageAction(bookingId, body)
    setSending(false)
    if ('error' in result) {
      setPendingMessages((prev) => prev.filter((m) => m.id !== optimisticId))
      setDraft(body)
      setSendError(result.error)
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

  async function handleCancel(cancellation: Cancellation): Promise<string | null> {
    const result = await cancelBookingRequestAction(bookingId, cancellation)
    if ('error' in result) return result.error
    setAskingReason(false)
    setStatus('cancelled')
    return null
  }

  return (
    <main id="main-content" className="h-dvh bg-white flex flex-col overflow-hidden">
      <h1 className="sr-only">Messages</h1>
      {showReport && <ReportTidyProSheet bookingId={bookingId} noShowReportableAtMs={noShowReportableAtMs} onClose={() => setShowReport(false)} />}
      {/* Full-height shell: header and composer never scroll; only the thread does */}
      <div className="flex-shrink-0 z-20 bg-white shadow-sm safe-area-inset-top">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
        <button
          type="button"
          onClick={() => router.push(backHref)}
          aria-label="Back"
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-2"
        >
          <IconBack />
        </button>
        <Avatar name={cleanerName} photoUrl={cleanerPhotoUrl} />
        <p className="font-semibold text-slate-900 flex-1 truncate">{cleanerName}</p>
        {/* Once accepted there's a real booking to report about (no-shows included). */}
        {decisionStatus === 'accepted' && (
          <button
            type="button"
            onClick={() => setShowReport(true)}
            aria-label={`Report ${cleanerName}`}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100"
          >
            <IconFlag />
          </button>
        )}
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
                tasks={tasks}
                suppliesProvided={suppliesProvided}
              />
            </div>
          )}
        </div>
      </div>
      </div>

      {/* Thread */}
      <div ref={threadRef} className="flex-1 min-h-0 overflow-y-auto px-5 py-6 max-w-sm mx-auto w-full">
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
          {recurrence && (
            <div className="-mt-1 mb-3">
              <p className="text-xs font-semibold" style={{ color: 'var(--color-brand)' }}>
                Recurring · {recurrence}
              </p>
              <p className="text-xs text-slate-500">Each visit after this one is on the same day and time.</p>
            </div>
          )}

          <BookingDetails
            tasks={tasks}
            suppliesProvided={suppliesProvided}
          />

          <div className="flex items-center justify-between border-t border-slate-200 mt-4 pt-3">
            <span className="text-sm font-bold" style={{ color: 'var(--color-brand)' }}>
              Total
            </span>
            <span className="text-sm font-bold" style={{ color: 'var(--color-brand)' }}>
              ${totalPrice}
            </span>
          </div>

          {askingReason && (
            <CancelReasonSheet reasons={CUSTOMER_CANCEL_REASONS} onConfirm={handleCancel} onClose={() => setAskingReason(false)} />
          )}

          {outcome === 'pending' && (
            <button
              type="button"
              onClick={() => setAskingReason(true)}
              className="w-full mt-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600"
            >
              Cancel
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

        {/* The Tidy Pro accepted it, even if it was canceled later (that comes at the end). */}
        {decisionStatus === 'accepted' && (
          <div
            className="rounded-2xl rounded-bl-sm px-4 py-3 mt-4 mr-auto max-w-[85%] text-sm leading-relaxed text-white"
            style={{ backgroundColor: '#1a2332' }}
          >
            {`${firstName} accepted your booking request`}
          </div>
        )}

        {/* Requests to add tasks come after the original request and its answer. An open one
            is the full updated booking request (the same card the Tidy Pro answers), with
            Cancel; an answered one is a short record with its own answer under it. */}
        {taskAdditions.map((record) =>
          record.status === 'pending' ? (
            <UpdatedBookingRequestCard
              key={record.id}
              viewer="customer"
              otherFirstName={firstName}
              request={{
                tasks: record.tasks,
                extraAmount: record.amount,
                newDurationMinutes: record.newDurationMinutes ?? durationMinutes,
                applyToSeries: record.applyToSeries,
              }}
              currentTasks={tasks}
              currentAmount={totalPrice}
              currentDurationMinutes={durationMinutes}
              scheduledDate={scheduledDate}
              scheduledTime={scheduledTime}
              onCancel={async () => {
                const result = await cancelTaskAdditionAction(record.id)
                if ('success' in result) router.refresh()
                return result
              }}
            />
          ) : (
            <Fragment key={record.id}>
              <TaskAdditionRecordCard record={record} viewer="customer" otherFirstName={firstName} />
              <TaskAdditionOutcomeBubble status={record.status} viewer="customer" otherFirstName={firstName} />
            </Fragment>
          )
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
              {recurrence && message.proposal.status === 'pending' && (
                <p className="text-xs text-slate-500 mt-1">Only this visit changes. Your other recurring visits keep their time.</p>
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

        {/* How the booking ended is the latest thing that happened, so it goes last, under
            any added-task requests and messages, with what the customer can do next. */}
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
          <>
            <Link
              href={`/dashboard/bookings/${bookingId}/replace`}
              className="block w-full mt-4 py-3 rounded-2xl text-center text-sm font-semibold text-white"
              style={{ backgroundColor: 'var(--color-brand)' }}
            >
              Choose up to 3 available Tidy Pros
            </Link>
            <p className="text-xs text-slate-500 text-center leading-relaxed mt-2">You won&apos;t be charged again. Your payment is held for your booking. If you cancel, you&apos;re refunded minus the nonrefundable Stripe fee.</p>
            <button
              type="button"
              onClick={() => setAskingReason(true)}
              className="w-full mt-3 py-3 rounded-2xl bg-white border border-slate-200 text-sm font-semibold text-slate-600"
            >
              Cancel booking and get a refund
            </button>
          </>
        )}
      </div>

      <div className="flex-shrink-0 px-5 py-4 border-t border-slate-100 safe-area-inset-bottom">
        {sendError && (
          <p
            id="message-send-error"
            role="alert"
            className="max-w-sm mx-auto w-full mb-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 leading-relaxed"
          >
            Your message wasn&apos;t sent. {sendError}
          </p>
        )}
        <div className="flex items-center gap-2 max-w-sm mx-auto w-full">
          <input
            aria-label="Message"
            aria-invalid={sendError ? true : undefined}
            aria-describedby={sendError ? 'message-send-error' : undefined}
            type="text"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              if (sendError) setSendError(null)
            }}
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
