'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from '@/app/components/NavigationSpinner'
import type { PricedCleanerOption } from '@/lib/recurringBookings'
import { chooseRecurringTidyProAction } from '../../actions'
import { VerifiedCheck } from '@/app/components/VerifiedCheck'

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatSchedule(date: string, time: string): string {
  const d = new Date(`${date}T00:00:00`)
  const [h, m] = time.split(':').map(Number)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()} at ${h12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function IconStar() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="#f5a623" stroke="#f5a623" strokeWidth="1" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

export default function ChooseRecurringTidyProView({
  seriesId,
  nextDate,
  time,
  options,
}: {
  seriesId: string
  nextDate: string
  time: string
  options: PricedCleanerOption[]
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!selected) return
    setSaving(true)
    setError(null)
    const result = await chooseRecurringTidyProAction(seriesId, selected)
    if ('error' in result) {
      setSaving(false)
      setError(result.error)
      return
    }
    router.push('/dashboard/bookings')
  }

  return (
    <main id="main-content" className="min-h-svh bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-10 max-w-sm mx-auto w-full">
        <Link
          href="/dashboard/bookings"
          aria-label="Back"
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-2 mb-4"
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>

        <h1 className="text-2xl font-bold text-slate-900 mb-1">Choose a new Tidy Pro</h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-1">
          Your recurring cleaning goes to them from the next visit on. A visit that&apos;s already booked stays with its Tidy Pro.
        </p>
        <p className="text-sm font-semibold text-slate-900 mb-5">Next visit: {formatSchedule(nextDate, time)}</p>

        {options.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
            <p className="text-sm text-slate-500 leading-relaxed">
              No other Tidy Pros are available at that time. Check back later, or cancel your recurring booking from Bookings.
            </p>
          </div>
        ) : (
          <div role="radiogroup" aria-label="Tidy Pros" className="flex flex-col gap-3">
            {options.map((cleaner) => {
              const isSelected = selected === cleaner.id
              return (
                <button
                  key={cleaner.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setSelected(cleaner.id)}
                  disabled={saving}
                  className="w-full rounded-2xl border px-4 py-3.5 flex items-center gap-3 text-left shadow-sm transition-colors disabled:opacity-50"
                  style={{ borderColor: isSelected ? 'var(--color-brand)' : '#f1f5f9', backgroundColor: isSelected ? '#e8f9fa' : 'white' }}
                >
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-200 flex-shrink-0">
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
                    <div className="flex items-center gap-1 mt-0.5">
                      <IconStar />
                      <span className="text-xs text-slate-600">{cleaner.rating.toFixed(1)}</span>
                      <span className="text-xs text-slate-400">· {cleaner.distanceMiles} miles</span>
                    </div>
                    {cleaner.isTopTidyPro && (
                      <span className="text-[10px] font-semibold" style={{ color: 'var(--color-brand)' }}>
                        Top Tidy Pro
                      </span>
                    )}
                  </div>
                  <span className="text-base font-bold text-slate-900 flex-shrink-0">${cleaner.price}</span>
                </button>
              )
            })}
          </div>
        )}

        {options.length > 0 && (
          <p className="text-xs text-slate-500 leading-relaxed mt-5">
            Prices are per visit, before the Stripe and Trust &amp; Support fee. Each visit is charged when it&apos;s booked, a week ahead.
          </p>
        )}

        {error && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mt-4 leading-relaxed">{error}</p>}
      </div>

      {options.length > 0 && (
        <div className="px-5 pb-8 max-w-sm mx-auto w-full">
          <button
            type="button"
            onClick={handleSave}
            disabled={!selected || saving}
            className="w-full py-3.5 rounded-2xl font-semibold text-sm text-white disabled:text-slate-400"
            style={{ backgroundColor: selected ? 'var(--color-brand)' : '#e5e9ef' }}
          >
            {saving ? 'Saving…' : 'Switch to this Tidy Pro'}
          </button>
        </div>
      )}
    </main>
  )
}
