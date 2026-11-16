import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { ADMIN_REFUND_LABELS, isAwaitingReplacements } from '@/lib/bookingRequestGroups'
import { halfRefund } from '@/lib/pricingRules'
import { cancelReasonLabel } from '@/lib/cancellationReasons'
import CancelBookingButton, { type RefundOption } from './CancelBookingButton'
import BookingAdminControls from './BookingAdminControls'
import { upchargeBlockedReason } from '@/lib/bookingUpcharges'

const TH = 'px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide'

function fullName(p: { first_name: string | null; last_name: string | null } | undefined): string {
  return [p?.first_name, p?.last_name].filter(Boolean).join(' ') || '—'
}

function statusLabel(b: { status: string | null; progress_status: string | null; cleaner_marked_complete_at: string | null; request_group_id: string | null; suspended_for_upcharge_at: string | null; suspended_for_payment_at?: string | null; payment_failed_at?: string | null; payment_due_at?: string | null }): string {
  if (b.suspended_for_upcharge_at) return 'Suspended, upcharge unpaid'
  if (b.status === 'scheduled' && b.suspended_for_payment_at) return 'Suspended, recurring visit unpaid'
  if (b.status === 'scheduled' && b.payment_failed_at && b.payment_due_at) return 'Recurring visit, payment failed'
  if (b.status === 'scheduled' && b.payment_due_at) return 'Recurring visit, not charged yet'
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
    { value: 'half', label: `${ADMIN_REFUND_LABELS.half} (${money(halfRefund(total))})` },
    { value: 'custom', label: `${ADMIN_REFUND_LABELS.custom}…`, max: total },
    { value: 'none', label: ADMIN_REFUND_LABELS.none },
  ]
}

type Admin = ReturnType<typeof createAdminClient>

const DAY_MS = 24 * 60 * 60 * 1000
const ACCEPTED_PERIODS = [
  { key: 'allTime', label: 'All time' },
  { key: 'ytd', label: 'Year to date' },
  { key: 'days30', label: 'Past 30 days' },
  { key: 'days7', label: 'Past 7 days' },
] as const
type AcceptedCounts = Record<(typeof ACCEPTED_PERIODS)[number]['key'], number>

// Every booking a Tidy Pro accepted, paged since PostgREST returns at most 1000 rows a
// call. A booking keeps decision_status 'accepted' even if it was later canceled. There's
// no accepted-at time, so each is dated by when the request came in; cleaners answer
// within hours, so that's close enough for these windows.
async function getAcceptedBookings(admin: Admin): Promise<{ rows: { tidy_pro_id: string; created_at: string }[]; error: string | null }> {
  const rows: { tidy_pro_id: string; created_at: string }[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from('bookings')
      .select('tidy_pro_id, created_at')
      .eq('decision_status', 'accepted')
      .not('tidy_pro_id', 'is', null)
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) return { rows, error: error.message }
    for (const r of data ?? []) if (r.tidy_pro_id) rows.push({ tidy_pro_id: r.tidy_pro_id, created_at: r.created_at })
    if (!data || data.length < PAGE) return { rows, error: null }
  }
}

// Jan 1 at midnight in Eastern time, where the business runs.
function startOfYearEastern(now: Date): number {
  const year = Number(now.toLocaleString('en-US', { year: 'numeric', timeZone: 'America/New_York' }))
  return new Date(`${year}-01-01T00:00:00-05:00`).getTime()
}

