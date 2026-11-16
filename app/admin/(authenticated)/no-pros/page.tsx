import { createAdminClient } from '@/lib/supabase/admin'
import { ALL_DECLINED_REASON, NO_RESPONSE_REASON } from '@/lib/bookingRequestGroups'
import { oneRowPerRequest, prosAskedByRow } from '@/lib/adminBookingRows'
import { saveCancellationReviewAction } from '../../actions'
import ReviewForm from '../ReviewForm'
import ReviewTabs from '../ReviewTabs'

const TH = 'px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide'

const REASON_LABELS: Record<string, string> = {
  [NO_RESPONSE_REASON]: 'No pros available',
  [ALL_DECLINED_REASON]: 'Everyone declined',
}

function fullName(p: { first_name: string | null; last_name: string | null } | undefined): string {
  return [p?.first_name, p?.last_name].filter(Boolean).join(' ') || '—'
}

function refundLabel(b: { stripe_payment_intent_id: string | null; stripe_refund_id: string | null }): string {
  if (!b.stripe_payment_intent_id) return 'Not charged'
  return b.stripe_refund_id ? 'Refunded' : 'No refund'
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
}

export default async function AdminNoProsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams
  const tab = tabParam === 'resolved' ? 'resolved' : 'open'
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('bookings')
    .select(
      'id, user_id, request_group_id, cancelled_reason, cancellation_resolved_at, cancellation_admin_note, stripe_payment_intent_id, stripe_refund_id, scheduled_date, scheduled_time, total_customer_charge, updated_at'
    )
    .eq('status', 'cancelled')
    .in('cancelled_reason', Object.keys(REASON_LABELS))
    .order('updated_at', { ascending: false })
    .limit(1000)

  const all = data ?? []
  const groupIds = [...new Set(all.map((b) => b.request_group_id).filter((id): id is string => !!id))]
  const { data: groups } = groupIds.length
    ? await admin.from('booking_request_groups').select('id, original_booking_id, primary_booking_id').in('id', groupIds)
    : { data: [] }
  const requests = oneRowPerRequest(all, groups ?? [])
  const prosAsked = prosAskedByRow(all, requests, groups ?? [])

  const open = requests.filter((b) => !b.cancellation_resolved_at)
  const resolved = requests.filter((b) => b.cancellation_resolved_at)
  const rows = tab === 'open' ? open : resolved

  const customerIds = [...new Set(rows.map((r) => r.user_id))]
  const { data: profiles } = customerIds.length
    ? await admin.from('profiles').select('id, first_name, last_name, email, phone, city, state').in('id', customerIds)
    : { data: [] }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">No Pros</h1>
      <p className="text-sm text-slate-500 mb-6">
        Booking requests that closed without a Tidy Pro, newest first: either no Tidy Pro responded in time (no pros available) or every
        Tidy Pro asked turned it down (everyone declined). The customer was refunded automatically. Check one off once you&apos;ve followed
        up, and keep notes for yourself.
      </p>

      {error && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
          Couldn&apos;t load these bookings: {error.message}. If a column is missing, apply the latest database migrations.
        </p>
      )}

      <ReviewTabs
        basePath="/admin/no-pros"
        current={tab}
        tabs={[
          { value: 'open', label: 'Open', count: open.length },
          { value: 'resolved', label: 'Resolved', count: resolved.length },
        ]}
      />

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className={TH}>Closed</th>
                <th className={TH}>Reason</th>
                <th className={TH}>Customer</th>
                <th className={TH}>Booking</th>
                <th className={TH}>Pros asked</th>
                <th className={TH}>Refund</th>
                <th className={TH}>Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r) => {
                const customer = profileById.get(r.user_id)
                const place = [customer?.city, customer?.state].filter(Boolean).join(', ')
                return (
                  <tr key={r.id} className="align-top">
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{formatDateTime(r.updated_at)}</td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-700 whitespace-nowrap">
                      {REASON_LABELS[r.cancelled_reason ?? ''] ?? r.cancelled_reason}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{fullName(customer)}</div>
                      <div className="text-xs text-slate-400">{customer?.email}</div>
                      {customer?.phone && <div className="text-xs text-slate-400">{customer.phone}</div>}
                      {place && <div className="text-xs text-slate-400">{place}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      <div>
                        {r.scheduled_date ?? '—'} {r.scheduled_time ? r.scheduled_time.slice(0, 5) : ''}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">{r.id.slice(0, 8)}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{prosAsked.get(r.id) ?? 1}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      <div>{refundLabel(r)}</div>
                      {r.total_customer_charge != null && <div className="text-slate-400">of ${r.total_customer_charge.toFixed(2)}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <ReviewForm
                        key={`${r.id}-${r.cancellation_resolved_at ?? ''}`}
                        action={saveCancellationReviewAction.bind(null, r.id)}
                        label={`the request from ${fullName(customer)}`}
                        resolved={!!r.cancellation_resolved_at}
                        note={r.cancellation_admin_note ?? ''}
                      />
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">
                    {tab === 'open' ? 'No open requests.' : 'No resolved requests yet.'}
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
