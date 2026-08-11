'use client'

import { useState } from 'react'
import Link from 'next/link'
import { saveSchedule, searchAvailableCleaners, type CleanerSearchResult, type ScheduledLocation, type Schedule } from './actions'
import { type SavedAddress } from '@/app/dashboard/profile/addresses/actions'
import AddressForm from '@/app/dashboard/profile/addresses/AddressForm'

type Address = SavedAddress

type Field = 'location' | 'date' | 'time' | null

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']
const WEEKDAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function formatDateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
  return `${weekday}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`
}

function formatTimeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addressLine(a: Address): string {
  const street = a.unit_number ? `${a.street_address} ${a.unit_number}` : a.street_address
  return `${street}, ${a.city}, ${a.state}, ${a.zip_code}`
}

// ── icons ────────────────────────────────────────────────────────────────────

function IconPin() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" />
    </svg>
  )
}
function IconCalendar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}
function IconClock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" />
    </svg>
  )
}
function IconChevron({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }}>
      <path d="M4 6l4 4 4-4" />
    </svg>
  )
}
function IconStar() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="#38C7CA" stroke="none">
      <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.9L5.7 21l1.7-7L2 9.2l7.1-.6z" />
    </svg>
  )
}
function IconVerified() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#22c55e" stroke="white" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
      <path d="M7.5 12.5l2.8 2.8 6.2-6.6" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconMessage() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  )
}

function MapPlaceholder() {
  return (
    <div className="relative rounded-2xl overflow-hidden h-40 mt-6" style={{ backgroundColor: '#e2e5e9' }}>
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice">
        <line x1="0" y1="60" x2="400" y2="50" stroke="white" strokeWidth="8" opacity="0.6" />
        <line x1="0" y1="120" x2="400" y2="110" stroke="white" strokeWidth="5" opacity="0.5" />
        <line x1="80" y1="0" x2="65" y2="160" stroke="white" strokeWidth="8" opacity="0.6" />
        <line x1="220" y1="0" x2="235" y2="160" stroke="white" strokeWidth="5" opacity="0.45" />
        <line x1="320" y1="0" x2="340" y2="160" stroke="white" strokeWidth="6" opacity="0.5" />
      </svg>
    </div>
  )
}

// ── calendar ─────────────────────────────────────────────────────────────────

