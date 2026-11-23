import { Fragment } from 'react'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import { serviceAddressText } from '@/lib/bookingIncidentEmail'
import { DEFAULT_BOOKING_TIME_ZONE, isValidTimeZone, todayInZone } from '@/lib/bookingTime'
import { isRecurrenceFrequency, occurrenceLabel, recurrenceScheduleLabel } from '@/lib/recurrence'
import { OCCURRENCES_SHOWN, unbookedOccurrenceDates } from '@/lib/recurringOccurrences'
import CancelBookingButton from '../bookings/CancelBookingButton'
import { refundOptions } from '../bookings/refundOptions'
import CancelSeriesButton from './CancelSeriesButton'
import SkipVisitButton from './SkipVisitButton'

// Every recurring series: who, when it repeats, which Tidy Pro, the next visits it will
// book, and every visit it has booked so far. A series books each visit a week ahead
// (/api/cron/recurring-bookings), so its booked visits also show on the Bookings tab.

const TH = 'px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide'
const CANCELLED_LIMIT = 200
const UPCOMING_SHOWN = 3

type Admin = ReturnType<typeof createAdminClient>

type Visit = {
  id: string
  recurring_booking_id: string | null
  scheduled_date: string | null
  scheduled_time: string | null
  status: string | null
  decision_status: string | null
  progress_status: string | null
  cleaner_marked_complete_at: string | null
  payment_due_at: string | null
  payment_failed_at: string | null
  suspended_for_payment_at: string | null
  stripe_payment_intent_id: string | null
  total_customer_charge: number | null
  cleaner_pay: number | null
  tidy_pro_id: string | null
}

function fullName(p: { first_name: string | null; last_name: string | null } | undefined): string {
  return [p?.first_name, p?.last_name].filter(Boolean).join(' ') || '—'
}

function money(value: number): string {
  return `$${value.toFixed(2)}`
}

// Eastern time, where the business runs.
function shortDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
}

function taskNames(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((t) => t && typeof t.name === 'string').map((t) => t.name as string) : []
}

function visitStatus(v: Visit): string {
  if (v.status === 'cancelled') return 'Canceled'
  if (v.status === 'completed') return 'Completed'
  if (v.status === 'declined') return 'Declined'
  if (v.status === 'pending') return 'Request, awaiting Tidy Pro'
  if (v.suspended_for_payment_at) return 'On hold, unpaid'
  if (v.payment_failed_at && v.payment_due_at) return 'Payment failed'
  if (v.payment_due_at && !v.stripe_payment_intent_id) return 'Not charged yet'
  if (v.cleaner_marked_complete_at) return 'Marked complete'
  if (v.progress_status) return 'In progress'
  return 'Scheduled'
}

function visitStatusClass(v: Visit): string {
  if (v.status === 'cancelled' || v.status === 'declined') return 'text-slate-400'
  if (v.status === 'completed' || v.cleaner_marked_complete_at) return 'text-green-700'
  if (v.suspended_for_payment_at || v.payment_failed_at) return 'text-amber-700'
  return 'text-slate-600'
}

// Every visit of every series, paged since PostgREST returns at most 1000 rows a call.
async function getVisits(admin: Admin): Promise<{ rows: Visit[]; error: string | null }> {
  const rows: Visit[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from('bookings')
      .select(
        'id, recurring_booking_id, scheduled_date, scheduled_time, status, decision_status, progress_status, cleaner_marked_complete_at, payment_due_at, payment_failed_at, suspended_for_payment_at, stripe_payment_intent_id, total_customer_charge, cleaner_pay, tidy_pro_id'
      )
      .not('recurring_booking_id', 'is', null)
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) return { rows, error: error.message }
    rows.push(...((data ?? []) as Visit[]))
    if (!data || data.length < PAGE) return { rows, error: null }
  }
}

