import type { Metadata } from 'next'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { ACCEPTANCE_RATE_THRESHOLD, NO_ACCEPTANCE_STATS, formatAcceptanceRate, getAllAcceptanceStats, isAcceptanceRateLow } from '@/lib/acceptanceRate'
import { backgroundCheckStage, backgroundCheckStatusLabel } from '@/lib/backgroundCheck'
import { WEEKDAY_KEYS, bookingBlockers, formatCompactTime, type WeekdayKey, type WeeklyAvailability } from '@/lib/cleanerMatching'
import { DEFAULT_BOOKING_TIME_ZONE, todayInZone } from '@/lib/bookingTime'
import { formatTimeOffRange, normalizeTimeOff, parseTimeOff } from '@/lib/timeOff'
import { withPushStatus } from '@/lib/pushRequirement'
import { TIDY_PRO_SERVICES, normalizeServices, providesServices, serviceLabels } from '@/lib/tidyProServices'
import { FavoriteStar } from '../users/FavoriteStar'
import { VerifiedToggle } from './VerifiedToggle'
import { amendmentStatuses } from '@/lib/legal/agreementAmendments'
import AmendmentStatusList from '../AmendmentStatusList'

export const metadata: Metadata = { title: 'Tidy Pros — Tydio Admin' }

const TH = 'px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide'

const STATUS_TONE: Record<string, string> = {
  approved: 'text-green-700',
  applied: 'text-amber-700',
  paused: 'text-slate-500',
}

const CHECK_TONE: Record<string, string> = {
  passed: 'text-green-700',
  failed: 'text-red-600',
  pending: 'text-amber-700',
  link_sent: 'text-amber-700',
  needs_link: 'text-red-600',
  not_started: 'text-slate-400',
}

type Filters = { search?: string; status?: string; service?: string | string[]; acceptance?: string; favorite?: string }

function fullName(p: { first_name: string | null; last_name: string | null; email: string | null }): string {
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || '—'
}

// Consent is the account's answer to the push prompt; has_push is whether any device
// is actually subscribed, so both matter.
function pushStatus(pro: { push_consent: string | null; has_push: boolean } | undefined): { label: string; tone: string } {
  if (pro?.has_push) return { label: 'Push: On', tone: 'text-green-700' }
  if (pro?.push_consent === 'declined') return { label: 'Push: Declined', tone: 'text-red-600' }
  if (pro?.push_consent === 'opted_in') return { label: 'Push: Opted in, no device', tone: 'text-amber-700' }
  return { label: 'Push: Not answered', tone: 'text-slate-400' }
}

const DAY_LABELS: Record<WeekdayKey, string> = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' }

