import { Fragment } from 'react'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  ADMIN_CANCELLED_REASON,
  ADMIN_REFUND_LABELS,
  ALL_DECLINED_REASON,
  CLEANER_ASKED_CANCEL_REASON,
  CLEANER_CANCELLED_REASON,
  CLEANER_NO_SHOW_REASON,
  LATE_CANCEL_REASON,
  NO_ACCESS_REASON,
  NO_RESPONSE_REASON,
  REQUEST_FILLED_REASON,
  isAwaitingReplacements,
} from '@/lib/bookingRequestGroups'
import { UNPAID_VISIT_CANCELLED_REASON } from '@/lib/recurringPayments'
import { halfRefund } from '@/lib/pricingRules'
import { cancelReasonLabel } from '@/lib/cancellationReasons'
import { declineReasonLabel } from '@/lib/declineReasons'
import CancelBookingButton from './CancelBookingButton'
import { refundOptions } from './refundOptions'
import CompleteBookingButton from './CompleteBookingButton'
import PayTidyProButton from './PayTidyProButton'
import { canAdminPayNow, canHoldPayout } from '@/lib/adminPayout'
import { canAdminComplete } from '@/lib/adminBookingCompletion'
import CompletedRefundForm from './CompletedRefundForm'
import { HoldPayoutButton, RemovePayoutHoldButton } from './HoldPayoutButton'
import BookingAdminControls from './BookingAdminControls'
import BookingDetails, { type DetailPerson, type DetailPhoto, type DetailTask } from './BookingDetails'
import BookingMessages from './BookingMessages'
import RecurringSeries from '../recurring/RecurringSeries'
import { upchargeBlockedReason } from '@/lib/bookingUpcharges'
import { isSamePhone } from '@/lib/smsPhone'

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

// The Tidy Pro is at the home doing the job: arrived or cleaning, and not marked complete yet.
function isInProgress(b: { progress_status: string | null; cleaner_marked_complete_at: string | null; status: string | null }): boolean {
  return b.status === 'scheduled' && !!b.progress_status && b.progress_status !== 'on_the_way' && !b.cleaner_marked_complete_at
}

function cancelScope(b: { status: string | null; request_group_id: string | null }): string {
  return b.status === 'pending' && b.request_group_id ? 'this booking and every request still out for it' : 'this booking'
}

function cancelWarning(b: { progress_status: string | null }): string {
  return b.progress_status && b.progress_status !== 'on_the_way' ? ' The cleaner has already arrived.' : ''
}

// Who ended a canceled booking and why, from the system reason recorded on it. No
// system reason means the customer canceled it themselves.
function canceledBy(b: { cancelled_reason: string | null }): string {
  switch (b.cancelled_reason) {
    case ADMIN_CANCELLED_REASON:
      return 'Admin'
    case CLEANER_CANCELLED_REASON:
      return 'Tidy Pro'
    case LATE_CANCEL_REASON:
      return 'Customer, under 2 hours before'
    case CLEANER_ASKED_CANCEL_REASON:
      return 'Customer, Tidy Pro asked them to'
    case NO_ACCESS_REASON:
      return "Tidy Pro couldn't get in"
    case CLEANER_NO_SHOW_REASON:
      return 'Tidy Pro never arrived'
    case NO_RESPONSE_REASON:
      return 'Automatic, no Tidy Pro responded'
    case ALL_DECLINED_REASON:
      return 'Automatic, every Tidy Pro declined'
    case UNPAID_VISIT_CANCELLED_REASON:
      return 'Automatic, recurring visit unpaid'
    case null:
      return 'Customer'
    default:
      return b.cancelled_reason
  }
}

function refundLabel(b: { stripe_payment_intent_id: string | null; stripe_refund_id: string | null }): string {
  if (!b.stripe_payment_intent_id) return 'Never charged'
  return b.stripe_refund_id ? 'Refunded' : 'Not refunded'
}

// Eastern time, where the business runs.
function shortDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
}

const CANCELED_LIMIT = 200
const COMPLETED_LIMIT = 100

// Where a completed booking's Tidy Pro payout stands: sent, on hold by the admin, or not
// sent yet (no finished payout account, or a failed transfer the job will retry).
function payoutStatus(b: { payout_held_at: string | null; stripe_transfer_id: string | null; stripe_transfer_reversal_id: string | null; cleaner_pay: number | null }): string {
  if (b.stripe_transfer_id) {
    if (!b.stripe_transfer_reversal_id) return 'Sent'
    return Number(b.cleaner_pay ?? 0) > 0 ? 'Sent, part taken back' : 'Sent, all taken back'
  }
  if (b.payout_held_at) return `On hold since ${shortDateTime(b.payout_held_at)}`
  return 'Not sent yet'
}
const DECLINED_LIMIT = 200

