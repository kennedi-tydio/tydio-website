import { describeSearchTime, formatDuration } from '@/lib/unmetBookingSearches'
import { serviceLabels } from '@/lib/tidyProServices'

const TH = 'px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide'

// What happened to a search after it found no one (067_unmet_booking_searches).
const CLOSED_LABELS: Record<string, string> = {
  cleaner_available: 'Sent a new Tidy Pro',
  found_in_search: 'Found one on a later search',
  draft_removed: 'Booked or removed the draft',
}

export type UnmetSearchRow = {
  id: string
  customer_user_id: string
  location_label: string | null
  latitude: number
  longitude: number
  scheduled_date: string | null
  scheduled_end_date: string | null
  scheduled_time: string | null
  scheduled_end_time: string | null
  duration_minutes: number
  required_services: string[]
  task_names: string[]
  estimated_price: number | null
  search_count: number
  closed_at: string | null
  closed_reason: string | null
  created_at: string
}

type Customer = {
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  city: string | null
  state: string | null
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
}

// Customer searches that matched no Tidy Pros: the "No Tidy Pros available" email,
// kept here so it isn't only in the inbox.
export default function UnmetSearches({ rows, customers }: { rows: UnmetSearchRow[]; customers: Map<string, Customer> }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left">
              <th className={TH}>Searched</th>
              <th className={TH}>Customer</th>
              <th className={TH}>Location</th>
              <th className={TH}>Wanted</th>
              <th className={TH}>Services</th>
              <th className={TH}>Est. price</th>
              <th className={TH}>Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((r) => {
              const customer = customers.get(r.customer_user_id)
              const name = [customer?.first_name, customer?.last_name].filter(Boolean).join(' ') || '—'
              const place = [customer?.city, customer?.state].filter(Boolean).join(', ')
              const services = serviceLabels(r.required_services)
              return (
                <tr key={r.id} className="align-top">
                  <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                    <div>{formatDateTime(r.created_at)}</div>
                    {r.search_count > 1 && <div className="text-slate-400">{r.search_count} searches</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>{name}</div>
                    <div className="text-xs text-slate-400">{customer?.email}</div>
                    {customer?.phone && <div className="text-xs text-slate-400">{customer.phone}</div>}
                    {place && <div className="text-xs text-slate-400">{place}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    <div>{r.location_label ?? 'Current location'}</div>
                    <a
                      href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand hover:underline"
                    >
                      View on map
                    </a>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    <div>{describeSearchTime(r.scheduled_date, r.scheduled_time, r.scheduled_end_date, r.scheduled_end_time)}</div>
                    <div className="text-slate-400">{formatDuration(r.duration_minutes)}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {services.length > 0 && <div>{services.join(', ')}</div>}
                    {r.task_names.map((t) => (
                      <div key={t} className="text-slate-400">{t}</div>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                    {r.estimated_price != null ? `$${Number(r.estimated_price).toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    {r.closed_at ? (
                      <>
                        <div className="text-slate-500">{CLOSED_LABELS[r.closed_reason ?? ''] ?? 'Closed'}</div>
                        <div className="text-slate-400">{formatDateTime(r.closed_at)}</div>
                      </>
                    ) : (
                      <div className="font-medium text-amber-600">Still waiting</div>
                    )}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">
                  No searches have come up empty yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
