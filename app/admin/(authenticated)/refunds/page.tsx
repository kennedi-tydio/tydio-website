import { createAdminClient } from '@/lib/supabase/admin'
import { loadAdminRefunds, recentRefundSummary, type AdminRefundRow, type RefundTrigger } from '@/lib/adminRefunds'
import ReviewTabs from '../ReviewTabs'

const TH = 'px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide'

const FILTERS = ['all', 'automatic', 'customer', 'tidy-pro', 'admin', 'unknown'] as const
type Filter = (typeof FILTERS)[number]
const FILTER_TRIGGER: Record<Exclude<Filter, 'all'>, RefundTrigger> = {
  automatic: 'Automatic',
  customer: 'Customer',
  'tidy-pro': 'Tidy Pro',
  admin: 'Admin',
  unknown: 'Unknown',
}

function money(value: number): string {
  return `$${value.toFixed(2)}`
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
}

function fullName(p: { first_name: string | null; last_name: string | null } | undefined): string {
  return [p?.first_name, p?.last_name].filter(Boolean).join(' ') || '—'
}

function StatusBadge({ row }: { row: AdminRefundRow }) {
  const style =
    row.status === 'succeeded'
      ? 'bg-emerald-50 text-emerald-700'
      : row.status === 'pending' || row.status === 'requires_action'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-red-50 text-red-700'
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${style}`}>
      {row.status.replace(/_/g, ' ')}
      {row.failureReason ? ` (${row.failureReason.replace(/_/g, ' ')})` : ''}
    </span>
  )
}

export default async function AdminRefundsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams
  const tab: Filter = FILTERS.includes(tabParam as Filter) ? (tabParam as Filter) : 'all'
  const admin = createAdminClient()

  let refunds: AdminRefundRow[] = []
  let loadError: string | null = null
  try {
    refunds = await loadAdminRefunds(admin)
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err)
  }

  const rows = tab === 'all' ? refunds : refunds.filter((r) => r.trigger === FILTER_TRIGGER[tab])
  const count = (f: Exclude<Filter, 'all'>) => refunds.filter((r) => r.trigger === FILTER_TRIGGER[f]).length

  const profileIds = [...new Set(rows.map((r) => r.profileId).filter((id): id is string => !!id))]
  const { data: profiles } = profileIds.length
    ? await admin.from('profiles').select('id, first_name, last_name, email, role').in('id', profileIds)
    : { data: [] }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  const recent = recentRefundSummary(refunds)

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Refunds</h1>
      <p className="text-sm text-slate-500 mb-6">
        Every refund in Stripe, newest first, including automatic ones and anything refunded in Stripe&apos;s dashboard. Each is matched to the
        booking or fee it came from. Shows the latest {refunds.length >= 300 ? '300' : refunds.length} refunds.
      </p>

      {loadError && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
          Couldn&apos;t load refunds from Stripe: {loadError}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6 max-w-xl">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3">
          <div className="text-xs text-slate-400">Refunded, last 30 days</div>
          <div className="text-lg font-bold text-slate-900">{money(recent.total)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3">
          <div className="text-xs text-slate-400">Refunds, last 30 days</div>
          <div className="text-lg font-bold text-slate-900">{recent.count}</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3">
          <div className="text-xs text-slate-400">Not succeeded</div>
          <div className="text-lg font-bold text-slate-900">{refunds.filter((r) => r.status !== 'succeeded').length}</div>
        </div>
      </div>

      <ReviewTabs
        basePath="/admin/refunds"
        current={tab}
        tabs={[
          { value: 'all', label: 'All', count: refunds.length },
          { value: 'automatic', label: 'Automatic', count: count('automatic') },
          { value: 'customer', label: 'Customer', count: count('customer') },
          { value: 'tidy-pro', label: 'Tidy Pro', count: count('tidy-pro') },
          { value: 'admin', label: 'Admin', count: count('admin') },
          { value: 'unknown', label: 'Unknown', count: count('unknown') },
        ]}
      />

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className={TH}>Refunded</th>
                <th className={TH}>Amount</th>
                <th className={TH}>Status</th>
                <th className={TH}>For</th>
                <th className={TH}>Triggered by</th>
                <th className={TH}>Why</th>
                <th className={TH}>Person</th>
                <th className={TH}>Stripe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r) => {
                const person = r.profileId ? profileById.get(r.profileId) : undefined
                return (
                  <tr key={r.id} className="align-top">
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                    <td className="px-4 py-3 text-slate-900 whitespace-nowrap">
                      <div className="font-semibold">{money(r.amount)}</div>
                      {r.chargedAmount != null && <div className="text-xs text-slate-400">of {money(r.chargedAmount)}</div>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge row={r} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                      <div>{r.charge}</div>
                      {r.bookingId && <div className="text-[11px] font-mono text-slate-400">{r.bookingId.slice(0, 8)}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{r.trigger}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-72">{r.reason}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {person ? (
                        <>
                          <div>{fullName(person)}</div>
                          <div className="text-xs text-slate-400">{person.email}</div>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      {r.stripeUrl ? (
                        <a href={r.stripeUrl} target="_blank" rel="noreferrer" className="text-brand font-semibold hover:underline">
                          Open
                        </a>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                      <div className="text-[11px] font-mono text-slate-400">{r.id}</div>
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && !loadError && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                    No refunds{tab === 'all' ? ' yet' : ' here'}.
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