function CalendarGrid({ selected, onSelect }: { selected: string | null; onSelect: (iso: string) => void }) {
  const initial = selected ? new Date(`${selected}T00:00:00`) : new Date()
  const [viewYear, setViewYear] = useState(initial.getFullYear())
  const [viewMonth, setViewMonth] = useState(initial.getMonth())

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const startOffset = new Date(viewYear, viewMonth, 1).getDay()
  const cells: (number | null)[] = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  function changeMonth(delta: number) {
    let m = viewMonth + delta
    let y = viewYear
    if (m < 0) { m = 11; y -= 1 }
    if (m > 11) { m = 0; y += 1 }
    setViewMonth(m)
    setViewYear(y)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={() => changeMonth(-1)} aria-label="Previous month" className="w-7 h-7 flex items-center justify-center text-slate-400">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <span className="text-sm font-semibold text-slate-900">{MONTHS[viewMonth]} {viewYear}</span>
        <button type="button" onClick={() => changeMonth(1)} aria-label="Next month" className="w-7 h-7 flex items-center justify-center text-slate-400">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-2 text-center">
        {WEEKDAY_LABELS.map((w) => <span key={w} className="text-[10px] font-semibold text-slate-400">{w}</span>)}
        {cells.map((day, i) => {
          if (day == null) return <span key={i} />
          const iso = toISODate(new Date(viewYear, viewMonth, day))
          const isSelected = iso === selected
          return (
            <button
              type="button"
              key={i}
              onClick={() => onSelect(iso)}
              className={`w-8 h-8 mx-auto rounded-full text-sm flex items-center justify-center ${isSelected ? 'text-white font-semibold' : 'text-slate-700 hover:bg-slate-100'}`}
              style={isSelected ? { backgroundColor: '#38C7CA' } : undefined}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── component ────────────────────────────────────────────────────────────────

export default function SchedulePicker({
  draftId,
  addresses: initialAddresses,
  initialSchedule,
}: {
  draftId: string
  addresses: Address[]
  initialSchedule: Schedule
}) {
  const [addresses, setAddresses] = useState<Address[]>(initialAddresses)
  const [activeField, setActiveField] = useState<Field>(null)
  const [location, setLocation] = useState<ScheduledLocation | null>(initialSchedule.location)
  const [date, setDate] = useState<string | null>(initialSchedule.date)
  const [time, setTime] = useState<string | null>(initialSchedule.time)
  const [pendingTime, setPendingTime] = useState('08:30')
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<CleanerSearchResult | null>(null)
  const [showAddressForm, setShowAddressForm] = useState(false)

  const locationLabel = location
    ? location.type === 'current_location' ? 'Current Location' : location.label
    : 'Current Location'
  const dateLabel = date ? formatDateLabel(date) : 'Any day'
  const timeLabel = time ? formatTimeLabel(time) : 'Anytime'

  function toggleField(field: Exclude<Field, null>) {
    setActiveField((prev) => (prev === field ? null : field))
  }

  function requestCurrentLocation(): Promise<ScheduledLocation | null> {
    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) {
        setLocationError("Location services aren't available on this device.")
        resolve(null)
        return
      }
      setLocating(true)
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocating(false)
          setLocationError(null)
          resolve({ type: 'current_location', latitude: pos.coords.latitude, longitude: pos.coords.longitude })
        },
        () => {
          setLocating(false)
          setLocationError("We couldn't access your location. Try picking a saved address instead.")
          resolve(null)
        },
        { timeout: 8000 }
      )
    })
  }

  async function handleSelectCurrentLocation() {
    const loc = await requestCurrentLocation()
    if (loc) {
      setLocation(loc)
      setActiveField(null)
    }
  }

  function handleSelectAddress(a: Address) {
    setLocation({
      type: 'address',
      addressId: a.id,
      label: a.label,
      line: addressLine(a),
      latitude: a.latitude,
      longitude: a.longitude,
    })
    setActiveField(null)
  }

  function handleAddressSaved(a: Address) {
    setAddresses((prev) => [...prev, a])
    setShowAddressForm(false)
    handleSelectAddress(a)
  }

  function handleClearAll() {
    setLocation(null)
    setDate(null)
    setTime(null)
    setResults(null)
    setLocationError(null)
    setActiveField(null)
  }

  async function handleSearch() {
    setLocationError(null)
    let loc = location
    if (!loc) {
      loc = await requestCurrentLocation()
      if (!loc) return
      setLocation(loc)
    }
    if (loc.latitude == null || loc.longitude == null) {
      setLocationError("We don't have a precise location for that address yet — try Current Location or a different saved address.")
      return
    }

    const schedule: Schedule = { location: loc, date, time }
    setSearching(true)
    try {
      await saveSchedule(draftId, schedule)
      const found = await searchAvailableCleaners(draftId, schedule)
      setResults(found)
    } finally {
      setSearching(false)
    }
  }

  const cleaners = results?.cleaners ?? null

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-16 max-w-sm mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <Link href="/book" aria-label="Back" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </Link>
          <Link href="/dashboard" aria-label="Cancel booking and return to tasks" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" /></svg>
          </Link>
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mb-5">Plan your booking</h1>

        <div className="flex flex-col gap-3 mb-5">
          {/* Location */}
          <div className="rounded-2xl bg-slate-50 px-4 py-3.5">
            <button type="button" onClick={() => toggleField('location')} className="w-full flex items-center gap-2.5">
              <IconPin />
              <span className="text-sm text-slate-800 flex-1 text-left truncate">{locationLabel}</span>
              <IconChevron open={activeField === 'location'} />
            </button>
            {activeField === 'location' && (
              <div className="mt-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={handleSelectCurrentLocation}
                  disabled={locating}
                  className="w-full text-left text-sm font-medium px-3 py-2 rounded-lg mb-1"
                  style={{ backgroundColor: '#e8f9fa', color: '#1a2332' }}
                >
                  {locating ? 'Finding you…' : 'Current Location'}
                </button>
                {addresses.length > 0 && (
                  <div className="mt-2 flex flex-col divide-y divide-slate-200">
                    {addresses.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => handleSelectAddress(a)}
                        className="text-left py-2.5 px-1"
                      >
                        <p className="text-sm font-semibold text-slate-900">{a.label}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{addressLine(a)}</p>
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowAddressForm(true)}
                  className="flex items-center gap-2 text-sm text-slate-400 mt-2 px-1 py-1.5"
                >
                  <span className="text-lg leading-none">+</span> Add new address
                </button>
              </div>
            )}
          </div>

          {/* Date */}
          <div className="rounded-2xl bg-slate-50 px-4 py-3.5">
            <button type="button" onClick={() => toggleField('date')} className="w-full flex items-center gap-2.5">
              <IconCalendar />
              <span className="text-sm text-slate-800 flex-1 text-left">{dateLabel}</span>
              <IconChevron open={activeField === 'date'} />
            </button>
            {activeField === 'date' && (
              <div className="mt-3 pt-3 border-t border-slate-200">
                <CalendarGrid
                  selected={date}
                  onSelect={(iso) => {
                    setDate(iso)
                    setActiveField(null)
                  }}
                />
              </div>
            )}
          </div>

          {/* Time */}
          <div className="rounded-2xl bg-slate-50 px-4 py-3.5">
            <button type="button" onClick={() => toggleField('time')} className="w-full flex items-center gap-2.5">
              <IconClock />
              <span className="text-sm text-slate-800 flex-1 text-left">{timeLabel}</span>
              <IconChevron open={activeField === 'time'} />
            </button>
            {activeField === 'time' && (
              <div className="mt-3 pt-3 border-t border-slate-200 flex items-center gap-3">
                <input
                  type="time"
                  value={time ?? pendingTime}
                  onChange={(e) => setPendingTime(e.target.value)}
                  className="flex-1 rounded-xl bg-white border border-slate-200 px-3 py-2.5 text-sm text-slate-800"
                />
                <button
                  type="button"
                  onClick={() => {
                    setTime(pendingTime)
                    setActiveField(null)
                  }}
                  className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm"
                  style={{ backgroundColor: '#1a2332' }}
                >
                  Confirm
                </button>
              </div>
            )}
          </div>
        </div>

        {locationError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4 leading-relaxed">
            {locationError}
          </p>
        )}

        <button
          type="button"
          onClick={handleSearch}
          disabled={searching}
          className="w-full py-4 rounded-2xl text-white font-semibold text-base tracking-wide disabled:opacity-60"
          style={{ backgroundColor: '#38C7CA' }}
        >
          {searching ? 'Searching…' : 'Search'}
        </button>
        <button type="button" onClick={handleClearAll} className="mt-3 text-sm text-slate-400 underline">
          Clear all
        </button>

        {/* Results */}
        {cleaners === null ? (
          <MapPlaceholder />
        ) : results?.error?.code === 'STATE_PRICING_NOT_CONFIGURED' ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm mt-6">
            <p className="font-semibold text-slate-900 mb-1">Pricing isn&apos;t available here yet</p>
            <p className="text-sm text-slate-400">{results.error.message}</p>
          </div>
        ) : cleaners.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm mt-6">
            <p className="font-semibold text-slate-900 mb-1">There are no cleaners available</p>
            <p className="text-sm text-slate-400">Try changing the date and time, or choose Any day / Anytime.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 mt-6">
            {cleaners.map((cleaner) => (
              <div key={cleaner.id} className="rounded-2xl bg-slate-50 p-4">
                <Link href={`/book/schedule/${cleaner.id}`} className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative flex-shrink-0">
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-200">
                        {cleaner.photoUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={cleaner.photoUrl} alt="" className="w-full h-full object-cover" />
                        )}
                      </div>
                      {cleaner.isVerified && (
                        <div className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white p-0.5">
                          <IconVerified />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-slate-900 truncate">{cleaner.name}</p>
                        {cleaner.isTopTidyPro && (
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                            style={{ color: '#38C7CA', backgroundColor: '#38C7CA1a' }}
                          >
                            Top Tidy Pro
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <IconStar />
                        <span className="text-xs text-slate-600">{cleaner.rating.toFixed(1)}</span>
                        <span className="text-xs text-slate-400">{cleaner.reviewCount}+ reviews</span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <IconPin />
                        <span className="text-xs text-slate-400">{cleaner.distanceMiles} miles</span>
                      </div>
                    </div>
                  </div>
                  <span className="text-base font-bold text-slate-900 flex-shrink-0">${cleaner.price}</span>
                </Link>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    type="button"
                    className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl bg-white border border-slate-200"
                    aria-label="Message"
                  >
                    <IconMessage />
                  </button>
                  <Link
                    href={`/book/schedule/${cleaner.id}/time`}
                    className="flex-1 h-11 rounded-xl text-white font-semibold text-sm flex items-center justify-center"
                    style={{ backgroundColor: '#38C7CA' }}
                  >
                    Book
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddressForm && (
        <AddressForm onSaved={handleAddressSaved} onClose={() => setShowAddressForm(false)} />
      )}
    </div>
  )
}