// The recurring series tables, shared by /admin/recurring and the Bookings tab.
// `withCancelled` adds the canceled series below the active ones.
export default async function RecurringSeries({ withCancelled = true }: { withCancelled?: boolean }) {
  const admin = createAdminClient()

  const [{ data: activeData, error: activeError }, { data: cancelledData, error: cancelledError }, visits] = await Promise.all([
    admin.from('recurring_bookings').select('*').eq('status', 'active').order('next_date', { ascending: true }),
    admin.from('recurring_bookings').select('*').eq('status', 'cancelled').order('cancelled_at', { ascending: false, nullsFirst: false }).limit(CANCELLED_LIMIT),
    getVisits(admin),
  ])
  const active = activeData ?? []
  const cancelled = cancelledData ?? []
  const allSeries = [...active, ...cancelled]

  const visitsBySeries = new Map<string, Visit[]>()
  for (const v of visits.rows) {
    if (!v.recurring_booking_id) continue
    visitsBySeries.set(v.recurring_booking_id, [...(visitsBySeries.get(v.recurring_booking_id) ?? []), v])
  }
  for (const list of visitsBySeries.values()) {
    list.sort((a, b) => `${a.scheduled_date ?? ''} ${a.scheduled_time ?? ''}`.localeCompare(`${b.scheduled_date ?? ''} ${b.scheduled_time ?? ''}`))
  }

  const profileIds = [
    ...new Set([...allSeries.flatMap((s) => [s.user_id, s.tidy_pro_id]), ...visits.rows.map((v) => v.tidy_pro_id)].filter((id): id is string => !!id)),
  ]
  const { data: profiles } = profileIds.length
    ? await admin.from('profiles').select('id, first_name, last_name, email').in('id', profileIds)
    : { data: [] }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  const needsAttention = active.filter((s) => s.last_error || !s.tidy_pro_id).length
  const awaitingAcceptance = active.filter((s) => s.tidy_pro_id && !s.tidy_pro_accepted_at).length

  function seriesRows(s: (typeof allSeries)[number], isActive: boolean) {
    const customer = profileById.get(s.user_id)
    const pro = s.tidy_pro_id ? profileById.get(s.tidy_pro_id) : undefined
    const seriesVisits = visitsBySeries.get(s.id) ?? []
    const timeZone = isValidTimeZone(s.time_zone) ? s.time_zone : DEFAULT_BOOKING_TIME_ZONE
    const today = todayInZone(timeZone)
    const frequency = s.frequency
    const schedule = isRecurrenceFrequency(frequency) ? recurrenceScheduleLabel(frequency, s.start_date, s.scheduled_time) : frequency
    const time = s.scheduled_time.slice(0, 5)

    const bookedUpcoming = seriesVisits.filter((v) => v.scheduled_date && v.scheduled_date >= today && (v.status === 'pending' || v.status === 'scheduled'))
    const later = isActive && isRecurrenceFrequency(frequency) ? unbookedOccurrenceDates(frequency, s.next_date, s.skipped_dates ?? [], UPCOMING_SHOWN) : []
    const upcoming = [
      ...bookedUpcoming.map((v) => ({ key: v.id, label: occurrenceLabel(v.scheduled_date!, (v.scheduled_time ?? time).slice(0, 5)), note: visitStatus(v) })),
      ...later.map((date) => ({ key: date, label: occurrenceLabel(date, time), note: 'Not booked yet' })),
    ].slice(0, UPCOMING_SHOWN)

    const completed = seriesVisits.filter((v) => v.status === 'completed').length
    const cancelledVisits = seriesVisits.filter((v) => v.status === 'cancelled').length
    const lastPriced = [...seriesVisits].reverse().find((v) => v.total_customer_charge != null && v.status !== 'cancelled')
    const tasks = taskNames(s.task_list)
    const skippedUpcoming = (s.skipped_dates ?? []).filter((d) => d >= today)

    // What can still be canceled: booked visits that haven't started (each with its own
    // refund, as on the Bookings tab), then dates not booked yet (skipped, nothing to refund).
    const cancellableVisits = isActive ? bookedUpcoming.filter((v) => !v.progress_status && !v.cleaner_marked_complete_at) : []
    const paidVisits = cancellableVisits.filter((v) => v.stripe_payment_intent_id).length
    const cancellableDates = isActive && isRecurrenceFrequency(frequency) ? unbookedOccurrenceDates(frequency, s.next_date, s.skipped_dates ?? [], OCCURRENCES_SHOWN) : []

    return (
      <Fragment key={s.id}>
        <tr id={`series-${s.id}`} className="hover:bg-slate-50 transition-colors align-top scroll-mt-4 target:bg-amber-50">
          <td className="px-4 py-3 text-slate-600">
            <div>{fullName(customer)}</div>
            <div className="text-xs text-slate-400">{customer?.email}</div>
          </td>
          <td className="px-4 py-3 text-slate-600">
            {s.tidy_pro_id ? (
              <Link href={`/admin/tidy-pros/${s.tidy_pro_id}`} className="hover:underline">
                {pro ? fullName(pro) : (s.tidy_pro_name ?? '—')}
              </Link>
            ) : (
              <span className="text-amber-700 text-xs font-medium">No Tidy Pro</span>
            )}
            {s.tidy_pro_id && (
              <div className={`text-xs mt-0.5 ${s.tidy_pro_accepted_at ? 'text-slate-400' : 'text-amber-700'}`}>
                {s.tidy_pro_accepted_at ? `Accepted ${shortDateTime(s.tidy_pro_accepted_at)}` : 'Hasn’t accepted the series yet'}
              </div>
            )}
          </td>
          <td className="px-4 py-3 text-xs text-slate-600">
            <div className="whitespace-nowrap font-medium">{schedule}</div>
            <div className="text-slate-400 mt-0.5">Started {s.start_date}</div>
            {s.full_service != null && <div className="text-slate-400 mt-0.5">Full-service cleaning</div>}
          </td>
          <td className="px-4 py-3 text-xs text-slate-600">
            {isActive ? (
              upcoming.length ? (
                <ul className="space-y-0.5">
                  {upcoming.map((u) => (
                    <li key={u.key} className="whitespace-nowrap">
                      {u.label} <span className="text-slate-400">· {u.note}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                '—'
              )
            ) : (
              <span className="text-slate-400">Canceled {s.cancelled_at ? shortDateTime(s.cancelled_at) : ''}</span>
            )}
            {isActive && s.last_error && <div className="text-red-600 mt-1 max-w-xs">Last visit couldn’t be booked: {s.last_error}</div>}
          </td>
          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
            <div>{seriesVisits.length} booked</div>
            <div className="text-slate-400">
              {completed} done · {cancelledVisits} canceled
            </div>
          </td>
          <td className="px-4 py-3 text-xs text-slate-500">{lastPriced?.total_customer_charge != null ? money(lastPriced.total_customer_charge) : '—'}</td>
          <td className="px-4 py-3 text-[11px] font-mono text-slate-400">{s.id.slice(0, 8)}</td>
          <td className="px-4 py-3 text-right">
            {isActive && <CancelSeriesButton seriesId={s.id} bookedVisits={cancellableVisits.length} paidVisits={paidVisits} />}
          </td>
        </tr>
        <tr className="!border-t-0">
          <td colSpan={8} className="px-4 pb-3 pt-0">
            <details className="group">
              <summary className="cursor-pointer select-none text-xs font-semibold text-brand py-1 list-none [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">▸ Show series details and visits</span>
                <span className="hidden group-open:inline">▾ Hide series details and visits</span>
              </summary>
              <div className="mt-2 grid gap-4 md:grid-cols-2 text-xs">
                <dl className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                  {[
                    ['Service address', serviceAddressText(s.scheduled_location as ScheduledLocation | null)],
                    ['Time zone', s.time_zone],
                    ['Next visit to book', isActive ? s.next_date : null],
                    ['Skipped dates', skippedUpcoming.length ? skippedUpcoming.join(', ') : null],
                    ['Tasks', tasks.length ? tasks.join(', ') : null],
                    ['Supplies', s.will_provide_supplies ? 'Customer provides supplies' : 'Tidy Pro brings supplies'],
                    ['Notes', s.notes],
                    ['Directions & entry', s.entry_instructions],
                    ['Card on file', s.payment_method_id ? 'Yes' : 'None, visits can’t be charged'],
                    ['Created', shortDateTime(s.created_at)],
                    ['Series ID', s.id],
                  ]
                    .filter(([, value]) => value != null && value !== '')
                    .map(([label, value]) => (
                      <div key={label} className="flex gap-3 py-1">
                        <dt className="w-36 shrink-0 text-slate-400">{label}</dt>
                        <dd className="min-w-0 text-slate-700 whitespace-pre-wrap break-words">{value}</dd>
                      </div>
                    ))}
                </dl>
                <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                  <p className="font-semibold text-slate-700 mb-2">Visits booked ({seriesVisits.length})</p>
                  {seriesVisits.length ? (
                    <table className="w-full">
                      <tbody className="divide-y divide-slate-100">
                        {seriesVisits.map((v) => (
                          <tr key={v.id}>
                            <td className="py-1 pr-3 whitespace-nowrap text-slate-600">
                              {v.scheduled_date ?? '—'} {v.scheduled_time?.slice(0, 5) ?? ''}
                            </td>
                            <td className={`py-1 pr-3 ${visitStatusClass(v)}`}>{visitStatus(v)}</td>
                            <td className="py-1 pr-3 text-slate-500">{v.tidy_pro_id && v.tidy_pro_id !== s.tidy_pro_id ? fullName(profileById.get(v.tidy_pro_id)) : ''}</td>
                            <td className="py-1 pr-3 text-slate-500 text-right">{v.total_customer_charge != null ? money(v.total_customer_charge) : '—'}</td>
                            <td className="py-1 font-mono text-[11px] text-slate-400 text-right">{v.id.slice(0, 8)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-slate-400">No visits booked yet.</p>
                  )}
                </div>
                {isActive && (
                  <div className="md:col-span-2 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                    <p className="font-semibold text-slate-700 mb-1">Cancel upcoming visits</p>
                    <p className="text-slate-400 mb-2">
                      A booked visit is canceled like any booking, with the refund you choose. A visit not booked yet is skipped: it&apos;s never booked or charged. Either
                      way the rest of the series stays on, and the customer and Tidy Pro are notified.
                    </p>
                    {cancellableVisits.length + cancellableDates.length ? (
                      <table className="w-full">
                        <tbody className="divide-y divide-slate-100">
                          {cancellableVisits.map((v) => {
                            const label = occurrenceLabel(v.scheduled_date!, (v.scheduled_time ?? time).slice(0, 5))
                            return (
                              <tr key={v.id} className="align-top">
                                <td className="py-1.5 pr-3 whitespace-nowrap text-slate-600">{label}</td>
                                <td className={`py-1.5 pr-3 ${visitStatusClass(v)}`}>Booked · {visitStatus(v)}</td>
                                <td className="py-1.5 pr-3 text-slate-500">{v.total_customer_charge != null ? money(v.total_customer_charge) : '—'}</td>
                                <td className="py-1.5 text-right">
                                  <CancelBookingButton
                                    bookingId={v.id}
                                    scope={`the visit on ${label}`}
                                    warning=" The rest of the series stays on."
                                    options={refundOptions(v)}
                                    cleanerPay={v.status === 'scheduled' && v.tidy_pro_id ? Number(v.cleaner_pay ?? 0) : null}
                                  />
                                </td>
                              </tr>
                            )
                          })}
                          {cancellableDates.map((date) => {
                            const label = occurrenceLabel(date, time)
                            return (
                              <tr key={date} className="align-top">
                                <td className="py-1.5 pr-3 whitespace-nowrap text-slate-600">{label}</td>
                                <td className="py-1.5 pr-3 text-slate-400">Not booked yet</td>
                                <td className="py-1.5 pr-3 text-slate-400">—</td>
                                <td className="py-1.5 text-right">
                                  <SkipVisitButton seriesId={s.id} date={date} label={label} />
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-slate-400">No upcoming visits to cancel.</p>
                    )}
                  </div>
                )}
              </div>
            </details>
          </td>
        </tr>
      </Fragment>
    )
  }

  function seriesTable(list: typeof allSeries, isActive: boolean, empty: string) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className={TH}>Customer</th>
                <th className={TH}>Tidy Pro</th>
                <th className={TH}>Repeats</th>
                <th className={TH}>{isActive ? 'Next visits' : 'Ended'}</th>
                <th className={TH}>Visits</th>
                <th className={TH}>Per visit</th>
                <th className={TH}>Series ID</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {list.map((s) => seriesRows(s, isActive))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                    {empty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const loadError = activeError?.message ?? visits.error

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Active series', value: active.length },
          { label: 'Awaiting Tidy Pro acceptance', value: awaitingAcceptance },
          { label: 'Need attention', value: needsAttention, warn: needsAttention > 0 },
          { label: 'Canceled (recent)', value: cancelled.length },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3">
            <p className="text-xs text-slate-400">{card.label}</p>
            <p className={`text-2xl font-bold tabular-nums ${card.warn ? 'text-amber-700' : 'text-slate-900'}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <h2 className="text-sm font-semibold text-slate-700 mb-1">Active series</h2>
      <p className="text-xs text-slate-500 mb-2">Soonest next visit first. Need attention means the last visit couldn&apos;t be booked, or the series has no Tidy Pro.</p>
      {loadError && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
          Couldn&apos;t load recurring bookings: {loadError}
        </p>
      )}
      {seriesTable(active, true, 'No active recurring bookings.')}

      {withCancelled && (
        <>
          <h2 className="text-sm font-semibold text-slate-700 mt-8 mb-1">Canceled series</h2>
          <p className="text-xs text-slate-500 mb-2">The {CANCELLED_LIMIT} most recently canceled, newest first.</p>
          {cancelledError && (
            <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
              Couldn&apos;t load canceled series: {cancelledError.message}
            </p>
          )}
          {seriesTable(cancelled, false, 'No canceled recurring bookings.')}
        </>
      )}
    </div>
  )
}
