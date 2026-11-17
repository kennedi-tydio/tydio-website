'use client'

import Link from 'next/link'
import { useRouter } from '@/app/components/NavigationSpinner'
import type { CleanerMatch } from '@/lib/cleanerMatching'
import TidyProPickList, { usePersistedPicks } from '@/app/components/TidyProPickList'

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatSchedule(date: string, time: string): string {
  const d = new Date(`${date}T00:00:00`)
  const [h, m] = time.split(':').map(Number)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()} at ${h12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

// The review page reads the same picks (scope = the draft) when the customer comes back.
export default function ChooseOtherTidyProsView({
  draftId,
  scheduledDate,
  scheduledTime,
  options,
  max,
}: {
  draftId: string
  scheduledDate: string
  scheduledTime: string
  options: CleanerMatch[]
  max: number
}) {
  const router = useRouter()
  const { picks, toggle } = usePersistedPicks(`draft:${draftId}`, options.map((o) => o.id), max)

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-36 max-w-sm mx-auto w-full">
        <Link href="/book/review" aria-label="Back" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-2 mb-4">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>

        <h1 className="text-2xl font-bold text-slate-900 mb-1">Choose other Tidy Pros</h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-1">
          Check off up to {max} more available Tidy Pros to ask. If fewer are listed, those are everyone free at that time. Tap one to see their
          profile first. You&apos;re only charged once, and the first to accept gets your booking.
        </p>
        <p className="text-sm font-semibold text-slate-900 mb-5">{formatSchedule(scheduledDate, scheduledTime)}</p>

        {options.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
            <p className="text-sm text-slate-500 leading-relaxed">No other Tidy Pros are free at that time.</p>
          </div>
        ) : (
          <TidyProPickList options={options} picks={picks} onToggle={toggle} max={max} />
        )}
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 px-5 py-4 safe-area-inset-bottom">
        <div className="max-w-sm mx-auto">
          <button
            type="button"
            onClick={() => router.push('/book/review')}
            className="w-full py-4 rounded-2xl font-semibold text-base tracking-wide text-white"
            style={{ backgroundColor: 'var(--color-brand)' }}
          >
            {picks.length === 0 ? 'Back to review' : `Ask ${picks.length} more Tidy Pro${picks.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </main>
  )
}
