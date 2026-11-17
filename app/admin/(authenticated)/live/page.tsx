import { createAdminClient } from '@/lib/supabase/admin'
import { serviceAddressText } from '@/lib/bookingIncidentEmail'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import { COMPLETED_VISIBLE_HOURS, LIVE_STAGES, liveCard, type LiveCard, type LiveStage } from '@/lib/liveBoard'
import AutoRefresh from './AutoRefresh'

const REFRESH_SECONDS = 30
const DAY_MS = 24 * 60 * 60 * 1000

function fullName(p: { first_name: string | null; last_name: string | null } | undefined): string {
  return [p?.first_name, p?.last_name].filter(Boolean).join(' ') || '—'
}

function timeIn(date: Date | string, timeZone: string | null): string {
  return new Date(date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timeZone ?? 'America/New_York', timeZoneName: 'short' })
}

function lateText(minutes: number): string {
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} hr ${m} min ago` : `${h} hr ago`
}

export default async function AdminLiveBoardPage() {
  const admin = createAdminClient()
  const now = new Date()
  // Wide enough to cover every time zone; liveCard narrows it to what's live right now.
  const fromDate = new Date(now.getTime() - 2 * DAY_MS).toISOString().slice(0, 10)
  const toDate = new Date(now.getTime() + 2 * DAY_MS).toISOString().slice(0, 10)
  const columns =
    'id, user_id, tidy_pro_id, status, progress_status, scheduled_date, scheduled_time, time_zone, estimated_duration_minutes, scheduled_location, arrived_at, cleaner_marked_complete_at, suspended_for_upcharge_at, suspended_for_payment_at, incident_type'

  const [scheduled, completed] = await Promise.all([
    admin.from('bookings').select(columns).eq('status', 'scheduled').gte('scheduled_date', fromDate).lte('scheduled_date', toDate),
    admin
      .from('bookings')
      .select(columns)
      .eq('status', 'completed')
      .gte('cleaner_marked_complete_at', new Date(now.getTime() - COMPLETED_VISIBLE_HOURS * 60 * 60 * 1000).toISOString()),
  ])
  const loadError = scheduled.error?.message ?? completed.error?.message ?? null

  const cards = [...(scheduled.data ?? []), ...(completed.data ?? [])]
    .map((b) => ({ booking: b, card: liveCard(b, now) }))
    .filter((c): c is { booking: (typeof c)['booking']; card: LiveCard } => c.card != null)
    // Late ones first, then soonest start.
    .sort((a, b) => Number(a.card.onTrack) - Number(b.card.onTrack) || (a.card.startsAt?.getTime() ?? 0) - (b.card.startsAt?.getTime() ?? 0))

  const profileIds = [...new Set(cards.flatMap(({ booking }) => [booking.user_id, booking.tidy_pro_id]).filter((id): id is string => !!id))]
  const [{ data: profiles }, { data: proPhones }] = await Promise.all([
    profileIds.length ? admin.from('profiles').select('id, first_name, last_name, phone').in('id', profileIds) : Promise.resolve({ data: [] }),
    profileIds.length ? admin.from('tidypro_profiles').select('id, phone').in('id', profileIds) : Promise.resolve({ data: [] }),
  ])
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))
  const proPhoneById = new Map((proPhones ?? []).map((p) => [p.id, p.phone]))

  const byStage = new Map<LiveStage, typeof cards>(LIVE_STAGES.map((s) => [s.key, []]))
  for (const c of cards) byStage.get(c.card.stage)!.push(c)
  const lateCount = cards.filter((c) => !c.card.onTrack).length

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <h1 className="text-2xl font-bold text-slate-900">Live Board</h1>
        <AutoRefresh seconds={REFRESH_SECONDS} renderedAt={now.toISOString()} />
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Every booking being worked right now. A booking joins On the way an hour before it starts and moves across as the Tidy Pro taps through each step. Green is on
        track. Red means it has started and the Tidy Pro still hasn&apos;t tapped &ldquo;I&apos;ve arrived&rdquo;. Completed bookings stay for {COMPLETED_VISIBLE_HOURS}{' '}
        hours.
      </p>
      {lateCount > 0 && (
        <p role="alert" className="text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
          {lateCount} {lateCount === 1 ? 'Tidy Pro hasn’t' : 'Tidy Pros haven’t'} arrived by the start time.
        </p>
      )}
      {loadError && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
          Couldn&apos;t load bookings: {loadError}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        {LIVE_STAGES.map((stage) => {
          const stageCards = byStage.get(stage.key)!
          return (
            <section key={stage.key} aria-label={stage.label} className="bg-slate-100 rounded-2xl p-3 min-h-40">
              <h2 className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wide px-1 mb-3">
                {stage.label}
                <span className="rounded-full bg-white px-2 py-0.5 text-slate-600 tabular-nums">{stageCards.length}</span>
              </h2>
              <div className="space-y-3">
                {stageCards.map(({ booking: b, card }) => {
                  const customer = profileById.get(b.user_id)
                  const pro = b.tidy_pro_id ? profileById.get(b.tidy_pro_id) : undefined
                  const proPhone = (b.tidy_pro_id ? proPhoneById.get(b.tidy_pro_id) : null) ?? pro?.phone
                  const address = serviceAddressText(b.scheduled_location as ScheduledLocation | null)
                  return (
                    <article
                      key={b.id}
                      className={`rounded-xl border-l-4 bg-white p-3 shadow-sm text-sm ${card.onTrack ? 'border-green-500' : 'border-red-500 bg-red-50 ring-1 ring-red-200'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-semibold ${card.onTrack ? 'text-green-700' : 'text-red-700'}`}>{card.onTrack ? 'On track' : 'Late'}</span>
                        <span className="text-xs text-slate-500 whitespace-nowrap">
                          {card.startsAt ? `Starts ${timeIn(card.startsAt, b.time_zone)}` : 'Anytime'}
                        </span>
                      </div>
                      {!card.onTrack && card.lateMinutes != null && (
                        <p className="mt-1.5 text-xs font-semibold text-red-700">
                          Cleaner has not arrived yet. Booking started {lateText(card.lateMinutes)}
                          {card.notOnTheWayYet ? ', and they never tapped “I’m on the way”.' : '.'}
                        </p>
                      )}
                      {card.onTrack && card.notOnTheWayYet && <p className="mt-1.5 text-xs text-slate-500">Hasn&apos;t tapped &ldquo;I&apos;m on the way&rdquo; yet.</p>}
                      <dl className="mt-2 space-y-0.5 text-xs text-slate-600">
                        <div>
                          <dt className="inline text-slate-400">Tidy Pro: </dt>
                          <dd className="inline font-medium text-slate-800">{fullName(pro)}</dd>
                          {proPhone && <dd className="inline text-slate-500"> · {proPhone}</dd>}
                        </div>
                        <div>
                          <dt className="inline text-slate-400">Customer: </dt>
                          <dd className="inline">{fullName(customer)}</dd>
                          {customer?.phone && <dd className="inline text-slate-500"> · {customer.phone}</dd>}
                        </div>
                        {address && <dd className="text-slate-500">{address}</dd>}
                        {b.arrived_at && stage.key !== 'on_the_way' && <dd className="text-slate-500">Arrived {timeIn(b.arrived_at, b.time_zone)}</dd>}
                        {b.cleaner_marked_complete_at && <dd className="text-slate-500">Completed {timeIn(b.cleaner_marked_complete_at, b.time_zone)}</dd>}
                        {(b.suspended_for_upcharge_at || b.suspended_for_payment_at) && (
                          <dd className="text-amber-700 font-medium">On hold: {b.suspended_for_upcharge_at ? 'upcharge unpaid' : 'recurring visit unpaid'}</dd>
                        )}
                        {b.incident_type && <dd className="text-amber-700 font-medium">Incident reported</dd>}
                      </dl>
                      <p className="mt-2 text-[11px] font-mono text-slate-400">{b.id.slice(0, 8)}</p>
                    </article>
                  )
                })}
                {stageCards.length === 0 && <p className="px-1 py-6 text-center text-xs text-slate-400">Nothing here.</p>}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
