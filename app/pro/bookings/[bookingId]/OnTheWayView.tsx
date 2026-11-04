'use client'

import { useState } from 'react'
import { useRouter } from '@/app/components/NavigationSpinner'
import Link from 'next/link'
import { arriveAndStartCleaningAction } from './actions'

function IconBack() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M10 12L6 8l4-4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconMessage() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
}: Props) {
  const router = useRouter()
  const [showDirections, setShowDirections] = useState(false)
  const [directionsError, setDirectionsError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  async function handleImHere() {
    setWorking(true)
    setError(null)
    const result = await arriveAndStartCleaningAction(bookingId)
    setWorking(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
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
          <Link href={`/pro/messages/${bookingId}`} aria-label="Message" className="w-9 h-9 flex items-center justify-center">
            <IconMessage />
          </Link>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <Avatar name={customerName} photoUrl={customerPhotoUrl} />
          <div className="min-w-0">
            <p className="text-xs text-slate-400">Heading to</p>
            <h1 className="text-lg font-bold text-slate-900 truncate">{customerName}</h1>
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
        {scheduledTime && <p className="text-sm text-slate-500 mb-5">{formatTimeRange(scheduledTime, durationMinutes)}</p>}

        {entryInstructions && (
          <div className="mb-5">
            <p className="text-sm font-bold text-slate-900 mb-1 flex items-center justify-between">
              Entry Instructions
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
          onClick={handleImHere}
          disabled={working}
          className="w-full py-3.5 rounded-2xl text-center text-sm font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: 'var(--color-brand)' }}
        >
          {working ? 'Letting them know…' : "I'm here"}
        </button>
      </div>
    </main>
  )
}