export default async function AdminBookingsPage() {
  const admin = createAdminClient()

  const now = new Date()
  const since = { ytd: startOfYearEastern(now), days30: now.getTime() - 30 * DAY_MS, days7: now.getTime() - 7 * DAY_MS }
  const [{ data: pros }, accepted] = await Promise.all([
    admin.from('profiles').select('id, first_name, last_name, email').eq('role', 'TIDYPRO'),
    getAcceptedBookings(admin),
  ])
  const acceptedByPro = new Map<string, AcceptedCounts>((pros ?? []).map((p) => [p.id, { allTime: 0, ytd: 0, days30: 0, days7: 0 }]))
  for (const r of accepted.rows) {
    const counts = acceptedByPro.get(r.tidy_pro_id)
    if (!counts) continue
    const at = new Date(r.created_at).getTime()
    counts.allTime++
    if (at >= since.ytd) counts.ytd++
    if (at >= since.days30) counts.days30++
    if (at >= since.days7) counts.days7++
  }
  const cleanerRows = (pros ?? [])
    .map((p) => ({ profile: p, counts: acceptedByPro.get(p.id)! }))
    .sort((a, b) => b.counts.allTime - a.counts.allTime || b.counts.days30 - a.counts.days30 || fullName(a.profile).localeCompare(fullName(b.profile)))

  const { data, error } = await admin
    .from('bookings')
    .select('id, user_id, tidy_pro_id, status, progress_status, cleaner_marked_complete_at, request_group_id, cancelled_reason, cancellation_reason, cancellation_note, stripe_payment_intent_id, stripe_refund_id, scheduled_date, scheduled_time, total_customer_charge, estimated_duration_minutes, notes, entry_instructions, suspended_for_upcharge_at, suspended_for_payment_at, payment_failed_at, payment_due_at')
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

  const { data: upcharges } = rows.length
    ? await admin
        .from('booking_upcharges')
        .select('id, booking_id, amount, cleaner_pay, reason, status, customer_charge, created_at')
        .in('booking_id', rows.map((r) => r.id))
        .in('status', ['pending', 'paid'])
        .order('created_at', { ascending: true })
    : { data: [] }
  const upchargesByBooking = new Map<string, NonNullable<typeof upcharges>>()
  for (const u of upcharges ?? []) upchargesByBooking.set(u.booking_id, [...(upchargesByBooking.get(u.booking_id) ?? []), u])

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Bookings</h1>
      <p className="text-sm text-slate-500 mb-6">
        Open bookings, soonest first. When you cancel, you choose the refund; the customer and cleaner are notified, and the cleaner isn&apos;t paid. A booking can&apos;t be
        canceled once the cleaner has marked it complete. Edit changes the time or notes and tells both of them. An upcharge suspends an accepted booking until the
        customer pays it in the app. Once paid it&apos;s added to the booking&apos;s total and the Tidy Pro&apos;s pay, so Charged and every refund below cover it.
      </p>

      <h2 className="text-sm font-semibold text-slate-700 mb-1">Bookings accepted by Tidy Pro</h2>
      <p className="text-xs text-slate-500 mb-2">
        Every booking request each Tidy Pro accepted, including ones canceled afterward, dated by when the request came in. Year to date starts Jan 1, Eastern time.
      </p>
      {accepted.error && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
          Couldn&apos;t load accepted bookings: {accepted.error}
        </p>
      )}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-8">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className={TH}>Tidy Pro</th>
                {ACCEPTED_PERIODS.map((period) => (
                  <th key={period.key} className={`${TH} text-right`}>
                    {period.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {cleanerRows.map(({ profile, counts }) => (
                <tr key={profile.id}>
                  <td className="px-4 py-3 text-slate-600">
                    <Link href={`/admin/tidy-pros/${profile.id}`} className="hover:underline">
                      {fullName(profile)}
                    </Link>
                    <div className="text-xs text-slate-400">{profile.email}</div>
                  </td>
                  {ACCEPTED_PERIODS.map((period) => (
                    <td key={period.key} className={`px-4 py-3 text-right tabular-nums ${counts[period.key] ? 'text-slate-700' : 'text-slate-300'}`}>
                      {counts[period.key]}
                    </td>
                  ))}
                </tr>
              ))}
              {cleanerRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                    No Tidy Pros yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="text-sm font-semibold text-slate-700 mb-2">Open bookings</h2>
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
                    <td className="px-4 py-3 text-xs text-slate-500">
                      <div className="whitespace-nowrap">{statusLabel(r)}</div>
                      {r.cancellation_reason && <div className="text-slate-400 mt-0.5">Reason: {cancelReasonLabel(r.cancellation_reason)}</div>}
                      {r.cancellation_note && <div className="text-slate-400 italic mt-0.5 max-w-xs">“{r.cancellation_note}”</div>}
                      {(upchargesByBooking.get(r.id) ?? []).map((u) => (
                        <div key={u.id} className={`mt-0.5 max-w-xs ${u.status === 'pending' ? 'text-amber-700' : 'text-slate-400'}`}>
                          Upcharge {money(Number(u.amount))} {u.status === 'pending' ? 'unpaid' : `paid (${money(Number(u.customer_charge ?? u.amount))} with fee)`}, Tidy Pro gets{' '}
                          {money(Number(u.cleaner_pay))}: <span className="italic">“{u.reason}”</span>
                        </div>
                      ))}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {r.total_customer_charge != null ? `$${r.total_customer_charge.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-[11px] font-mono text-slate-400">{r.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-right">
                      {!r.cleaner_marked_complete_at && (
                        <div className="inline-flex flex-col items-end gap-2">
                          {!(r.status === 'pending' && r.request_group_id) && r.status !== 'declined' && (
                            <BookingAdminControls
                              booking={{
                                id: r.id,
                                date: r.scheduled_date,
                                time: r.scheduled_time,
                                durationMinutes: r.estimated_duration_minutes,
                                notes: r.notes,
                                entryInstructions: r.entry_instructions,
                                canChangeTime: r.progress_status == null,
                                canUpcharge: upchargeBlockedReason(r) == null,
                                pendingUpcharge: (() => {
                                  const pending = upchargesByBooking.get(r.id)?.find((u) => u.status === 'pending')
                                  return pending ? { id: pending.id, amount: Number(pending.amount) } : null
                                })(),
                              }}
                            />
                          )}
                          <CancelBookingButton bookingId={r.id} scope={cancelScope(r)} warning={cancelWarning(r)} options={refundOptions(r)} />
                        </div>
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
