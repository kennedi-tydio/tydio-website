'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRouter } from '@/app/components/NavigationSpinner'
import type { TidyTask } from '@/app/dashboard/types'
import { lateCancelRefund } from '@/lib/pricingRules'
import { MAX_ENTRY_INSTRUCTIONS_LENGTH } from '@/lib/entryInstructions'
import { laundryDetailLabel, formatVisitDuration } from '@/lib/laundry'
import { formatEstimatedMinutes, isPetTask, petDetailLabel } from '@/lib/petTasks'
import PetTaskDetails from '@/app/components/PetTaskDetails'
import type { CleanerMatch } from '@/lib/cleanerMatching'
import {
  updateTaskNoteAction,
  removeTaskFromBookingAction,
  updateDraftDetailsAction,
  applyPromoCodeAction,
  confirmBookingAction,
} from './actions'

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
  photoUrls: Record<string, string>
  date: string
  time: string
  durationMinutes: number
  addressName: string
  addressLine: string | null
  cleanerName: string
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
  servicePrice: number
  processingFee: number
  totalPrice: number
  paymentMethods: ReviewPaymentMethod[]
  selectedPaymentMethodId: string | null
}

function IconRemove() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M4 4l8 8M4 12L12 4" stroke="var(--color-slate-400)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export default function ReviewRequestView({
  draftId,
  tasks,
  photoUrls,
  date,
  time,
  durationMinutes,
  addressName,
  addressLine,
  cleanerName,
  extraCleanerOptions,
  pets,
  notes: initialNotes,
  entryInstructions: initialEntryInstructions,
  savedEntryInstructions,
  addressLabel,
  suppliesProvided: initialSupplies,
  giftCode: initialGiftCode,
  servicePrice,
  processingFee,
  totalPrice,
  paymentMethods,
  selectedPaymentMethodId,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [notes, setNotes] = useState(initialNotes)
  const [entryInstructions, setEntryInstructions] = useState(initialEntryInstructions)
  const [saveEntryInstructions, setSaveEntryInstructions] = useState(false)
  // Offer to save only when there's an address to save to and the text is new.
  const canSaveEntryInstructions =
    !!addressLabel && entryInstructions.trim() !== (savedEntryInstructions ?? '').trim()
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
  const [extraCleanerIds, setExtraCleanerIds] = useState<string[]>([])
  const extrasAtLimit = extraCleanerIds.length >= MAX_EXTRA_BOOKING_CLEANERS

  function toggleExtraCleaner(id: string) {
    setExtraCleanerIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < MAX_EXTRA_BOOKING_CLEANERS ? [...prev, id] : prev
    )
  }

  const selectedPaymentMethod = paymentMethods.find((pm) => pm.id === selectedPaymentMethodId) ?? null
  const paymentLinkHref = `/dashboard/profile/payment-methods?draftId=${draftId}`

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
    setConfirming(true)
    setConfirmError(null)
    const result = await confirmBookingAction(
      draftId,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      extraCleanerIds,
      canSaveEntryInstructions && saveEntryInstructions
    )
    if ('error' in result) {
      setConfirming(false)
      setConfirmError(result.error)
      return
    }
    router.push(`/dashboard/messages/${result.bookingId}`)
  }

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-40 max-w-sm mx-auto w-full">
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
            <p className="text-xs text-slate-400">Estimated visit: {formatVisitDuration(durationMinutes)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-slate-900">{addressName}</p>
            {addressLine && <p className="text-sm text-slate-500">{addressLine}</p>}
          </div>
        </div>

        <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--color-brand)' }}>
          Selected Tasks
        </h2>
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
                  pet ? formatEstimatedMinutes(task.estimatedMinutes) : null,
                  ...(task.unusual ?? []),
                ].filter(Boolean).join(' · ')
                return (
                <div key={task.id} className="flex items-start gap-2 mb-2">
                  <div className="flex-1 min-w-0 border-b border-slate-100 pb-1.5">
                    <p className="text-sm text-slate-700 truncate">{task.name}</p>
                    {meta && <p className="text-xs text-slate-400 mt-0.5">{meta}</p>}
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

        {extraCleanerOptions.length > 0 && (
          <div className="border-t border-slate-100 pt-5 mb-6">
            <h2 className="text-sm font-bold mb-1" style={{ color: 'var(--color-brand)' }}>
              Ask other Tidy Pros too <span className="font-normal text-slate-400">(optional)</span>
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed mb-3">
              Send this request to up to {MAX_EXTRA_BOOKING_CLEANERS} more Tidy Pros along with {cleanerName}. You&apos;re only charged once, at
              this price. The first to accept gets your booking, and the other requests are canceled.
            </p>
            <div className="flex flex-col gap-2">
              {extraCleanerOptions.map((cleaner) => {
                const isSelected = extraCleanerIds.includes(cleaner.id)
                return (
                  <button
                    key={cleaner.id}
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    onClick={() => toggleExtraCleaner(cleaner.id)}
                    disabled={confirming || (extrasAtLimit && !isSelected)}
                    className="w-full rounded-2xl border px-3 py-2.5 flex items-center gap-3 text-left transition-colors disabled:opacity-50"
                    style={{ borderColor: isSelected ? 'var(--color-brand)' : '#f1f5f9', backgroundColor: isSelected ? '#e8f9fa' : 'white' }}
                  >
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-200 flex-shrink-0">
                      {cleaner.photoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cleaner.photoUrl} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{cleaner.name}</p>
                      <p className="text-xs text-slate-500">
                        <span className="text-amber-500">★</span> {cleaner.rating.toFixed(1)} · {cleaner.distanceMiles} miles
                        {cleaner.isTopTidyPro && (
                          <span className="font-semibold" style={{ color: 'var(--color-brand)' }}> · Top Tidy Pro</span>
                        )}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <label className="flex items-center gap-3 cursor-pointer mb-6">
          <div
            className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${suppliesProvided ? 'border-brand bg-brand' : 'border-slate-300'}`}
            onClick={() => handleSupplies(!suppliesProvided)}
          >
            {suppliesProvided && (
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M2 5.5l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
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
              <Link href="/dashboard/profile/pets?next=/book/review" className="text-sm font-semibold text-brand flex-shrink-0">
                Edit
              </Link>
            </div>
          </div>
          <div className="mb-4">
            <label htmlFor="entry-instructions" className="block text-sm font-bold text-slate-900 mb-1">
              Entry Instructions
            </label>
            <textarea
              id="entry-instructions"
              placeholder="Gate code, where the key is, which door to use…"
              value={entryInstructions}
              maxLength={MAX_ENTRY_INSTRUCTIONS_LENGTH}
              rows={2}
              onChange={(e) => setEntryInstructions(e.target.value)}
              onBlur={(e) => void updateDraftDetailsAction(draftId, { entryInstructions: e.target.value })}
              className="w-full text-sm text-slate-500 placeholder-slate-400 focus:outline-none resize-none"
            />
            {canSaveEntryInstructions && (
              <label className="flex items-center gap-2 cursor-pointer mt-1">
                <input
                  type="checkbox"
                  checked={saveEntryInstructions}
                  onChange={(e) => setSaveEntryInstructions(e.target.checked)}
                  className="w-4 h-4 accent-brand"
                />
                <span className="text-xs text-slate-600">
                  {entryInstructions.trim() ? `Save for future bookings at ${addressLabel}` : `Remove the saved instructions for ${addressLabel}`}
                </span>
              </label>
            )}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 mb-1">Notes</p>
            <textarea
              aria-label="Notes for your Tidy Pro"
              placeholder={`Anything ${cleanerName} should know?`}
              defaultValue={notes}
              rows={2}
              onBlur={(e) => {
                setNotes(e.target.value)
                void updateDraftDetailsAction(draftId, { notes: e.target.value })
              }}
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
                  disabled={applyingGiftCode}
                  className="text-xs font-bold tracking-wide text-slate-400 disabled:opacity-50"
                >
                  {applyingGiftCode ? 'SAVING…' : 'APPLY'}
                </button>
              </div>
              {promoError && <p role="alert" className="text-xs text-red-600 mt-1.5">{promoError}</p>}
            </div>

            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
              <div>
                <p className="text-sm text-slate-800">Payment method</p>
                {selectedPaymentMethod && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    {selectedPaymentMethod.brand} •••• {selectedPaymentMethod.last4}
                  </p>
                )}
              </div>
              <Link href={paymentLinkHref} className="text-sm font-semibold" style={{ color: 'var(--color-brand)' }}>
                {paymentMethods.length === 0
                  ? 'Add payment method'
                  : selectedPaymentMethod
                  ? 'Change payment method'
                  : 'Choose payment method'}
              </Link>
            </div>

            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
              <span className="text-sm text-slate-800">Booking price</span>
              <span className="text-sm font-semibold text-slate-900">${servicePrice.toFixed(2)}</span>
            </div>

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
              The ${processingFee.toFixed(2)} Stripe processing fee is nonrefundable. If your booking is canceled, you&apos;ll be refunded ${servicePrice.toFixed(2)}. If you cancel an accepted booking less than 12 hours before it starts, you&apos;ll be refunded 50% (${lateCancelRefund(totalPrice).toFixed(2)}).
            </p>
          </div>

          <Link
            href="/book/schedule"
            className="block w-full py-3.5 rounded-2xl bg-slate-100 text-slate-400 font-semibold text-sm text-center mt-3"
          >
            Edit booking
          </Link>
        </div>
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 px-5 py-4 safe-area-inset-bottom">
        <div className="max-w-sm mx-auto">
          {confirmError && (
            <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-3 leading-relaxed">
              {confirmError}
            </p>
          )}
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
        </div>
      </div>
    </main>
  )
}
