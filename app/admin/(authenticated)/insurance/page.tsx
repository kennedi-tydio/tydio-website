import { createAdminClient } from '@/lib/supabase/admin'
import { formatExpirationDate } from '@/lib/insuranceExpiration'
import { DEFAULT_BOOKING_TIME_ZONE, shiftDateISO, todayInZone } from '@/lib/bookingTime'
import { approveInsuranceAction, denyInsuranceAction, updateInsuranceExpirationAction } from '../../actions'
import InsuranceSearch, { type SearchField } from './InsuranceSearch'

const SEARCH_BY: SearchField[] = ['name', 'email', 'expires', 'submitted']

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  approved: '#22c55e',
  denied: '#ef4444',
  expired: '#ef4444',
}

function insuranceStatusBadge(status: string | null): { label: string; color: string } {
  switch (status) {
    case 'pending':
      return { label: 'Pending', color: STATUS_COLORS.pending }
    case 'approved':
      return { label: 'Approved', color: STATUS_COLORS.approved }
    case 'denied':
      return { label: 'Denied', color: STATUS_COLORS.denied }
    case 'expired':
      return { label: 'Expired', color: STATUS_COLORS.expired }
    default:
      return { label: 'Not submitted', color: '#cbd5e1' }
  }
}

export default async function AdminInsurancePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; by?: string; q?: string }>
}) {
  const { status = 'pending', by: byParam, q: rawQ = '' } = await searchParams
  const by: SearchField = SEARCH_BY.includes(byParam as SearchField) ? (byParam as SearchField) : 'name'
  const q = rawQ.trim()
  const admin = createAdminClient()
  const earliestExpiration = shiftDateISO(todayInZone(DEFAULT_BOOKING_TIME_ZONE), 1)

  let query = admin
    .from('tidypro_profiles')
    .select('id, insurance_status, insurance_document_url, insurance_submitted_at, insurance_denial_reason, insurance_policy_expiration_date')
    .order('insurance_submitted_at', { ascending: false, nullsFirst: false })

  if (status === 'pending') query = query.eq('insurance_status', 'pending')
  else if (status === 'approved') query = query.eq('insurance_status', 'approved')
  else if (status === 'denied') query = query.eq('insurance_status', 'denied')
  else if (status === 'expired') query = query.eq('insurance_status', 'expired')
  else if (status === 'all') query = query.not('insurance_status', 'is', null)

  if (q && by === 'expires') {
    // A malformed date would make the query error and look like no results.
    query = /^\d{4}-\d{2}-\d{2}$/.test(q) ? query.eq('insurance_policy_expiration_date', q) : query.limit(0)
  }

  const { data: insuranceRows } = await query
  const statusRows = insuranceRows ?? []

  const proIds = statusRows.map((r) => r.id)
  const { data: profiles } = proIds.length
    ? await admin.from('profiles').select('id, first_name, last_name, email').in('id', proIds)
    : { data: [] }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  // Names live on profiles, so these are matched here rather than in the query.
  const needle = q.toLowerCase()
  const rows = statusRows.filter((row) => {
    if (!q) return true
    const profile = profileById.get(row.id)
    if (by === 'name') return [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').toLowerCase().includes(needle)
    if (by === 'email') return (profile?.email ?? '').toLowerCase().includes(needle)
    if (by === 'submitted') return !!row.insurance_submitted_at && todayInZone(DEFAULT_BOOKING_TIME_ZONE, new Date(row.insurance_submitted_at)) === q
    return true
  })

  const signedUrls = await Promise.all(
    rows.map(async (row) => {
      if (!row.insurance_document_url) return [row.id, null] as const
      const { data } = await admin.storage
        .from('insurance-documents')
        .createSignedUrl(row.insurance_document_url, 3600)
      return [row.id, data?.signedUrl ?? null] as const
    })
  )
  const signedUrlById = new Map(signedUrls)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Insurance</h1>
        <p className="text-sm text-slate-400">{rows.length} shown</p>
      </div>

      <div className="flex gap-2 mb-4">
        {[
          { label: 'Pending', value: 'pending' },
          { label: 'Approved', value: 'approved' },
          { label: 'Denied', value: 'denied' },
          { label: 'Expired', value: 'expired' },
          { label: 'All submitted', value: 'all' },
        ].map((opt) => (
          <a
            key={opt.value}
            href={`/admin/insurance?${new URLSearchParams(q ? { status: opt.value, by, q } : { status: opt.value })}`}
            className="px-3 py-2 rounded-xl text-sm border transition-colors"
            style={
              status === opt.value
                ? { backgroundColor: 'var(--color-brand)', color: 'white', borderColor: 'var(--color-brand)' }
                : { borderColor: '#e2e8f0', color: '#64748b' }
            }
          >
            {opt.label}
          </a>
        ))}
      </div>

      <InsuranceSearch key={`${by}:${q}`} status={status} by={by} q={q} />

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Name</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Email</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Submitted</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Expires</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Document</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((row) => {
                const profile = profileById.get(row.id)
                const badge = insuranceStatusBadge(row.insurance_status)
                const name = profile ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || '—' : '—'
                const docUrl = signedUrlById.get(row.id)
                return (
                  <tr key={row.id} className="hover:bg-slate-50 transition-colors align-top">
                    <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{name}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{profile?.email ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                        style={{ color: badge.color, backgroundColor: `${badge.color}1a` }}
                      >
                        {badge.label}
                      </span>
                      {row.insurance_status === 'denied' && row.insurance_denial_reason && (
                        <p className="text-xs text-slate-400 mt-1 max-w-xs">{row.insurance_denial_reason}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                      {row.insurance_submitted_at ? new Date(row.insurance_submitted_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                      {row.insurance_policy_expiration_date ? formatExpirationDate(row.insurance_policy_expiration_date) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {docUrl ? (
                        <a
                          href={docUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold"
                          style={{ color: 'var(--color-brand)' }}
                        >
                          View Document
                        </a>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.insurance_status === 'approved' && (
                        <form action={updateInsuranceExpirationAction.bind(null, row.id)} className="flex flex-col gap-1.5 min-w-[180px]">
                          <label className="text-xs text-slate-500">
                            {row.insurance_policy_expiration_date ? 'Change expiration date' : 'Add expiration date'}
                            <input
                              type="date"
                              name="expirationDate"
                              required
                              min={earliestExpiration}
                              defaultValue={row.insurance_policy_expiration_date ?? ''}
                              className="block w-full mt-1 px-2 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-brand"
                            />
                          </label>
                          <button
                            type="submit"
                            className="text-xs font-medium text-slate-500 border border-slate-200 px-2.5 py-1 rounded-lg hover:bg-slate-50 transition-colors self-start"
                          >
                            Save date
                          </button>
                        </form>
                      )}
                      {row.insurance_status === 'pending' && (
                        <div className="flex flex-col gap-2 min-w-[180px]">
                          <form action={approveInsuranceAction.bind(null, row.id)} className="flex flex-col gap-1.5">
                            <label className="text-xs text-slate-500">
                              Policy expiration date
                              <input
                                type="date"
                                name="expirationDate"
                                required
                                min={earliestExpiration}
                                className="block w-full mt-1 px-2 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-brand"
                              />
                            </label>
                            <button
                              type="submit"
                              className="text-xs font-semibold px-2.5 py-1 rounded-lg text-white transition-opacity hover:opacity-90 self-start"
                              style={{ backgroundColor: 'var(--color-brand)' }}
                            >
                              Approve
                            </button>
                          </form>
                          <form action={denyInsuranceAction.bind(null, row.id)} className="flex flex-col gap-1.5">
                            <textarea
                              aria-label="Reason for denial"
                              name="reason"
                              required
                              placeholder="Reason for denial…"
                              rows={2}
                              className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-brand resize-none"
                            />
                            <button
                              type="submit"
                              className="text-xs font-medium text-slate-500 border border-slate-200 px-2.5 py-1 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors self-start"
                            >
                              Deny
                            </button>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="text-center py-12 text-slate-400 text-sm">{q ? 'No matches for this search.' : 'No submissions in this view.'}</div>
          )}
        </div>
      </div>
    </div>
  )
}
