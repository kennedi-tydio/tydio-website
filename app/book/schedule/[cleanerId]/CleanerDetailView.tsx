'use client'

import Link from 'next/link'
import { useRouter } from '@/app/components/NavigationSpinner'
import { WEEKDAY_KEYS, type WeekdayKey, type WeeklyAvailability } from '@/lib/cleanerMatching'
import { US_STATES } from '@/lib/usStates'
import { IconLeaf } from '@/app/components/IconLeaf'

const DAY_LABELS: Record<WeekdayKey, string> = {
  sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat',
}

function formatCompactTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, '0')}${period}`
}

function formatResponseTime(minutes: number | null): string | null {
  if (minutes == null) return null
  if (minutes < 60) return '<1 hr response time'
  return `~${Math.round(minutes / 60)} hr response time`
}

function IconStar() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#f5a623" stroke="#f5a623" strokeWidth="1">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function IconInsuredBadge() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="var(--color-brand)" stroke="var(--color-brand)" strokeWidth="0.5">
      <path d="M12 2L4 5v6c0 5.5 3.4 9.9 8 11 4.6-1.1 8-5.5 8-11V5l-8-3z" />
      <path d="M9.5 12.2l1.8 1.8 3.7-3.7" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconPin() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" />
    </svg>
  )
}

function IconChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
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

type Props = {
  cleanerId: string
  name: string
  photoUrl: string | null
  bio: string | null
  city: string | null
  state: string | null
  rating: number
  reviewCount: number
  isVerified: boolean
  isInsured: boolean
  averageResponseTimeMinutes: number | null
  availability: WeeklyAvailability
  allergies: string[]
  usesOrganicProducts: boolean
  reviewsHref: string
  // Set when a Tidy Pro is viewing their own profile as a customer would: back
  // returns here, and Book/Message are on the page for show but do nothing.
  previewBackHref?: string
}

export default function CleanerDetailView({
  cleanerId,
  name,
  photoUrl,
  bio,
  city,
  state,
  rating,
  reviewCount,
  isVerified,
  isInsured,
  averageResponseTimeMinutes,
  availability,
  allergies,
  usesOrganicProducts,
  reviewsHref,
  previewBackHref,
}: Props) {
  const router = useRouter()
  const stateName = state ? US_STATES.find((s) => s.code === state)?.name ?? state : null
  const location = [city, stateName].filter(Boolean).join(', ')
  const responseTimeLabel = formatResponseTime(averageResponseTimeMinutes)
  const initials = name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto max-w-sm mx-auto w-full pb-16">
        {/* Hero photo */}
        <div className="relative h-56 bg-slate-200 flex-shrink-0">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: 'var(--color-brand)' }}>
              <span className="text-white text-4xl font-bold">{initials || '?'}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => (previewBackHref ? router.push(previewBackHref) : router.back())}
            aria-label="Back"
            className="absolute top-4 left-4 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 12L6 8l4-4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Message"
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white flex items-center justify-center shadow"
          >
            <IconMessage />
          </button>
        </div>

        <div className="px-5 pt-5">
          <h1 className="text-2xl font-bold text-slate-900">{name}</h1>

          <div className="flex flex-col gap-1.5 mt-2 mb-4">
            {isVerified && (
              <div className="flex items-center gap-1.5 text-sm text-slate-600">
                <IconStar /> Top Tidy Pro
                {responseTimeLabel && <span className="text-slate-400 ml-auto text-xs">{responseTimeLabel}</span>}
              </div>
            )}
            {isInsured && (
              <div className="flex items-center gap-1.5 text-sm text-slate-600">
                <IconInsuredBadge /> Insured Cleaner
              </div>
            )}
            {location && (
              <div className="flex items-center gap-1.5 text-sm text-slate-600">
                <IconPin /> {location}
              </div>
            )}
          </div>

          {(bio || usesOrganicProducts) && (
            <div className="border-t border-slate-100 pt-4 mb-4">
              <h2 className="font-semibold text-slate-900 mb-1.5">About</h2>
              {bio && <p className="text-sm text-slate-500 leading-relaxed">{bio}</p>}
              {usesOrganicProducts && (
                <p className={`flex items-center gap-1.5 text-sm text-slate-600 ${bio ? 'mt-2' : ''}`}>
                  <IconLeaf /> This cleaner uses organic cleaning products
                </p>
              )}
            </div>
          )}

          <div className="border-t border-slate-100 pt-4 mb-4">
            <Link href={reviewsHref} className="block">
              <div className="w-full flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">Reviews</h2>
                <IconChevronRight />
              </div>
              {reviewCount > 0 ? (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <IconStar />
                  <span className="text-sm font-semibold text-slate-800">{rating.toFixed(1)}</span>
                  <span className="text-sm text-slate-400">{reviewCount} review{reviewCount === 1 ? '' : 's'}</span>
                </div>
              ) : (
                <p className="text-sm text-slate-400 mt-1.5">No reviews yet</p>
              )}
            </Link>
          </div>

          <div className="border-t border-slate-100 pt-4 mb-5">
            <h2 className="font-semibold text-slate-900 mb-1.5">Availability</h2>
            <div className="flex flex-col gap-0.5">
              {WEEKDAY_KEYS.map((day) => {
                const ranges = availability[day] ?? []
                return (
                  <p key={day} className="text-sm text-slate-600">
                    <span className="font-medium text-slate-800">{DAY_LABELS[day]}:</span>{' '}
                    {ranges.length === 0
                      ? 'Not available'
                      : ranges.map((r) => `${formatCompactTime(r.start)}-${formatCompactTime(r.end)}`).join(', ')}
                  </p>
                )
              })}
            </div>
          </div>

          {previewBackHref ? (
            <button
              type="button"
              className="block w-full py-3.5 rounded-2xl text-white font-semibold text-sm text-center mb-5"
              style={{ backgroundColor: 'var(--color-brand)' }}
            >
              Book
            </button>
          ) : (
            <Link
              href={`/book/schedule/${cleanerId}/time`}
              className="block w-full py-3.5 rounded-2xl text-white font-semibold text-sm text-center mb-5"
              style={{ backgroundColor: 'var(--color-brand)' }}
            >
              Book
            </Link>
          )}

          {allergies.length > 0 && (
            <div className="border-t border-slate-100 pt-4">
              <h2 className="font-semibold text-slate-900 mb-1.5">Allergies</h2>
              <p className="text-sm text-slate-600">{allergies.join(', ')}</p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
