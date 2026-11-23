import Link from 'next/link'

// Quote requests (lib/quoteRequests.ts) at the top of the Messages list, for the
// customer and the Tidy Pro alike. Each opens the request's own page.
export type QuoteRequestSummary = {
  id: string
  href: string
  // The other side: the Tidy Pro for a customer, the customer for a Tidy Pro.
  name: string
  photoUrl: string | null
  statusLabel: string
  scheduledDate: string
  unread: boolean
  // Waiting on the viewer: shown in the brand color.
  actionNeeded: boolean
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatDateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`
}

export default function QuoteRequestList({ quotes }: { quotes: QuoteRequestSummary[] }) {
  if (quotes.length === 0) return null
  return (
    <section aria-labelledby="quote-requests-heading" className="mb-6">
      <h2 id="quote-requests-heading" className="text-sm font-bold text-slate-900 mb-2">
        Quote requests
      </h2>
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm divide-y divide-slate-100 overflow-hidden">
        {quotes.map((q) => (
          <Link key={q.id} href={q.href} className="flex items-center gap-3 px-4 py-3.5">
            <span className="relative flex-shrink-0">
              {q.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={q.photoUrl} alt="" className="w-12 h-12 rounded-full object-cover" />
              ) : (
                <span className="w-12 h-12 rounded-full flex items-center justify-center bg-slate-100 text-slate-500 font-semibold">
                  {q.name.charAt(0).toUpperCase()}
                </span>
              )}
              {q.unread && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-brand ring-2 ring-white" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm truncate text-slate-900 ${q.unread ? 'font-bold' : 'font-semibold'}`}>{q.name}</p>
              <p
                className={`text-xs truncate ${q.actionNeeded ? 'font-semibold' : 'text-slate-400'}`}
                style={q.actionNeeded ? { color: 'var(--color-brand)' } : undefined}
              >
                {q.statusLabel}
              </p>
            </div>
            <p className="text-xs text-slate-400 flex-shrink-0">{formatDateLabel(q.scheduledDate)}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}
