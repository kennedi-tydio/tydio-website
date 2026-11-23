'use client'

import { useState } from 'react'
import EmergencyButton from '@/app/components/EmergencyButton'
import { useRouter } from '@/app/components/NavigationSpinner'
import Link from 'next/link'
import { arriveAndStartCleaningAction } from './actions'
import { reportUnableToAccessAction } from '@/app/pro/messages/[bookingId]/actions'
import { formatVisitDuration } from '@/lib/laundry'
import type { TidyTask } from '@/app/dashboard/types'
import LaundromatNotice from '@/app/components/LaundromatNotice'
import BeforePhotosPrompt from './BeforePhotosPrompt'
import ReportCustomerButton from './ReportCustomerButton'

function IconBack() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M10 12L6 8l4-4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconMessage() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  )
}

function IconChevronRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
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

type DirectionsProvider = { label: string; buildUrl: (address: string) => string }

const DIRECTIONS_PROVIDERS: DirectionsProvider[] = [
  { label: 'Apple Maps', buildUrl: (address) => `https://maps.apple.com/?daddr=${encodeURIComponent(address)}` },
  {
    label: 'Google Maps',
    buildUrl: (address) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`,
  },
  { label: 'Waze', buildUrl: (address) => `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes` },
]

type Props = {
  bookingId: string
  customerName: string
  customerPhotoUrl: string | null
  scheduledDate: string | null
  scheduledTime: string | null
  durationMinutes: number
  addressLabel: string | null
  addressLine: string | null
  entryInstructions: string | null
  tasks: { id: string; taskName: string }[]
  // Laundromat trips on this booking (see LaundromatNotice).
  laundromatTasks?: TidyTask[]
  // The booking includes a Standard / Deep Cleaning.
  fullService?: boolean
}

export default function OnTheWayView({
  bookingId,
  customerName,
  customerPhotoUrl,
  scheduledDate,
  scheduledTime,
  durationMinutes,
  addressLabel,
  addressLine,
  entryInstructions,
  tasks,
  laundromatTasks = [],
  fullService = false,
}: Props) {
  const router = useRouter()
  const [showDirections, setShowDirections] = useState(false)
  const [directionsError, setDirectionsError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [askingBeforePhotos, setAskingBeforePhotos] = useState(false)

  const address = addressLine ?? addressLabel ?? ''

  function handleDirectionsPick(provider: DirectionsProvider) {
    if (!navigator.onLine) {
      setDirectionsError("You're offline — can't open maps right now.")
      return
    }
    setDirectionsError(null)
    setShowDirections(false)
    window.open(provider.buildUrl(address), '_blank', 'noopener,noreferrer')
  }

  // "Unable to access location" marks them arrived without starting the job and starts
  // the countdown before they can cancel for no access (see NoAccessView).
  async function handleImHere(startCleaning: boolean, wantsBeforePhotos = false) {
    setWorking(true)
    setError(null)
    const result = await (startCleaning ? arriveAndStartCleaningAction(bookingId) : reportUnableToAccessAction(bookingId))
    setWorking(false)
    setAskingBeforePhotos(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    if (wantsBeforePhotos) router.replace(`/pro/bookings/${bookingId}?before=1`)
    router.refresh()
  }

  return (
    <main id="main-content" className="min-h-svh bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-10 max-w-sm mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <button
            type="button"
            onClick={() => router.push('/pro/dashboard')}
            aria-label="Back"
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-2"
          >
            <IconBack />
          </button>
          <div className="flex items-center gap-2">
            <EmergencyButton addressLine={addressLine} />
            <ReportCustomerButton bookingId={bookingId} />
          </div>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <Avatar name={customerName} photoUrl={customerPhotoUrl} />
          <div className="min-w-0">
            <p className="text-xs text-slate-400">Heading to</p>
            <h1 className="text-lg font-bold text-slate-900 truncate">{customerName}</h1>
            <Link
              href={`/pro/messages/${bookingId}`}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full border-2 px-3.5 py-1.5 text-sm font-semibold text-slate-900"
              style={{ borderColor: 'var(--color-brand)' }}
            >
              <span style={{ color: 'var(--color-brand)' }}><IconMessage /></span>
              Send message
            </Link>
          </div>
        </div>

        {address && <p className="text-sm font-semibold text-slate-900">{addressLabel ?? address}</p>}
        {addressLine && addressLabel && <p className="text-xs text-slate-400 mb-3">{addressLine}</p>}

        <div className="relative mb-6">
          <button
            type="button"
            onClick={() => setShowDirections((v) => !v)}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ backgroundColor: 'var(--color-brand)' }}
          >
            Directions
          </button>
          {directionsError && <p role="alert" className="text-xs text-red-600 mt-2">{directionsError}</p>}
          {showDirections && (
            <div className="absolute left-0 right-0 mt-2 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden z-10">
              {DIRECTIONS_PROVIDERS.map((provider) => (
                <button
                  key={provider.label}
                  type="button"
                  onClick={() => handleDirectionsPick(provider)}
                  className="w-full text-left px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                >
                  {provider.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {scheduledDate && <p className="text-sm font-semibold text-slate-900">{formatDateLabel(scheduledDate)}</p>}
        {scheduledTime && <p className="text-sm text-slate-500 mb-5">{formatTimeRange(scheduledTime, durationMinutes)} · Est. visit {formatVisitDuration(durationMinutes)}</p>}

        <LaundromatNotice tasks={laundromatTasks} className="mb-5" />

        {entryInstructions && (
          <div className="mb-5">
            <p className="text-sm font-bold text-slate-900 mb-1 flex items-center justify-between">
              Directions &amp; Entry
              <IconChevronRight />
            </p>
            <p className="text-sm text-slate-600">{entryInstructions}</p>
          </div>
        )}

        <p className="text-sm font-bold text-slate-900 mb-1.5">Task Summary</p>
        <div className="mb-8">
          {tasks.map((task) => (
            <p key={task.id} className="text-sm text-slate-600">
              {task.taskName}
            </p>
          ))}
        </div>

        {error && <p role="alert" className="text-xs text-red-600 mb-3">{error}</p>}
      </div>

      <div className="px-5 pb-8 max-w-sm mx-auto w-full">
        <button
          type="button"
          onClick={() => setAskingBeforePhotos(true)}
          disabled={working}
          className="w-full py-3.5 rounded-2xl text-center text-sm font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: 'var(--color-brand)' }}
        >
          {working ? 'Letting them know…' : "I've arrived"}
        </button>
        <button
          type="button"
          onClick={() => handleImHere(false)}
          disabled={working}
          className="w-full mt-3 py-3 rounded-2xl text-center text-sm font-semibold border border-slate-200 text-slate-600 disabled:opacity-60"
        >
          Unable to access location
        </button>
      </div>

      {askingBeforePhotos && (
        <BeforePhotosPrompt
          working={working}
          onContinue={(wantsBeforePhotos) => handleImHere(true, wantsBeforePhotos)}
          onClose={() => setAskingBeforePhotos(false)}
          fullService={fullService}
        />
      )}
    </main>
  )
}