// Only the days they work, e.g. "Mon 9am-5pm", in their own time zone.
function weeklyHours(availability: unknown): { day: string; hours: string }[] {
  const weekly = (availability as WeeklyAvailability | null) ?? {}
  return WEEKDAY_KEYS.flatMap((day) => {
    const ranges = weekly[day] ?? []
    if (ranges.length === 0) return []
    return [{ day: DAY_LABELS[day], hours: ranges.map((r) => `${formatCompactTime(r.start)}-${formatCompactTime(r.end)}`).join(', ') }]
  })
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

// Every Tidy Pro at a glance: where they work, what they offer, whether customers can
// book them, and how they're doing. Click a name for the full profile.
export default async function AdminTidyProsPage({ searchParams }: { searchParams: Promise<Filters> }) {
  const { search = '', status = '', service, acceptance = '', favorite = '' } = await searchParams
  // Each checked service arrives as its own ?service= value.
  const services = normalizeServices([service ?? []].flat())
  const admin = createAdminClient()

  const [{ data: profiles, error }, { data: tidyPros, error: tidyProsError }, acceptanceById, { data: favorites }, { data: checks }] = await Promise.all([
    admin.from('profiles').select('id, first_name, last_name, email, banned_at, zip_code').eq('role', 'TIDYPRO').order('first_name'),
    admin
      .from('tidypro_profiles')
      .select(
        'id, city, state, zip_code, travel_radius_miles, services_provided, rating, review_count, is_verified, is_insured, uses_organic_products, cleaner_status, active_for_booking, is_away, profile_photo_url, bio, availability, time_off, time_zone, stripe_onboarding_completed, latitude, longitude, push_consent'
      ),
    getAllAcceptanceStats(admin),
    admin.from('admin_favorite_tidy_pros').select('pro_id'),
    admin.from('background_checks').select('pro_id, status, requested_at, link_sent_at, submitted_at'),
  ])

  const tidyProById = new Map((await withPushStatus(admin, tidyPros ?? [])).map((t) => [t.id, t]))
  const favoriteIds = new Set((favorites ?? []).map((f) => f.pro_id))
  const checkById = new Map((checks ?? []).map((c) => [c.pro_id, c]))
  const amendmentsById = await amendmentStatuses(admin, (profiles ?? []).map((p) => p.id))

  const all = (profiles ?? []).map((p) => {
    const pro = tidyProById.get(p.id)
    const stats = acceptanceById.get(p.id) ?? NO_ACCEPTANCE_STATS
    return {
      profile: p,
      pro,
      name: fullName(p),
      // Work address ZIP if they've set one, otherwise the ZIP they signed up with.
      zip: pro?.zip_code ?? p.zip_code ?? null,
      stats,
      lowAcceptance: isAcceptanceRateLow(stats),
      favorite: favoriteIds.has(p.id),
      blockers: pro ? bookingBlockers(pro) : ['No Tidy Pro profile yet'],
      check: checkById.get(p.id),
      hours: weeklyHours(pro?.availability),
      timeOff: pro ? normalizeTimeOff(parseTimeOff(pro.time_off), todayInZone(pro.time_zone ?? DEFAULT_BOOKING_TIME_ZONE)) : [],
    }
  })

  const query = search.trim().toLowerCase()
  const rows = all.filter(
    (r) =>
      (!query || r.name.toLowerCase().includes(query) || (r.profile.email ?? '').toLowerCase().includes(query) || (r.zip ?? '').includes(query)) &&
      (!status || (r.pro?.cleaner_status ?? 'applied') === status) &&
      (services.length === 0 || providesServices(r.pro?.services_provided, services)) &&
      (acceptance !== 'low' || r.lowAcceptance) &&
      (favorite !== 'yes' || r.favorite)
  )
  const hasFilters = !!(search || status || services.length || acceptance || favorite)

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Tidy Pros</h1>
      <p className="text-sm text-slate-500 mb-6">
        Every Tidy Pro, with what they offer and how they&apos;re doing. Acceptance rate counts only requests they answered; it&apos;s flagged below{' '}
        {Math.round(ACCEPTANCE_RATE_THRESHOLD * 100)}% once they&apos;ve answered a few. Click a name to see their profile as customers do.
      </p>

      {(error || tidyProsError) && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
          Couldn&apos;t load Tidy Pros: {(error ?? tidyProsError)?.message}
        </p>
      )}

      <form method="get" action="/admin/tidy-pros" className="flex flex-wrap items-end gap-3 mb-6">
        <label className="text-xs font-semibold text-slate-500">
          Search
          <input
            name="search"
            defaultValue={search}
            placeholder="Name, email or ZIP"
            className="mt-1 block w-56 text-sm font-normal text-slate-700 border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
          />
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Status
          <select name="status" defaultValue={status} className="mt-1 block w-36 text-sm font-normal text-slate-700 border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
            <option value="">All statuses</option>
            <option value="approved">Approved</option>
            <option value="applied">Applied</option>
            <option value="paused">Paused</option>
          </select>
        </label>
        <div role="group" aria-label="Services" className="text-xs font-semibold text-slate-500">
          Services
          <details className="relative mt-1 w-56">
            <summary className="list-none cursor-pointer text-sm font-normal text-slate-700 border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
              {services.length === 0
                ? 'All services'
                : services.length === 1
                  ? serviceLabels(services)[0]
                  : `${services.length} services`}
            </summary>
            <div className="absolute z-20 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
              <p className="px-1 pb-1 text-[11px] font-normal text-slate-400">Shows Tidy Pros who offer every service checked.</p>
              {TIDY_PRO_SERVICES.map((s) => (
                <label key={s.key} className="flex items-center gap-2 rounded px-1 py-1 text-sm font-normal text-slate-700 hover:bg-slate-50">
                  <input type="checkbox" name="service" value={s.key} defaultChecked={services.includes(s.key)} />
                  {s.label}
                </label>
              ))}
            </div>
          </details>
        </div>
        <label className="text-xs font-semibold text-slate-500">
          Acceptance
          <select name="acceptance" defaultValue={acceptance} className="mt-1 block w-44 text-sm font-normal text-slate-700 border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
            <option value="">All rates</option>
            <option value="low">Below {Math.round(ACCEPTANCE_RATE_THRESHOLD * 100)}%</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Favorites
          <select name="favorite" defaultValue={favorite} className="mt-1 block w-36 text-sm font-normal text-slate-700 border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
            <option value="">Everyone</option>
            <option value="yes">Favorites only</option>
          </select>
        </label>
        <button type="submit" className="text-sm font-semibold text-white bg-brand rounded-lg px-4 py-1.5">
          Filter
        </button>
        {hasFilters && (
          <Link href="/admin/tidy-pros" className="text-sm text-slate-400 hover:text-slate-600 py-1.5">
            Clear filters
          </Link>
        )}
      </form>

      <p className="text-xs text-slate-400 mb-2">
        {rows.length} of {all.length} Tidy Pro{all.length === 1 ? '' : 's'}
      </p>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className={TH}>Tidy Pro</th>
                <th className={TH}>Status</th>
                <th className={TH}>Services</th>
                <th className={TH}>Acceptance</th>
                <th className={TH}>Rating</th>
                <th className={TH}>Area</th>
                <th className={TH}>Availability</th>
                <th className={TH}>Checks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map(({ profile, pro, name, zip, stats, lowAcceptance, favorite: isFavorite, blockers, check, hours, timeOff }) => {
                const bookable = blockers.length === 0
                const cleanerStatus = pro?.cleaner_status ?? 'applied'
                const offered = serviceLabels(pro?.services_provided)
                const answered = stats.accepted + stats.declined
                const stage = backgroundCheckStage(check)
                const push = pushStatus(pro)
                return (
                  <tr key={profile.id} className="align-top">
                    <td className="px-4 py-3 text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <FavoriteStar proId={profile.id} name={name} initialFavorite={isFavorite} />
                        <Link href={`/admin/tidy-pros/${profile.id}`} className="font-medium text-slate-700 hover:underline">
                          {name}
                        </Link>
                      </div>
                      <div className="text-xs text-slate-400">{profile.email}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {profile.banned_at ? (
                        <div className="font-semibold text-red-600">Banned</div>
                      ) : (
                        <div className={`font-semibold ${STATUS_TONE[cleanerStatus] ?? 'text-slate-500'}`}>{capitalize(cleanerStatus)}</div>
                      )}
                      {bookable ? (
                        <div className="text-green-700">Bookable</div>
                      ) : (
                        <>
                          <div className="text-slate-400">Not bookable</div>
                          <ul className="text-slate-500 mt-0.5 space-y-0.5">
                            {blockers.map((reason) => (
                              <li key={reason}>· {reason}</li>
                            ))}
                          </ul>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-60">
                      {offered.length > 0 ? offered.join(', ') : <span className="text-slate-400">Not chosen yet</span>}
                      {pro?.uses_organic_products && <div className="text-green-700 mt-0.5">Uses organic products</div>}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      <div className={`text-sm tabular-nums ${lowAcceptance ? 'font-bold text-red-600' : 'text-slate-700'}`}>{formatAcceptanceRate(stats)}</div>
                      <div className="text-slate-400">
                        {answered > 0 ? `${stats.accepted} accepted · ${stats.declined} declined` : 'No requests answered'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      {pro?.rating != null && (pro.review_count ?? 0) > 0 ? (
                        <Link href={`/admin/tidy-pros/${profile.id}/reviews`} className="hover:underline">
                          <span className="text-sm text-slate-700">★ {Number(pro.rating).toFixed(1)}</span>{' '}
                          <span className="text-slate-400">
                            ({pro.review_count} review{pro.review_count === 1 ? '' : 's'})
                          </span>
                        </Link>
                      ) : (
                        <span className="text-slate-400">No reviews yet</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                      {pro?.city || pro?.state || zip ? [[pro?.city, pro?.state].filter(Boolean).join(', '), zip].filter(Boolean).join(' ') : <span className="text-slate-400">—</span>}
                      {pro?.travel_radius_miles != null && <div className="text-slate-400">Up to {pro.travel_radius_miles} mi</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                      {pro?.is_away && <div className="font-semibold text-amber-700 mb-0.5">Away</div>}
                      {hours.length > 0 ? (
                        <ul className="space-y-0.5">
                          {hours.map(({ day, hours: dayHours }) => (
                            <li key={day}>
                              <span className="font-medium text-slate-700">{day}</span> {dayHours}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-slate-400">No hours set</span>
                      )}
                      {timeOff.length > 0 && (
                        <div className="mt-1 text-slate-500">
                          <div className="font-medium text-slate-600">Time off</div>
                          <ul className="space-y-0.5">
                            {timeOff.slice(0, 2).map((range) => (
                              <li key={`${range.start}_${range.end}_${range.startTime ?? ''}_${range.endTime ?? ''}`}>{formatTimeOffRange(range)}</li>
                            ))}
                          </ul>
                          {timeOff.length > 2 && <div className="text-slate-400">+{timeOff.length - 2} more</div>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      <div className={CHECK_TONE[stage]}>Background: {backgroundCheckStatusLabel(check)}</div>
                      <div className="my-1">
                        {pro ? <VerifiedToggle proId={profile.id} name={name} initialVerified={pro.is_verified} /> : <span className="text-slate-400">No profile yet</span>}
                      </div>
                      <div className={pro?.is_insured ? 'text-green-700' : 'text-slate-400'}>{pro?.is_insured ? 'Insured' : 'Not insured'}</div>
                      <div className={push.tone}>{push.label}</div>
                      <AmendmentStatusList statuses={amendmentsById.get(profile.id)} />
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                    {hasFilters ? 'No Tidy Pros match these filters.' : 'No Tidy Pros yet.'}
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
