'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRouter } from '@/app/components/NavigationSpinner'
import type { TidyTask } from '@/app/dashboard/types'
import { lateCancelRefund } from '@/lib/pricingRules'
import { MAX_ENTRY_INSTRUCTIONS_LENGTH } from '@/lib/entryInstructions'
import { laundryDetailLabel } from '@/lib/laundry'
import { endReviewDetour, startReviewDetour } from '@/lib/reviewDetour'
import { formatEstimatedMinutes, isPetTask, petDetailLabel } from '@/lib/petTasks'
import { VerifiedCheck } from '@/app/components/VerifiedCheck'
import PetTaskDetails from '@/app/components/PetTaskDetails'
import LaundromatNotice from '@/app/components/LaundromatNotice'
import FullServiceSummary, { type SummaryLine } from '@/app/components/FullServiceSummary'
import { NOTES_COPY, type FullServiceSelection } from '@/lib/fullService'
import type { CleanerMatch } from '@/lib/cleanerMatching'
import { usePersistedPicks, writePicks } from '@/app/components/TidyProPickList'
import { recurrenceScheduleLabel, type RecurrenceFrequency } from '@/lib/recurrence'
import {
  updateTaskNoteAction,
  removeTaskFromBookingAction,
  updateDraftDetailsAction,
  applyPromoCodeAction,
  removePromoCodeAction,
  confirmBookingAction,
  requestQuoteAction,
} from './actions'
import { QUOTE_TASK_LABEL, needsQuote } from '@/lib/taskQuotes'

// Matches MAX_EXTRA_BOOKING_CLEANERS in lib/bookingRequestGroups, which is server-only.
const MAX_EXTRA_BOOKING_CLEANERS = 2

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

type Group = { room: string; tasks: TidyTask[] }

function groupByRoom(tasks: TidyTask[]): Group[] {
  const order: string[] = []
  const map = new Map<string, TidyTask[]>()
  for (const t of tasks) {
    if (!map.has(t.room)) {
      map.set(t.room, [])
      order.push(t.room)
    }
    map.get(t.room)!.push(t)
  }
  return order.map((room) => ({ room, tasks: map.get(room)! }))
}

export interface ReviewPaymentMethod {
  id: string
  brand: string
  last4: string
  exp_month: number
  exp_year: number
  is_default: boolean
}

type Props = {
  draftId: string
  tasks: TidyTask[]
  // Standard / Deep Cleaning, priced with the chosen Tidy Pro's rates.
  fullService: { selection: FullServiceSelection; lines: SummaryLine[]; customerTotal: number } | null
  photoUrls: Record<string, string>
  date: string
  time: string
  // Set when this is the first visit of a recurring booking.
  recurrence: RecurrenceFrequency | null
  durationMinutes: number
  addressName: string
  addressLine: string | null
  cleanerName: string
  // The Tidy Pro the customer chose, shown as "Your Tidy Pro".
  selectedCleaner: CleanerMatch
  extraCleanerOptions: CleanerMatch[]
  // One line per pet (or "No pets"), from Profile → Pets.
  pets: string
  notes: string
  // Prefilled from the address's saved instructions until the customer edits them.
  entryInstructions: string
  savedEntryInstructions: string | null
  // The saved address's label, or null when booking at the current location (nothing to save to).
  addressLabel: string | null
  suppliesProvided: boolean
  giftCode: string
  // The applied code, when it can still be used.
  promo: { code: string; label: string; discount: number } | null
  // Why the saved code can't be used any more (expired, used up), if it can't.
  promoProblem: string | null
  servicePrice: number
  // servicePrice less the promo discount: what the card fee is added to.
  discountedPrice: number
  processingFee: number
  totalPrice: number
  paymentMethods: ReviewPaymentMethod[]
  selectedPaymentMethodId: string | null
  // Tasks added while automatic pricing was down. With any, the booking is sent to the
  // Tidy Pro for a quote instead of being charged now (lib/quoteRequests.ts).
  quoteTaskCount: number
}

function IconRemove() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M4 4l8 8M4 12L12 4" stroke="var(--color-slate-400)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

