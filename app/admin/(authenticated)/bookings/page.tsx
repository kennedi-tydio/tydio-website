import { createAdminClient } from '@/lib/supabase/admin'
import { ADMIN_REFUND_LABELS, isAwaitingReplacements } from '@/lib/bookingRequestGroups'
import { lateCancelRefund } from '@/lib/pricingRules'
import CancelBookingButton, { type RefundOption } from './CancelBookingButton'

const TH = 'px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide'

function fullName(p: { first_name: string | null; last_name: string | null } | undefined): string {
  return [p?.first_name, p?.last_name].filter(Boolean).join(' ') || '—'
}

function statusLabel(b: { status: string | null; progress_status: string | null; cleaner_marked_complete_at: string | null; request_group_id: string | null }): string {
  if (b.status === 'pending') return b.request_group_id ? 'Request (one of several)' : 'Request'
  if (b.status === 'declined') return 'Declined, payment held'
  if (b.cleaner_marked_complete_at) return 'Marked complete'
  if (b.progress_status === 'on_the_way') return 'On the way'
  if (b.progress_status === 'arrived') return 'Arrived'
  if (b.progress_status) return 'In progress'
  return 'Scheduled'
}

function cancelScope(b: { status: string | null; request_group_id: string | null }): string {
  return b.status === 'pending' && b.request_group_id ? 'this booking and every request still out for it' : 'this booking'
}

function cancelWarning(b: { progress_status: string | null }): string {
  return b.progress_status && b.progress_status !== 'on_the_way' ? ' The cleaner has already arrived.' : ''
}

function money(value: number): string {
  return `$${value.toFixed(2)}`
}

function refundOptions(b: { stripe_payment_intent_id: string | null; total_customer_charge: number | null }): RefundOption[] {
  if (!b.stripe_payment_intent_id) return []
  const total = b.total_customer_charge ?? 0
  return [
    { value: 'full', label: `${ADMIN_REFUND_LABELS.full} (${money(total)})` },
    { value: 'minus_fee', label: ADMIN_REFUND_LABELS.minus_fee },
    { value: 'half', label: `${ADMIN_REFUND_LABELS.half} (${money(lateCancelRefund(total))})` },
    { value: 'custom', label: `${ADMIN_REFUND_LABELS.custom}…`, max: total },
    { value: 'none', label: ADMIN_REFUND_LABELS.none },
  ]
}

export default async function AdminBookingsPage() {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('bookings')
    .select('id, user_id, tidy_pro_id, status, progress_status, cleaner_marked_complete_at, request_group_id, cancelled_reason, stripe_payment_intent_id, stripe_refund_id, scheduled_date, scheduled_time, total_customer_charge')
    .in('status', ['pending', 'scheduled', 'declined'])
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true })

  // A declined request in a group is settled with the group, so only declined bookings
  // still holding the customer's payment can be canceled here.
  const rows = (data ?? []).filter((b) => b.status !== 'declined' || (isAwaitingReplacements(b) && !b.stripe_refund_id))

  const profileIds = [...new Set(rows.flatMap((r) => [r.user_id, r.tidy_pro_id]).filter((id): id is string => !!id))]
  const { data: profiles } = profileIds.length
    ? await admin.from('profiles').select('id, first_name, last_name, email').in('id', profileIds)
    : { data: [] }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Bookings</h1>
      <p className="text-sm text-slate-500 mb-6">
        Open bookings, soonest first. When you cancel, you choose the refund; the customer and cleaner are notified, and the cleaner isn&apos;t paid. A booking can&apos;t be
        canceled once the cleaner has marked it complete.
      </p>

      {error && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
          Couldn&apos;t load bookings: {error.message}
        </p>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className={TH}>Date</th>
                <th className={TH}>Customer</th>
                <th className={TH}>Cleaner</th>
                <th className={TH}>Status</th>
                <th className={TH}>Charged</th>
                <th className={TH}>Booking ID</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r) => {
                const customer = profileById.get(r.user_id)
                return (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                      {r.scheduled_date ?? '—'} {r.scheduled_time ? r.scheduled_time.slice(0, 5) : ''}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{fullName(customer)}</div>
                      <div className="text-xs text-slate-400">{customer?.email}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.tidy_pro_id ? fullName(profileById.get(r.tidy_pro_id)) : '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{statusLabel(r)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {r.total_customer_charge != null ? `$${r.total_customer_charge.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-[11px] font-mono text-slate-400">{r.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-right">
                      {!r.cleaner_marked_complete_at && (
                        <CancelBookingButton bookingId={r.id} scope={cancelScope(r)} warning={cancelWarning(r)} options={refundOptions(r)} />
                      )}
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">No open bookings.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
