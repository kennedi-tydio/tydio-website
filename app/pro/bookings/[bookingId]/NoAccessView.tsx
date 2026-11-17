'use client'

import { useEffect, useRef, useState } from 'react'
import EmergencyButton from '@/app/components/EmergencyButton'
import { useRouter } from '@/app/components/NavigationSpinner'
import Link from 'next/link'
import { reportNoAccessAction, startCleaningAction } from '@/app/pro/messages/[bookingId]/actions'
import { NO_ACCESS_WAIT_MINUTES } from '@/lib/bookingTime'
import BeforePhotosPrompt from './BeforePhotosPrompt'
import ElapsedTimer from './ElapsedTimer'
import ReportCustomerButton from './ReportCustomerButton'

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

type Props = {
  bookingId: string
  customerName: string
  entryInstructions: string | null
  // Prefilled into the Text 911 message on the emergency sheet.
  addressLine?: string | null
  // When the cancel unlocks: NO_ACCESS_WAIT_MINUTES past the later of the start and when
  // they pressed "Unable to access location".
  reportableAtMs: number | null
  // When they pressed "I've arrived", for the elapsed time.
  arrivedAtMs: number | null
}

// The cleaner is at the door but can't get in. This screen stays up (the booking is in
// 'arrived') until they get in or the countdown runs out and they cancel, so leaving to
// message the customer brings them back here.
export default function NoAccessView({ bookingId, customerName, entryInstructions, reportableAtMs, arrivedAtMs, addressLine = null }: Props) {
  const router = useRouter()
  const [now, setNow] = useState(() => Date.now())
  const [confirming, setConfirming] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [askingBeforePhotos, setAskingBeforePhotos] = useState(false)
  // The location photo they must take before canceling.
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview)
    }
  }, [photoPreview])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const msLeft = reportableAtMs == null ? null : reportableAtMs - now
  const canReport = msLeft != null && msLeft <= 0

  async function run(action: (id: string) => Promise<{ success: true } | { error: string }>, wantsBeforePhotos = false) {
    setWorking(true)
    setError(null)
    const result = await action(bookingId)
    setWorking(false)
    setAskingBeforePhotos(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    if (wantsBeforePhotos) router.replace(`/pro/bookings/${bookingId}?before=1`)
    router.refresh()
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0]
    // Clear the input so retaking still fires onChange.
    e.target.value = ''
    if (!chosen) return
    setPhoto(chosen)
    setPhotoPreview(URL.createObjectURL(chosen))
    setError(null)
  }

  function cancelWithPhoto() {
    if (!photo) return
    const formData = new FormData()
    formData.set('photo', photo)
    void run((id) => reportNoAccessAction(id, formData))
  }

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-10 max-w-sm mx-auto w-full">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h1 className="text-lg font-bold text-slate-900">Unable to access location</h1>
          <div className="flex items-center gap-2 shrink-0">
            <EmergencyButton addressLine={addressLine} />
            <ReportCustomerButton bookingId={bookingId} />
          </div>
        </div>
        <ElapsedTimer sinceMs={arrivedAtMs} className="mb-5" />

        <div className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-6 text-center mb-4" aria-live="polite">
          {msLeft == null ? (
            <p className="text-sm text-slate-500">Waiting time unavailable.</p>
          ) : canReport ? (
            <>
              <p className="text-5xl font-bold text-slate-900 tabular-nums mb-2">0:00</p>
              <p className="text-sm text-slate-700">
                The timer is up. If you still can&apos;t get in, take a photo of the location and you can cancel the booking.
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Time left to wait</p>
              <p className="text-6xl font-bold text-slate-900 tabular-nums" role="timer">
                {formatCountdown(msLeft)}
              </p>
            </>
          )}
        </div>

        <p className="text-sm text-slate-600 mb-5">
          <span className="font-semibold text-slate-900">You must wait until the timer is up before you cancel the booking.</span>{' '}
          The timer is {NO_ACCESS_WAIT_MINUTES} minutes from the start time or when you pressed &quot;Unable to access
          location&quot;, whichever is later. Try the customer's directions and message {customerName} in the meantime. Our
          team has been notified.
        </p>

        {entryInstructions && (
          <div className="mb-5">
            <p className="text-sm font-bold text-slate-900 mb-1">Directions &amp; Entry</p>
            <p className="text-sm text-slate-600">{entryInstructions}</p>
          </div>
        )}

        <Link
          href={`/pro/messages/${bookingId}`}
          className="block w-full py-2.5 rounded-xl text-center text-sm font-semibold border border-slate-200 text-slate-700"
        >
          Message {customerName}
        </Link>

        {error && <p role="alert" className="text-xs text-red-600 mt-3">{error}</p>}
      </div>

      <div className="px-5 pb-8 max-w-sm mx-auto w-full space-y-3">
        {confirming ? (
          <>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-bold text-slate-900 mb-1">Take a photo of the location first</p>
              <p className="text-sm text-slate-700 leading-relaxed">
                Take a full photo of the location. Stand back far enough to fit the <strong>entire front of the home</strong>,
                with the <strong>house number or apartment number</strong> clearly visible.
              </p>
            </div>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoChange}
              className="hidden"
              aria-label="Take a photo of the location"
            />
            {photoPreview ? (
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoPreview} alt="Photo of the location" className="w-full aspect-[4/3] object-cover rounded-xl mb-2" />
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={working}
                  className="w-full py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600"
                >
                  Retake photo
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={working}
                className="w-full py-3.5 rounded-2xl text-sm font-semibold text-white bg-brand disabled:opacity-60"
              >
                Take photo of location
              </button>
            )}
            <p className="text-sm text-slate-600 text-center">
              Cancel because {customerName} was unavailable? Our team will review the booking and email you about your pay.
            </p>
            <button
              type="button"
              onClick={cancelWithPhoto}
              disabled={working || !photo}
              className="w-full py-3.5 rounded-2xl text-sm font-semibold text-white bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {working ? 'Canceling…' : photo ? 'Yes, cancel booking' : 'Take a photo to cancel'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={working}
              className="w-full py-2 text-sm font-medium text-slate-500"
            >
              Keep waiting
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setAskingBeforePhotos(true)}
              disabled={working}
              className="w-full py-3.5 rounded-2xl text-sm font-semibold text-white bg-brand disabled:opacity-60"
            >
              I got access — continue booking
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={working || !canReport}
              className="w-full py-3 rounded-2xl text-sm font-semibold border border-red-200 text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {canReport || msLeft == null ? 'Cancel — customer unavailable' : `Cancel available in ${formatCountdown(msLeft)}`}
            </button>
          </>
        )}
      </div>
      {askingBeforePhotos && (
        <BeforePhotosPrompt
          working={working}
          onContinue={(wantsBeforePhotos) => run(startCleaningAction, wantsBeforePhotos)}
          onClose={() => setAskingBeforePhotos(false)}
        />
      )}
    </main>
  )
}
