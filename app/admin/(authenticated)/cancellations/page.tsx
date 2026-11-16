import { createAdminClient } from '@/lib/supabase/admin'
import {
  ADMIN_CANCELLED_REASON,
  ALL_DECLINED_REASON,
  CLEANER_CANCELLED_REASON,
  CLEANER_NO_SHOW_REASON,
  LATE_CANCEL_REASON,
  NO_ACCESS_REASON,
  NO_RESPONSE_REASON,
  REQUEST_FILLED_REASON,
} from '@/lib/bookingRequestGroups'
import { cancelReasonLabel } from '@/lib/cancellationReasons'
import { oneRowPerRequest } from '@/lib/adminBookingRows'
import { saveCancellationReviewAction } from '../../actions'
import ReviewForm from '../ReviewForm'
import ReviewTabs from '../ReviewTabs'

const TH = 'px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide'

// Closed by the system rather than by a person: another Tidy Pro took the request, or
// nobody took it (those are on /admin/no-pros). Incidents (no access, no-show) have their own tab.
const NOT_A_CANCELLATION = [REQUEST_FILLED_REASON, NO_RESPONSE_REASON, ALL_DECLINED_REASON, NO_ACCESS_REASON, CLEANER_NO_SHOW_REASON]

function fullName(p: { first_name: string | null; last_name: string | null } | undefined): string {
  return [p?.first_name, p?.last_name].filter(Boolean).join(' ') || '—'
}

function canceledBy(code: string | null): string {
  if (code === CLEANER_CANCELLED_REASON) return 'Tidy Pro'
  if (code === ADMIN_CANCELLED_REASON) return 'Admin'
  if (code === LATE_CANCEL_REASON) return 'Customer (late)'
  return 'Customer'
}

function refundLabel(b: { stripe_payment_intent_id: string | null; stripe_refund_id: string | null; cancelled_reason: string | null }): string {
  if (!b.stripe_payment_intent_id) return 'Not charged'
  if (!b.stripe_refund_id) return 'No refund'
  return b.cancelled_reason === LATE_CANCEL_REASON ? 'Partial refund' : 'Refunded'
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
}

export default async function AdminCancellationsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams
  const tab = tabParam === 'resolved' ? 'resolved' : 'open'
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('bookings')
    .select(
      'id, user_id, tidy_pro_id, request_group_id, cancelled_reason, cancellation_reason, cancellation_note, cancellation_resolved_at, cancellation_admin_note, stripe_payment_intent_id, stripe_refund_id, scheduled_date, scheduled_time, total_customer_charge, updated_at'
    )
    .eq('status', 'cancelled')
    .or(`cancelled_reason.is.null,cancelled_reason.not.in.(${NOT_A_CANCELLATION.join(',')})`)
    .order('updated_at', { ascending: false })
    .limit(500)

  // Canceling a request that went out to several Tidy Pros cancels each copy; show it once.
  const all = data ?? []
  const groupIds = [...new Set(all.map((b) => b.request_group_id).filter((id): id is string => !!id))]
  const { data: groups } = groupIds.length
    ? await admin.from('booking_request_groups').select('id, original_booking_id, primary_booking_id').in('id', groupIds)
    : { data: [] }
  const cancellations = oneRowPerRequest(all, groups ?? [])
  const open = cancellations.filter((b) => !b.cancellation_resolved_at)
  const resolved = cancellations.filter((b) => b.cancellation_resolved_at)
  const rows = tab === 'open' ? open : resolved

  const profileIds = [...new Set(rows.flatMap((r) => [r.user_id, r.tidy_pro_id]).filter((id): id is string => !!id))]
  const { data: profiles } = profileIds.length
    ? await admin.from('profiles').select('id, first_name, last_name, email').in('id', profileIds)
    : { data: [] }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Cancellations</h1>
      <p className="text-sm text-slate-500 mb-6">
        Bookings canceled by a customer, a Tidy Pro, or an admin, newest first. Check one off once it&apos;s been dealt with, and keep notes
        for yourself. Requests closed automatically and no-access or no-show incidents aren&apos;t listed here.
      </p>

      {error && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
          Couldn&apos;t load cancellations: {error.message}. If a column is missing, apply the latest database migrations.
        </p>
      )}

      <ReviewTabs
        basePath="/admin/cancellations"
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
                <th className={TH}>Canceled</th>
                <th className={TH}>By</th>
                <th className={TH}>Reason</th>
                <th className={TH}>Customer</th>
                <th className={TH}>Tidy Pro</th>
                <th className={TH}>Booking</th>
                <th className={TH}>Refund</th>
                <th className={TH}>Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r) => {
                const customer = profileById.get(r.user_id)
                const reason = cancelReasonLabel(r.cancellation_reason)
                return (
                  <tr key={r.id} className="align-top">
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{formatDateTime(r.updated_at)}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{canceledBy(r.cancelled_reason)}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-64">
                      <div>{reason ?? <span className="text-slate-400">No reason given</span>}</div>
                      {r.cancellation_note && <div className="text-slate-400 mt-1 whitespace-pre-wrap">&ldquo;{r.cancellation_note}&rdquo;</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{fullName(customer)}</div>
                      <div className="text-xs text-slate-400">{customer?.email}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.tidy_pro_id ? fullName(profileById.get(r.tidy_pro_id)) : '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      <div>
                        {r.scheduled_date ?? '—'} {r.scheduled_time ? r.scheduled_time.slice(0, 5) : ''}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">{r.id.slice(0, 8)}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      <div>{refundLabel(r)}</div>
                      {r.total_customer_charge != null && <div className="text-slate-400">of ${r.total_customer_charge.toFixed(2)}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <ReviewForm
                        key={`${r.id}-${r.cancellation_resolved_at ?? ''}`}
                        action={saveCancellationReviewAction.bind(null, r.id)}
                        label={`the cancellation for ${fullName(customer)}`}
                        resolved={!!r.cancellation_resolved_at}
                        note={r.cancellation_admin_note ?? ''}
                      />
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                    {tab === 'open' ? 'No open cancellations.' : 'No resolved cancellations yet.'}
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