// Photo, name and stats for a Tidy Pro row: the chosen one and the others they can also ask.
function CleanerSummary({ cleaner }: { cleaner: CleanerMatch }) {
  return (
    <>
      <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-200 flex-shrink-0">
        {cleaner.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cleaner.photoUrl} alt="" className="w-full h-full object-cover" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900 flex items-center gap-1 min-w-0">
          <span className="truncate">{cleaner.name}</span>
          {cleaner.isVerified && <VerifiedCheck size={14} />}
        </p>
        <p className="text-xs text-slate-500">
          <span className="text-amber-500">★</span> {cleaner.rating.toFixed(1)} · {cleaner.distanceMiles} miles
          {cleaner.isTopTidyPro && (
            <span className="font-semibold" style={{ color: 'var(--color-brand)' }}> · Top Tidy Pro</span>
          )}
        </p>
      </div>
    </>
  )
}

export default function ReviewRequestView({
  draftId,
  tasks,
  fullService,
  photoUrls,
  date,
  time,
  recurrence,
  durationMinutes,
  addressName,
  addressLine,
  cleanerName,
  selectedCleaner,
  extraCleanerOptions,
  pets,
  notes: initialNotes,
  entryInstructions: initialEntryInstructions,
  savedEntryInstructions,
  addressLabel,
  suppliesProvided: initialSupplies,
  giftCode: initialGiftCode,
  promo,
  promoProblem,
  servicePrice,
  discountedPrice,
  processingFee,
  totalPrice,
  paymentMethods,
  selectedPaymentMethodId,
  quoteTaskCount,
}: Props) {
  const quoteMode = quoteTaskCount > 0
  const router = useRouter()
  const pathname = usePathname()
  const [notes, setNotes] = useState(initialNotes)
  const [entryInstructions, setEntryInstructions] = useState(initialEntryInstructions)
  const [saveEntryInstructions, setSaveEntryInstructionsState] = useState(false)
  // Offer to save only when there's an address to save to and the text is new.
  const canSaveEntryInstructions =
    !!addressLabel && entryInstructions.trim() !== (savedEntryInstructions ?? '').trim()
  // Already saved on the address: the box stays shown, ticked.
  const entryInstructionsAlreadySaved =
    !!addressLabel && !!entryInstructions.trim() && !canSaveEntryInstructions

  // The "Save for future bookings" tick is kept for this booking request while
  // the customer goes to other pages (pets, payment, back through the flow).
  const saveEntryKey = `tydio:save-entry:${draftId}`
  useEffect(() => {
    try {
      // Restoring from storage can only happen after mount; the server render has it unticked.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (sessionStorage.getItem(saveEntryKey) === '1') setSaveEntryInstructionsState(true)
    } catch {}
  }, [saveEntryKey])
  function setSaveEntryInstructions(checked: boolean) {
    setSaveEntryInstructionsState(checked)
    try {
      if (checked) sessionStorage.setItem(saveEntryKey, '1')
      else sessionStorage.removeItem(saveEntryKey)
    } catch {}
  }

  // Directions and notes are saved on the draft as they're typed (and when the
  // field loses focus, or the page is left), so nothing typed here is lost.
  const pendingDetails = useRef<{ notes?: string; entryInstructions?: string }>({})
  const detailsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flushDetails = useCallback(() => {
    if (detailsTimer.current) clearTimeout(detailsTimer.current)
    detailsTimer.current = null
    const updates = pendingDetails.current
    pendingDetails.current = {}
    if (updates.notes !== undefined || updates.entryInstructions !== undefined) {
      void updateDraftDetailsAction(draftId, updates)
    }
  }, [draftId])
  function queueDetails(updates: { notes?: string; entryInstructions?: string }) {
    pendingDetails.current = { ...pendingDetails.current, ...updates }
    if (detailsTimer.current) clearTimeout(detailsTimer.current)
    detailsTimer.current = setTimeout(flushDetails, 600)
  }
  useEffect(() => {
    window.addEventListener('pagehide', flushDetails)
    return () => {
      window.removeEventListener('pagehide', flushDetails)
      flushDetails()
    }
  }, [flushDetails])

  // Back / Forward shows this page from Next's cached copy, which can be from
  // before the notes or directions were typed. Reload it on arrival and take
  // the saved text when it comes in (unless the customer is still typing).
  useEffect(() => {
    endReviewDetour()
    router.refresh()
  }, [router])
  useEffect(() => {
    const focusedId = document.activeElement?.id
    if (pendingDetails.current.notes === undefined && focusedId !== 'booking-notes') setNotes(initialNotes)
  }, [initialNotes])
  useEffect(() => {
    const focusedId = document.activeElement?.id
    if (pendingDetails.current.entryInstructions === undefined && focusedId !== 'entry-instructions') {
      setEntryInstructions(initialEntryInstructions)
    }
  }, [initialEntryInstructions])
  const [suppliesProvided, setSuppliesProvided] = useState(initialSupplies)
  const [giftCode, setGiftCode] = useState(initialGiftCode)
  const [applyingGiftCode, setApplyingGiftCode] = useState(false)
  const [promoError, setPromoError] = useState<string | null>(null)
  const [promoShake, setPromoShake] = useState(false)
  // Tracks the last code that's actually saved on the draft, so an
  // unapplied/invalid attempt can be discarded the moment the user
  // navigates away instead of lingering in this input if they come back.
  const committedGiftCodeRef = useRef(initialGiftCode)
  const [taskNotes, setTaskNotes] = useState<Record<string, string>>(
    Object.fromEntries(tasks.map((t) => [t.id, t.notes]))
  )
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  // The selected card couldn't be charged; the customer is sent to add or pick another.
  const [paymentFailed, setPaymentFailed] = useState(false)
  // Checked off on /book/review/others, after looking over their profiles.
  const { picks: extraCleanerIds, toggle: removeExtraCleaner } = usePersistedPicks(
    `draft:${draftId}`,
    extraCleanerOptions.map((c) => c.id),
    MAX_EXTRA_BOOKING_CLEANERS
  )
  const extraCleaners = extraCleanerOptions.filter((c) => extraCleanerIds.includes(c.id))

  const selectedPaymentMethod = paymentMethods.find((pm) => pm.id === selectedPaymentMethodId) ?? null
  const paymentLinkHref = `/dashboard/profile/payment-methods?draftId=${draftId}`
  const changePaymentAfterFailureHref = selectedPaymentMethod
    ? `${paymentLinkHref}&declined=${selectedPaymentMethod.id}`
    : paymentLinkHref

  async function handleRemoveTask(taskId: string) {
    await removeTaskFromBookingAction(draftId, taskId)
    router.refresh()
  }

  function handleSupplies(checked: boolean) {
    setSuppliesProvided(checked)
    void updateDraftDetailsAction(draftId, { suppliesProvided: checked })
  }

  async function handleApplyGiftCode() {
    setApplyingGiftCode(true)
    setPromoError(null)
    const result = await applyPromoCodeAction(draftId, giftCode)
    setApplyingGiftCode(false)
    if ('error' in result) {
      setPromoError(result.error)
      setPromoShake(true)
      setTimeout(() => setPromoShake(false), 400)
      return
    }
    committedGiftCodeRef.current = giftCode
    router.refresh()
  }

  async function handleRemovePromo() {
    setApplyingGiftCode(true)
    await removePromoCodeAction(draftId)
    setApplyingGiftCode(false)
    committedGiftCodeRef.current = ''
    setGiftCode('')
    setPromoError(null)
    router.refresh()
  }

  // If the user leaves this page with an unapplied/invalid promo code still
  // typed in, drop it — it was never saved, so it shouldn't reappear if they
  // come back to a still-mounted instance of this view.
  useEffect(() => {
    if (pathname === '/book/review') return
    if (giftCode === committedGiftCodeRef.current) return
    setGiftCode(committedGiftCodeRef.current)
    setPromoError(null)
  }, [pathname, giftCode])
  async function handleConfirmRequest() {
    if (!selectedPaymentMethod) return
    flushDetails()
    setConfirming(true)
    setConfirmError(null)
    setPaymentFailed(false)
    const result = await confirmBookingAction(
      draftId,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      extraCleanerIds,
      canSaveEntryInstructions && saveEntryInstructions
    )
    if ('error' in result) {
      setConfirming(false)
      setConfirmError(result.error)
      setPaymentFailed(!!result.paymentFailed)
      return
    }
    writePicks(`draft:${draftId}`, [])
    setSaveEntryInstructions(false)
    router.push(`/dashboard/messages/${result.bookingId}?from=booking`)
  }

  async function handleSendForQuote() {
    flushDetails()
    setConfirming(true)
    setConfirmError(null)
    setPaymentFailed(false)
    const result = await requestQuoteAction(
      draftId,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      canSaveEntryInstructions && saveEntryInstructions
    )
    if ('error' in result) {
      setConfirming(false)
      setConfirmError(result.error)
      return
    }
    router.push(`/dashboard/quotes/${result.quoteId}`)
  }

  return (
    <main id="main-content" className="min-h-svh bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-40 max-w-sm mx-auto w-full safe-area-inset-bottom">
        <button type="button" onClick={() => router.back()} aria-label="Back" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-2 mb-4">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <h1 className="text-3xl font-bold text-slate-900 mb-5">Review Your Request</h1>

        <div className="flex items-start justify-between gap-3 mb-6">
          <div>
            <p className="text-sm font-bold text-slate-900">{formatDateLabel(date)}</p>
            <p className="text-sm text-slate-500">{formatTimeRange(time, durationMinutes)}</p>
            {recurrence && (
              <>
                <p className="text-xs font-semibold mt-1" style={{ color: 'var(--color-brand)' }}>
                  Repeats {recurrenceScheduleLabel(recurrence, date, time).replace(/^Every/, 'every')}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Each visit after this one is on the same day and time.</p>
              </>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-slate-900">{addressName}</p>
            {addressLine && <p className="text-sm text-slate-500">{addressLine}</p>}
          </div>
        </div>

        {fullService && (
          <>
            <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--color-brand)' }}>
              Your Cleaning
            </h2>
            <FullServiceSummary
              selection={fullService.selection}
              lines={fullService.lines}
              editHref="/book/full-service/scope"
              className="mb-6"
            />
          </>
        )}

        {tasks.length > 0 && (
        <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--color-brand)' }}>
          {fullService ? 'Tidy Tasks' : 'Selected Tasks'}
        </h2>
        )}
        <div className="flex flex-col gap-3 mb-4">
          {groupByRoom(tasks).map((group) => (
            <div key={group.room}>
              <p className="text-sm font-bold text-slate-900 mb-1">{group.room}</p>
              {group.tasks.map((task) => {
                const dirtLabel =
                  task.dirtLevel === 'light' ? 'Light touch-up'
                  : task.dirtLevel === 'standard' ? 'Standard cleaning'
                  : task.dirtLevel === 'heavy' ? 'Heavy cleaning'
                  : null
                const pet = isPetTask(task)
                const meta = [
                  dirtLabel,
                  laundryDetailLabel(task),
                  petDetailLabel(task),
                  pet && task.pet.kind !== 'enclosure' ? formatEstimatedMinutes(task.estimatedMinutes) : null,
                  ...(task.unusual ?? []),
                ].filter(Boolean).join(' · ')
                const quoted = needsQuote(task)
                return (
                <div key={task.id} className="flex items-start gap-2 mb-2">
                  <div className="flex-1 min-w-0 border-b border-slate-100 pb-1.5">
                    <p className="text-sm text-slate-700 truncate">{task.name}</p>
                    {meta && <p className="text-xs text-slate-400 mt-0.5">{meta}</p>}
                    {quoted && <p className="text-xs font-semibold text-amber-700 mt-0.5">{QUOTE_TASK_LABEL}</p>}
                    {/* A pet task's instructions were part of its photo check and
                        estimate, so they're shown below rather than edited here. */}
                    {!pet && <input
                      aria-label="Task note"
                      type="text"
                      placeholder="Add note..."
                      defaultValue={taskNotes[task.id] ?? ''}
                      onBlur={(e) => {
                        setTaskNotes((prev) => ({ ...prev, [task.id]: e.target.value }))
                        void updateTaskNoteAction(draftId, task.id, e.target.value)
                      }}
                      className="w-full text-xs text-slate-400 placeholder-slate-400 focus:outline-none mt-0.5"
                    />}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveTask(task.id)}
                    aria-label={`Remove ${task.name}`}
                    className="w-6 h-6 flex items-center justify-center flex-shrink-0 mt-1"
                  >
                    <IconRemove />
                  </button>
                </div>
                )
              })}
            </div>
          ))}
        </div>

        <PetTaskDetails tasks={tasks} photoUrls={photoUrls} showPrepNotice className="mb-6" />
        <LaundromatNotice tasks={tasks} audience="customer" className="mb-6" />

        <div className="border-t border-slate-100 pt-5 mb-6">
          <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--color-brand)' }}>
            Your Tidy Pro
          </h2>
          <div className="rounded-2xl border border-slate-100 px-3 py-2.5 flex items-center gap-3">
            <CleanerSummary cleaner={selectedCleaner} />
          </div>
        </div>

        {quoteMode && (
          <div role="note" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 mb-6">
            <p className="text-sm font-semibold text-amber-900 mb-1">
              {cleanerName} will send you a quote
            </p>
            <p className="text-xs text-amber-900 leading-relaxed">
              We can&apos;t show prices right now. Send your booking details and {cleanerName} will send you a quote. Nothing is
              charged until you approve &amp; pay it, and then your booking goes to {cleanerName} to accept.
            </p>
          </div>
        )}

        {extraCleanerOptions.length > 0 && (
          <div className="border-t border-slate-100 pt-5 mb-6">
            <h2 className="text-sm font-bold mb-1" style={{ color: 'var(--color-brand)' }}>
              Ask other Tidy Pros too <span className="font-normal text-slate-400">(optional)</span>
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed mb-3">
              Send this request to up to {MAX_EXTRA_BOOKING_CLEANERS} more Tidy Pros along with {cleanerName}. You&apos;re only charged once, at
              this price. The first to accept gets your booking, and the other requests are canceled.
            </p>
            {extraCleaners.length > 0 && (
              <ul className="flex flex-col gap-2 mb-3">
                {extraCleaners.map((cleaner) => (
                  <li key={cleaner.id} className="rounded-2xl border border-slate-100 px-3 py-2.5 flex items-center gap-3">
                    <CleanerSummary cleaner={cleaner} />
                    <button
                      type="button"
                      onClick={() => removeExtraCleaner(cleaner.id)}
                      disabled={confirming}
                      aria-label={`Don't ask ${cleaner.name}`}
                      className="w-8 h-8 flex items-center justify-center flex-shrink-0 disabled:opacity-50"
                    >
                      <IconRemove />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/book/review/others"
              aria-disabled={confirming}
              className={`block w-full py-3 rounded-2xl text-sm font-semibold text-center ${confirming ? 'pointer-events-none opacity-50' : ''}`}
              style={
                extraCleaners.length > 0
                  ? { backgroundColor: '#f1f5f9', color: 'var(--color-slate-600)' }
                  : { backgroundColor: 'var(--color-brand)', color: 'white' }
              }
            >
              {extraCleaners.length > 0
                ? 'Change other Tidy Pros'
                : `Ask ${Math.min(MAX_EXTRA_BOOKING_CLEANERS, extraCleanerOptions.length)} more Tidy Pro${extraCleanerOptions.length === 1 ? '' : 's'}`}
            </Link>
          </div>
        )}

        {/* A real (visually hidden) checkbox, so the whole row — box and text — toggles it, and so does the keyboard. */}
        <label className="relative flex items-center gap-3 cursor-pointer mb-6 py-1">
          <input
            type="checkbox"
            checked={suppliesProvided}
            onChange={(e) => handleSupplies(e.target.checked)}
            className="sr-only peer"
          />
          <span
            aria-hidden="true"
            className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 ${suppliesProvided ? 'border-brand bg-brand' : 'border-slate-300'}`}
          >
            {suppliesProvided && (
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M2 5.5l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          <span className="text-sm text-slate-700">You will provide the necessary cleaning supplies</span>
        </label>

        <div className="border-t border-slate-100 pt-5 mb-5">
          <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--color-brand)' }}>
            Additional Details
          </h2>
          <div className="mb-4">
            <p className="text-sm font-bold text-slate-900 mb-1">Pets</p>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-slate-500 whitespace-pre-line break-words">{pets}</p>
              <Link
                href="/dashboard/profile/pets?next=/book/review"
                onClick={() => startReviewDetour('/dashboard/profile/pets')}
                className="text-sm font-semibold text-brand flex-shrink-0">
                Edit
              </Link>
            </div>
          </div>
          <div className="mb-4">
            <label htmlFor="entry-instructions" className="block text-sm font-bold text-slate-900 mb-1">
              Directions &amp; Entry
            </label>
            <textarea
              id="entry-instructions"
              placeholder="How to get there and get in: parking, which building or door, gate code, where the key is…"
              value={entryInstructions}
              maxLength={MAX_ENTRY_INSTRUCTIONS_LENGTH}
              rows={2}
              onChange={(e) => {
                setEntryInstructions(e.target.value)
                queueDetails({ entryInstructions: e.target.value })
              }}
              onBlur={flushDetails}
              className="w-full text-sm text-slate-500 placeholder-slate-400 focus:outline-none resize-none"
            />
            {(canSaveEntryInstructions || entryInstructionsAlreadySaved) && (
              <label className={`flex items-center gap-2 mt-1 ${entryInstructionsAlreadySaved ? '' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  checked={entryInstructionsAlreadySaved || saveEntryInstructions}
                  disabled={entryInstructionsAlreadySaved}
                  onChange={(e) => setSaveEntryInstructions(e.target.checked)}
                  className="w-4 h-4 accent-brand"
                />
                <span className="text-xs text-slate-600">
                  {entryInstructionsAlreadySaved
                    ? `Saved for future bookings at ${addressLabel}`
                    : entryInstructions.trim()
                      ? `Save these directions for future bookings at ${addressLabel}`
                      : `Remove the saved directions for ${addressLabel}`}
                </span>
              </label>
            )}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 mb-1">Notes</p>
            {fullService && <p className="text-xs text-slate-500 mb-1">{NOTES_COPY.body}</p>}
            <textarea
              id="booking-notes"
              aria-label="Notes for your Tidy Pro"
              placeholder={
                fullService
                  ? NOTES_COPY.title
                  : `Anything that helps ${cleanerName} do a great job: rooms to focus on or skip, products to use or avoid, how you like things done…`
              }
              value={notes}
              rows={2}
              onChange={(e) => {
                setNotes(e.target.value)
                queueDetails({ notes: e.target.value })
              }}
              onBlur={flushDetails}
              className="w-full text-sm text-slate-500 placeholder-slate-400 focus:outline-none resize-none"
            />
          </div>
        </div>

        <div className="border-t border-slate-100 pt-5">
          <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--color-brand)' }}>
            Order Summary
          </h2>

          <div className="rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className={`px-4 py-3.5 border-b border-slate-100 ${promoShake ? 'animate-shake' : ''}`}>
              {promo || promoProblem ? (
                <>
                  <div className="flex items-center gap-2">
                    <p className={`flex-1 text-sm ${promoProblem ? 'text-red-600' : 'text-slate-700'}`}>
                      <span className="font-semibold">{promo?.code ?? initialGiftCode}</span>
                      {promo && <span className="text-slate-500"> · {promo.label}</span>}
                    </p>
                    <button
                      type="button"
                      onClick={handleRemovePromo}
                      disabled={applyingGiftCode}
                      className="text-xs font-bold tracking-wide text-slate-400 disabled:opacity-50"
                    >
                      {applyingGiftCode ? 'REMOVING…' : 'REMOVE'}
                    </button>
                  </div>
                  {promoProblem && <p role="alert" className="text-xs text-red-600 mt-1.5">{promoProblem}</p>}
                  {promo && recurrence && (
                    <p className="text-xs text-slate-500 mt-1.5">Applies to your first visit. Later visits are full price.</p>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <input
                      aria-label="Promo code"
                      type="text"
                      placeholder="Promo code"
                      value={giftCode}
                      onChange={(e) => {
                        setGiftCode(e.target.value)
                        if (promoError) setPromoError(null)
                      }}
                      className={`flex-1 text-sm placeholder-slate-400 focus:outline-none ${promoError ? 'text-red-600' : 'text-slate-700'}`}
                    />
                    <button
                      type="button"
                      onClick={handleApplyGiftCode}
                      disabled={applyingGiftCode || !giftCode.trim()}
                      className="text-xs font-bold tracking-wide text-slate-400 disabled:opacity-50"
                    >
                      {applyingGiftCode ? 'SAVING…' : 'APPLY'}
                    </button>
                  </div>
                  {promoError && <p role="alert" className="text-xs text-red-600 mt-1.5">{promoError}</p>}
                </>
              )}
            </div>

            {/* With a quote, payment is taken on the quote itself, once the customer approves it. */}
            {!quoteMode && (
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
              <div>
                <p className="text-sm text-slate-800">Payment method</p>
                {selectedPaymentMethod && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    {selectedPaymentMethod.brand} •••• {selectedPaymentMethod.last4}
                  </p>
                )}
              </div>
              <Link
                href={paymentLinkHref}
                onClick={() => startReviewDetour('/dashboard/profile/payment-methods')}
                className="text-sm font-semibold" style={{ color: 'var(--color-brand)' }}>
                {paymentMethods.length === 0
                  ? 'Add payment method'
                  : selectedPaymentMethod
                  ? 'Change payment method'
                  : 'Choose payment method'}
              </Link>
            </div>
            )}

            {quoteMode ? (
              <>
                <div className="flex items-center justify-between px-4 py-3.5">
                  <span className="text-sm text-slate-800">Booking price</span>
                  <span className="text-sm font-semibold text-amber-700">Quote from {cleanerName}</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed px-4 pb-3.5">
                  No payment now. {cleanerName} sends you a quote; you can approve &amp; pay it or decline.
                </p>
              </>
            ) : (
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
              <span className="text-sm text-slate-800">Booking price</span>
              <span className="text-sm font-semibold text-slate-900">${servicePrice.toFixed(2)}</span>
            </div>
            )}

            {!quoteMode && promo && promo.discount > 0 && (
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
                <span className="text-sm text-slate-800">Promo ({promo.code})</span>
                <span className="text-sm font-semibold text-green-700">−${promo.discount.toFixed(2)}</span>
              </div>
            )}

            {!quoteMode && (<>
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
              <span className="text-sm text-slate-800">Stripe processing fee</span>
              <span className="text-sm font-semibold text-slate-900">${processingFee.toFixed(2)}</span>
            </div>

            <div className="flex items-center justify-between px-4 py-3.5">
              <span className="text-sm font-bold" style={{ color: 'var(--color-brand)' }}>
                Total
              </span>
              <span className="text-sm font-bold" style={{ color: 'var(--color-brand)' }}>
                ${totalPrice.toFixed(2)}
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed px-4 pb-3.5">
              The ${processingFee.toFixed(2)} Stripe processing fee is nonrefundable. If your booking is canceled, you&apos;ll be refunded ${discountedPrice.toFixed(2)}. If you cancel an accepted booking less than 2 hours before it starts, you&apos;ll be refunded 50% (${lateCancelRefund(totalPrice).toFixed(2)}).
            </p>
            </>)}
          </div>

          <Link
            href="/book/schedule"
            className="block w-full py-3.5 rounded-2xl bg-brand text-white font-semibold text-sm text-center mt-3"
          >
            Edit booking
          </Link>
        </div>
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 px-5 py-4 safe-area-inset-bottom">
        <div className="max-w-sm mx-auto">
          {confirmError && paymentFailed ? (
            <div role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-3 leading-relaxed">
              <p className="font-semibold">
                {selectedPaymentMethod
                  ? `We couldn’t charge your ${selectedPaymentMethod.brand} •••• ${selectedPaymentMethod.last4}.`
                  : 'We couldn’t charge your card.'}
              </p>
              <p>{confirmError}</p>
              <p className="mt-1 text-slate-600">Add a new card or choose another one to send your request. You haven’t been charged.</p>
            </div>
          ) : confirmError ? (
            <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-3 leading-relaxed">
              {confirmError}
            </p>
          ) : null}
          {quoteMode ? (
            <button
              type="button"
              onClick={handleSendForQuote}
              disabled={confirming}
              className="w-full py-4 rounded-2xl font-semibold text-base tracking-wide text-white disabled:opacity-60 transition-opacity"
              style={{ backgroundColor: 'var(--color-brand)' }}
            >
              {confirming ? 'Sending…' : 'Send for a quote'}
            </button>
          ) : paymentFailed ? (
            <Link
              href={changePaymentAfterFailureHref}
              // Done once they go change it, in case this view is still mounted when they come back.
              onClick={() => {
                startReviewDetour('/dashboard/profile/payment-methods')
                setPaymentFailed(false)
                setConfirmError(null)
              }}
              className="block w-full py-4 rounded-2xl font-semibold text-base tracking-wide text-white text-center"
              style={{ backgroundColor: 'var(--color-brand)' }}
            >
              Use a different payment method
            </Link>
          ) : (
            <button
              type="button"
              onClick={handleConfirmRequest}
              disabled={!selectedPaymentMethod || confirming}
              className="w-full py-4 rounded-2xl font-semibold text-base tracking-wide text-white disabled:text-slate-400 transition-colors"
              style={{ backgroundColor: selectedPaymentMethod ? 'var(--color-brand)' : '#e5e9ef' }}
            >
              {confirming
                ? extraCleanerIds.length > 0 ? 'Sending requests…' : 'Sending request…'
                : extraCleanerIds.length > 0 ? `Confirm and ask ${extraCleanerIds.length + 1} Tidy Pros` : 'Confirm Request'}
            </button>
          )}
        </div>
      </div>
    </main>
  )
}
