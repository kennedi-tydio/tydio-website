import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { INCIDENT_LABELS, REFUND_LEVEL_LABELS } from '@/lib/bookingIncidents'

const TH = 'px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide'

function fullName(p: { first_name: string | null; last_name: string | null } | undefined): string {
  return [p?.first_name, p?.last_name].filter(Boolean).join(' ') || '—'
}

export default async function AdminIncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab: tabParam } = await searchParams
  const tab = tabParam === 'settled' ? 'settled' : 'open'
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('bookings')
    .select('id, user_id, tidy_pro_id, incident_type, incident_reported_at, incident_resolved_at, incident_refund_level, scheduled_date, total_customer_charge')
    .not('incident_type', 'is', null)
    .order('incident_reported_at', { ascending: false })

  const incidents = data ?? []
  const open = incidents.filter((i) => !i.incident_resolved_at)
  const settled = incidents.filter((i) => i.incident_resolved_at)
  const rows = tab === 'open' ? open : settled

  const profileIds = [...new Set(rows.flatMap((r) => [r.user_id, r.tidy_pro_id]).filter((id): id is string => !!id))]
  const { data: profiles } = profileIds.length
    ? await admin.from('profiles').select('id, first_name, last_name').in('id', profileIds)
    : { data: [] }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Incidents</h1>
      <p className="text-sm text-slate-500 mb-6">
        Bookings a cleaner reported as &ldquo;no access&rdquo; or a customer reported as a no-show. Each is canceled with no
        money moved until you settle it.
      </p>

      {error && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
          Couldn&apos;t load incidents: {error.message}. If a column is missing, apply the latest database migrations.
        </p>
      )}

      <div className="flex gap-2 mb-4">
        {[
          { value: 'open', label: 'Needs settling', count: open.length },
          { value: 'settled', label: 'Settled', count: settled.length },
        ].map((t) => (
          <a
            key={t.value}
            href={`/admin/incidents?tab=${t.value}`}
            className="px-3 py-2 rounded-xl text-sm border transition-colors"
            style={
              tab === t.value
                ? { backgroundColor: 'var(--color-brand)', color: 'white', borderColor: 'var(--color-brand)' }
                : { borderColor: '#e2e8f0', color: '#64748b' }
            }
          >
            {t.label} ({t.count})
          </a>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className={TH}>Type</th>
                <th className={TH}>Customer</th>
                <th className={TH}>Cleaner</th>
                <th className={TH}>Booking date</th>
                <th className={TH}>Charged</th>
                <th className={TH}>Reported</th>
                {tab === 'settled' && <th className={TH}>Outcome</th>}
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                    {r.incident_type ? INCIDENT_LABELS[r.incident_type] : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{fullName(profileById.get(r.user_id))}</td>
                  <td className="px-4 py-3 text-slate-600">{r.tidy_pro_id ? fullName(profileById.get(r.tidy_pro_id)) : '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{r.scheduled_date ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {r.total_customer_charge != null ? `$${r.total_customer_charge.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                    {r.incident_reported_at ? new Date(r.incident_reported_at).toLocaleString() : '—'}
                  </td>
                  {tab === 'settled' && (
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {r.incident_refund_level ? REFUND_LEVEL_LABELS[r.incident_refund_level] : '—'}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/incidents/${r.id}`}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg text-white transition-opacity hover:opacity-90 bg-brand"
                    >
                      {tab === 'open' ? 'Settle' : 'View'}
                    </Link>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                    {tab === 'open' ? 'Nothing to settle.' : 'No settled incidents yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