function money(value: number): string {
  return `$${value.toFixed(2)}`
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

  const [{ data, error }, { data: canceledData, error: canceledError }, { data: declineData, error: declineError }, { data: completedData, error: completedError }] = await Promise.all([
    admin
      .from('bookings')
      // Everything, for the details panel under each row.
      .select('*')
      .in('status', ['pending', 'scheduled', 'declined'])
      .order('scheduled_date', { ascending: true })
      .order('scheduled_time', { ascending: true }),
    // Most recently canceled first. There's no canceled-at time, so updated_at stands in
    // for it. Requests closed because another Tidy Pro took the job aren't cancellations:
    // the booking went ahead with that Tidy Pro.
    admin
      .from('bookings')
      .select('*')
      .eq('status', 'cancelled')
      .or(`cancelled_reason.is.null,cancelled_reason.neq.${REQUEST_FILLED_REASON}`)
      .order('updated_at', { ascending: false })
      .limit(CANCELED_LIMIT),
    // Why Tidy Pros declined, newest first. Admins only: customers never see these.
    admin
      .from('booking_declines')
      .select('id, booking_id, tidy_pro_id, reason, note, created_at')
      .order('created_at', { ascending: false })
      .limit(DECLINED_LIMIT),
    // Most recently completed first, for refunds after a customer escalates.
    admin
      .from('bookings')
      .select('*')
      .eq('status', 'completed')
      .order('cleaner_marked_complete_at', { ascending: false, nullsFirst: false })
      .limit(COMPLETED_LIMIT),
  ])
  const declines = declineData ?? []
  const declineBookingIds = [...new Set(declines.map((d) => d.booking_id))]
  const { data: declinedBookings } = declineBookingIds.length
    ? await admin.from('bookings').select('id, user_id, scheduled_date, scheduled_time').in('id', declineBookingIds)
    : { data: [] }
  const declinedBookingById = new Map((declinedBookings ?? []).map((b) => [b.id, b]))

  // A declined request in a group is settled with the group, so only declined bookings
  // still holding the customer's payment can be canceled here.
  const rows = (data ?? []).filter((b) => b.status !== 'declined' || (isAwaitingReplacements(b) && !b.stripe_refund_id))
  const canceledRows = canceledData ?? []
  const completedRows = completedData ?? []

  const allRows = [...rows, ...canceledRows, ...completedRows]
  const profileIds = [
    ...new Set(
      [
        ...allRows.flatMap((r) => [r.user_id, r.tidy_pro_id]),
        ...declines.map((d) => d.tidy_pro_id),
        ...(declinedBookings ?? []).map((b) => b.user_id),
      ].filter((id): id is string => !!id)
    ),
  ]
  const bookingIds = allRows.map((r) => r.id)
  const [{ data: profiles }, { data: proPhones }, { data: bookingTasks }, { data: additions }, { data: cleaningPhotos }, { data: taskPhotos }] = await Promise.all([
    profileIds.length
      ? admin.from('profiles').select('id, role, first_name, last_name, email, phone, sms_phone').in('id', profileIds)
      : Promise.resolve({ data: [] }),
    profileIds.length ? admin.from('tidypro_profiles').select('id, phone').in('id', profileIds) : Promise.resolve({ data: [] }),
    bookingIds.length
      ? admin
          .from('booking_tasks')
          .select('id, booking_id, task_name, task_category, kind, is_completed, completed_at, before_photo_url, completion_photo_url')
          .in('booking_id', bookingIds)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] }),
    bookingIds.length
      ? admin
          .from('booking_task_additions')
          .select('id, booking_id, task_list, amount, cleaner_pay, customer_charge, status, apply_to_series, created_at')
          .in('booking_id', bookingIds)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] }),
    // A Standard / Deep Cleaning's photos of the whole cleaning.
    bookingIds.length
      ? admin
          .from('booking_cleaning_photos')
          .select('booking_id, kind, photo_url')
          .in('booking_id', bookingIds)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] }),
    // Entire home tasks' photos (up to 3 before and 3 after each).
    bookingIds.length
      ? admin
          .from('booking_task_photos')
          .select('booking_id, booking_task_id, kind, photo_url')
          .in('booking_id', bookingIds)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] }),
  ])
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))
  const proPhoneById = new Map((proPhones ?? []).map((p) => [p.id, p.phone]))
  // Tidy Pros are reached at their Tidy Pro profile's number. Customers can get
  // texts at a different number than their profile phone.
  function person(id: string | null): DetailPerson | undefined {
    const p = id ? profileById.get(id) : undefined
    if (!p) return undefined
    return {
      name: fullName(p),
      email: p.email,
      phone: (p.role === 'TIDYPRO' ? proPhoneById.get(p.id) : null) ?? p.phone,
      smsPhone: p.role === 'USER' && p.sms_phone && !isSamePhone(p.sms_phone, p.phone) ? p.sms_phone : null,
    }
  }
  const photosByTask = new Map<string, DetailPhoto[]>()
  for (const p of taskPhotos ?? []) photosByTask.set(p.booking_task_id, [...(photosByTask.get(p.booking_task_id) ?? []), p])
  const tasksByBooking = new Map<string, DetailTask[]>()
  for (const t of bookingTasks ?? []) {
    tasksByBooking.set(t.booking_id, [...(tasksByBooking.get(t.booking_id) ?? []), { ...t, photos: photosByTask.get(t.id) }])
  }
  const cleaningPhotosByBooking = new Map<string, DetailPhoto[]>()
  for (const p of cleaningPhotos ?? []) cleaningPhotosByBooking.set(p.booking_id, [...(cleaningPhotosByBooking.get(p.booking_id) ?? []), p])
  const additionsByBooking = new Map<string, NonNullable<typeof additions>>()
  for (const a of additions ?? []) additionsByBooking.set(a.booking_id, [...(additionsByBooking.get(a.booking_id) ?? []), a])

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

  function detailsPanel(r: (typeof allRows)[number]) {
    // Details and messages sit side by side; whichever is open takes the full width.
    return (
      <div className="flex flex-wrap gap-x-6 [&>details[open]]:basis-full">
      <details className="group">
        <summary className="cursor-pointer select-none text-xs font-semibold text-brand py-1 list-none [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">▸ Show booking details</span>
          <span className="hidden group-open:inline">▾ Hide booking details</span>
        </summary>
        <div className="mt-2">
          <BookingDetails
            booking={r}
            customer={person(r.user_id)}
            tidyPro={person(r.tidy_pro_id)}
            bookingTasks={tasksByBooking.get(r.id) ?? []}
            cleaningPhotos={cleaningPhotosByBooking.get(r.id) ?? []}
            additions={(additionsByBooking.get(r.id) ?? []).map((a) => ({
              ...a,
              amount: Number(a.amount),
              cleaner_pay: Number(a.cleaner_pay),
              customer_charge: Number(a.customer_charge),
            }))}
          />
        </div>
      </details>
      <BookingMessages
        bookingId={r.id}
        customerName={person(r.user_id)?.name ?? 'Customer'}
        tidyProName={person(r.tidy_pro_id)?.name ?? 'Tidy Pro'}
        timeZone={r.time_zone}
      />
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Bookings</h1>
      <p className="text-sm text-slate-500 mb-6">
        Open bookings, soonest first. When you cancel, you choose the refund and, for an accepted booking, what the cleaner is still paid (nothing unless you
        choose); the customer and cleaner are notified. A booking can&apos;t be canceled once the cleaner has marked it complete: refund it under Completed bookings. Open a booking&apos;s details for its address, tasks, price breakdown, and more. Edit changes the time or notes and tells both of them. An upcharge suspends an accepted booking until the
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
                const inProgress = isInProgress(r)
                return (
                  <Fragment key={r.id}>
                  <tr className={`transition-colors ${inProgress ? 'bg-green-50 hover:bg-green-100 shadow-[inset_4px_0_0_0_#22c55e]' : 'hover:bg-slate-50'}`}>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                      {r.scheduled_date ?? '—'} {r.scheduled_time ? r.scheduled_time.slice(0, 5) : ''}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{fullName(customer)}</div>
                      <div className="text-xs text-slate-400">{customer?.email}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.tidy_pro_id ? fullName(profileById.get(r.tidy_pro_id)) : '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      <div className={`whitespace-nowrap ${inProgress ? 'font-semibold text-green-700' : ''}`}>{statusLabel(r)}</div>
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
                          {canAdminComplete(r) && (
                            <CompleteBookingButton
                              bookingId={r.id}
                              // Add-ons and Tidy Tasks still without their after photo.
                              missingPhotos={
                                (tasksByBooking.get(r.id) ?? []).filter(
                                  (t) => !t.is_completed && t.kind !== 'full_service_home' && t.kind !== 'full_service_room'
                                ).length
                              }
                            />
                          )}
                          {canHoldPayout(r) && <HoldPayoutButton bookingId={r.id} />}
                          {r.payout_held_at && (
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-xs font-semibold text-amber-700">Payout on hold</span>
                              {r.payout_hold_note && <span className="text-[11px] text-slate-400 italic max-w-56 text-right">“{r.payout_hold_note}”</span>}
                              <RemovePayoutHoldButton bookingId={r.id} />
                            </div>
                          )}
                          <CancelBookingButton
                            bookingId={r.id}
                            scope={cancelScope(r)}
                            warning={cancelWarning(r)}
                            options={refundOptions(r)}
                            cleanerPay={r.status === 'scheduled' && r.tidy_pro_id ? Number(r.cleaner_pay ?? 0) : null}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                  <tr className={`!border-t-0 ${inProgress ? 'bg-green-50 shadow-[inset_4px_0_0_0_#22c55e]' : ''}`}>
                    <td colSpan={7} className="px-4 pb-3 pt-0">
                      {detailsPanel(r)}
                    </td>
                  </tr>
                  </Fragment>
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

      <h2 className="text-sm font-semibold text-slate-700 mt-8 mb-1">Completed bookings</h2>
      <p className="text-xs text-slate-500 mb-2">
        The {COMPLETED_LIMIT} most recently completed. A Tidy Pro is paid as soon as a booking completes, unless you put its payout on hold first (Hold
        payout, here or on an open booking above); a held payout shows in their Pending earnings and goes out when you press Pay Tidy Pro. Refund sets both
        what the customer gets back and what the Tidy Pro is paid, once per booking. If the payout hasn&apos;t gone out, the new payout is what&apos;s sent. If it
        has, the part you take off is reversed from their Stripe account: choose No payout to take all of it back, e.g. for a Tidy Pro who never showed up.
        Tips aren&apos;t affected.
      </p>
      {completedError && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
          Couldn&apos;t load completed bookings: {completedError.message}
        </p>
      )}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className={TH}>Completed</th>
                <th className={TH}>Customer</th>
                <th className={TH}>Cleaner</th>
                <th className={TH}>Charged</th>
                <th className={TH}>Tidy Pro payout</th>
                <th className={TH}>Refund</th>
                <th className={TH}>Booking ID</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {completedRows.map((r) => {
                const customer = profileById.get(r.user_id)
                const pay = Number(r.cleaner_pay ?? 0)
                return (
                  <Fragment key={r.id}>
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                        {r.cleaner_marked_complete_at ? shortDateTime(r.cleaner_marked_complete_at) : r.scheduled_date ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <div>{fullName(customer)}</div>
                        <div className="text-xs text-slate-400">{customer?.email}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{r.tidy_pro_id ? fullName(profileById.get(r.tidy_pro_id)) : '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{r.total_customer_charge != null ? money(r.total_customer_charge) : '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        <div className="whitespace-nowrap">{money(pay)}</div>
                        <div className={`mt-0.5 whitespace-nowrap ${r.payout_held_at ? 'font-semibold text-amber-700' : 'text-slate-400'}`}>{payoutStatus(r)}</div>
                        {r.payout_hold_note && <div className="text-slate-400 italic mt-0.5 max-w-48">“{r.payout_hold_note}”</div>}
                        {r.payout_adjusted_at && <div className="text-slate-400 mt-0.5 whitespace-nowrap">Set by admin {shortDateTime(r.payout_adjusted_at)}</div>}
                        {canAdminPayNow(r) && (
                          <div className="mt-1.5">
                            <PayTidyProButton bookingId={r.id} amount={pay} held={!!r.payout_held_at} />
                          </div>
                        )}
                        {canHoldPayout(r) && (
                          <div className="mt-1.5">
                            <HoldPayoutButton bookingId={r.id} />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{refundLabel(r)}</td>
                      <td className="px-4 py-3 text-[11px] font-mono text-slate-400">{r.id.slice(0, 8)}</td>
                      <td className="px-4 py-3 text-right">
                        {!r.payout_adjusted_at && !r.stripe_refund_id && (
                          <CompletedRefundForm bookingId={r.id} options={refundOptions(r)} cleanerPay={pay} payoutSent={!!r.stripe_transfer_id} />
                        )}
                      </td>
                    </tr>
                    <tr className="!border-t-0">
                      <td colSpan={8} className="px-4 pb-3 pt-0">
                        {detailsPanel(r)}
                      </td>
                    </tr>
                  </Fragment>
                )
              })}
              {completedRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">No completed bookings yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="text-sm font-semibold text-slate-700 mt-8 mb-1">Recurring bookings</h2>
      <p className="text-xs text-slate-500 mb-2">
        Active recurring series. Each visit is booked a week ahead and shows in Open bookings above once it is. Canceled series are on the{' '}
        <Link href="/admin/recurring" className="text-brand hover:underline">
          Recurring
        </Link>{' '}
        page.
      </p>
      <RecurringSeries withCancelled={false} />

      <h2 className="text-sm font-semibold text-slate-700 mt-8 mb-1">Declined requests</h2>
      <p className="text-xs text-slate-500 mb-2">
        The {DECLINED_LIMIT} most recent, newest first, with the reason the Tidy Pro chose. Only admins see these; the customer is never shown the reason.
      </p>
      {declineError && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
          Couldn&apos;t load declined requests: {declineError.message}
        </p>
      )}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className={TH}>Declined</th>
                <th className={TH}>Was requested for</th>
                <th className={TH}>Tidy Pro</th>
                <th className={TH}>Customer</th>
                <th className={TH}>Reason</th>
                <th className={TH}>Booking ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {declines.map((d) => {
                const booking = declinedBookingById.get(d.booking_id)
                const customer = booking ? profileById.get(booking.user_id) : undefined
                const pro = profileById.get(d.tidy_pro_id)
                return (
                  <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{shortDateTime(d.created_at)}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                      {booking?.scheduled_date ?? '—'} {booking?.scheduled_time ? booking.scheduled_time.slice(0, 5) : ''}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <Link href={`/admin/tidy-pros/${d.tidy_pro_id}`} className="hover:underline">
                        {fullName(pro)}
                      </Link>
                      <div className="text-xs text-slate-400">{pro?.email}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{fullName(customer)}</div>
                      <div className="text-xs text-slate-400">{customer?.email}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <div>{declineReasonLabel(d.reason)}</div>
                      {d.note && <div className="text-slate-400 italic mt-0.5 max-w-xs">“{d.note}”</div>}
                    </td>
                    <td className="px-4 py-3 text-[11px] font-mono text-slate-400">{d.booking_id.slice(0, 8)}</td>
                  </tr>
                )
              })}
              {declines.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">No declined requests yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="text-sm font-semibold text-slate-700 mt-8 mb-1">Canceled bookings</h2>
      <p className="text-xs text-slate-500 mb-2">
        The {CANCELED_LIMIT} most recent, newest first. Canceled is when the booking was last updated, which is usually when it was canceled. Requests closed because
        another Tidy Pro took the job aren&apos;t listed.
      </p>
      {canceledError && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
          Couldn&apos;t load canceled bookings: {canceledError.message}
        </p>
      )}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className={TH}>Canceled</th>
                <th className={TH}>Was booked for</th>
                <th className={TH}>Customer</th>
                <th className={TH}>Cleaner</th>
                <th className={TH}>Canceled by</th>
                <th className={TH}>Charged</th>
                <th className={TH}>Refund</th>
                <th className={TH}>Booking ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {canceledRows.map((r) => {
                const customer = profileById.get(r.user_id)
                return (
                  <Fragment key={r.id}>
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{shortDateTime(r.updated_at)}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                        {r.scheduled_date ?? '—'} {r.scheduled_time ? r.scheduled_time.slice(0, 5) : ''}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <div>{fullName(customer)}</div>
                        <div className="text-xs text-slate-400">{customer?.email}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{r.tidy_pro_id ? fullName(profileById.get(r.tidy_pro_id)) : '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        <div className="whitespace-nowrap">{canceledBy(r)}</div>
                        {r.cancellation_reason && <div className="text-slate-400 mt-0.5">Reason: {cancelReasonLabel(r.cancellation_reason)}</div>}
                        {r.cancellation_note && <div className="text-slate-400 italic mt-0.5 max-w-xs">“{r.cancellation_note}”</div>}
                        {r.cancellation_admin_note && <div className="text-slate-400 mt-0.5 max-w-xs">Admin note: {r.cancellation_admin_note}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{r.total_customer_charge != null ? money(r.total_customer_charge) : '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{refundLabel(r)}</td>
                      <td className="px-4 py-3 text-[11px] font-mono text-slate-400">{r.id.slice(0, 8)}</td>
                    </tr>
                    <tr className="!border-t-0">
                      <td colSpan={8} className="px-4 pb-3 pt-0">
                        {detailsPanel(r)}
                      </td>
                    </tr>
                  </Fragment>
                )
              })}
              {canceledRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">No canceled bookings.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
