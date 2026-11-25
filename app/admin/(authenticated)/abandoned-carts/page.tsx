import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  ABANDON_AFTER_MINUTES,
  QUOTE_COLUMNS,
  STAGE_LABELS,
  money,
  priceRange,
  quoteOutcome,
  quotedPrice,
  statsByPriceBucket,
  summarizeQuotes,
  type QuoteRow,
  type QuoteStats,
} from '@/lib/pricingQuotes'
import { quoteDetailRows, readQuoteDetails } from '@/lib/quoteDetails'
import ReviewTabs from '../ReviewTabs'

const TH = 'px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide'

const PERIODS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
]

const TABS = ['abandoned', 'booked', 'open', 'all'] as const
type Tab = (typeof TABS)[number]

function fullName(p: { first_name: string | null; last_name: string | null } | undefined): string {
  return [p?.first_name, p?.last_name].filter(Boolean).join(' ') || '—'
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

function percent(rate: number | null): string {
  return rate == null ? '—' : `${Math.round(rate * 100)}%`
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{value}</div>
      {hint && <div className="text-xs text-slate-400 mt-1">{hint}</div>}
    </div>
  )
}

function OutcomeBadge({ row }: { row: Pick<QuoteRow, 'booked_at' | 'abandoned_at'> }) {
  const outcome = quoteOutcome(row)
  if (outcome === 'booked') {
    return (
      <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700">
        {row.abandoned_at ? 'Came back & booked' : 'Booked'}
      </span>
    )
  }
  if (outcome === 'abandoned') {
    return <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700">Abandoned</span>
  }
  return <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500">In progress</span>
}

function StatsRow({ label, stats }: { label: string; stats: QuoteStats }) {
  return (
    <tr>
      <td className="px-4 py-2.5 text-slate-700 font-medium whitespace-nowrap">{label}</td>
      <td className="px-4 py-2.5 text-slate-600 tabular-nums">{stats.quotes}</td>
      <td className="px-4 py-2.5 text-slate-600 tabular-nums">{stats.booked}</td>
      <td className="px-4 py-2.5 text-slate-600 tabular-nums">{stats.abandoned}</td>
      <td className="px-4 py-2.5 tabular-nums">
        {stats.bookingRate == null ? (
          <span className="text-slate-300">—</span>
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-24 h-2 rounded-full bg-red-100 overflow-hidden" aria-hidden>
              <div className="h-full bg-emerald-500" style={{ width: `${Math.round(stats.bookingRate * 100)}%` }} />
            </div>
            <span className="text-slate-700 font-medium">{percent(stats.bookingRate)}</span>
          </div>
        )}
      </td>
    </tr>
  )
}

export default async function AdminAbandonedCartsPage({ searchParams }: { searchParams: Promise<{ tab?: string; period?: string }> }) {
  const { tab: tabParam, period: periodParam } = await searchParams
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? '') ? (tabParam as Tab) : 'abandoned'
  const period = PERIODS.some((p) => p.value === periodParam) ? periodParam! : '30'
  const admin = createAdminClient()

  let query = admin
    .from('pricing_quotes')
    .select(QUOTE_COLUMNS)
    .order('last_viewed_at', { ascending: false })
    .limit(2000)
  if (period !== 'all') {
    query = query.gte('first_viewed_at', daysAgoIso(Number(period)))
  }
  const { data, error } = await query
  const all = (data ?? []) as QuoteRow[]

  const stats = summarizeQuotes(all)
  const buckets = statsByPriceBucket(all)
  const byStage = (['cleaners', 'review'] as const).map((stage) => ({
    stage,
    stats: summarizeQuotes(all.filter((q) => q.stage === stage)),
  }))

  const rows = tab === 'all' ? all : all.filter((q) => quoteOutcome(q) === tab)
  const counts = {
    abandoned: all.filter((q) => quoteOutcome(q) === 'abandoned').length,
    booked: all.filter((q) => quoteOutcome(q) === 'booked').length,
    open: all.filter((q) => quoteOutcome(q) === 'open').length,
  }

  const peopleIds = [...new Set(rows.flatMap((r) => [r.customer_user_id, r.selected_tidy_pro_id]).filter((id): id is string => !!id))]
  const { data: profiles } = peopleIds.length
    ? await admin.from('profiles').select('id, first_name, last_name, email, phone, city, state').in('id', peopleIds)
    : { data: [] }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  const gap =
    stats.avgAbandonedPrice != null && stats.avgBookedPrice != null ? Math.round((stats.avgAbandonedPrice - stats.avgBookedPrice) * 100) / 100 : null

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Abandoned Carts</h1>
      <p className="text-sm text-slate-500 mb-6">
        Every time a customer sees prices (the Tidy Pro list or the booking review total), we save what they were quoted and everything about the booking (home size, cleaning and add-ons, tasks, schedule, notes). If they
        don&apos;t book within {ABANDON_AFTER_MINUTES} minutes of the last price they saw, it&apos;s marked abandoned and you get an
        email. The price used below is the review total if they got that far, otherwise the cheapest Tidy Pro they were offered.
      </p>

      {error && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
          Couldn&apos;t load quotes: {error.message}. If the table is missing, apply migration 081_pricing_quotes.
        </p>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        {PERIODS.map((p) => (
          <Link
            key={p.value}
            href={`/admin/abandoned-carts?${new URLSearchParams({ tab, period: p.value })}`}
            aria-current={period === p.value ? 'page' : undefined}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              period === p.value ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-500 hover:text-slate-700'
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <StatCard label="Saw pricing" value={String(stats.quotes)} hint={stats.open > 0 ? `${stats.open} still in progress` : undefined} />
        <StatCard label="Booked" value={String(stats.booked)} />
        <StatCard label="Abandoned" value={String(stats.abandoned)} />
        <StatCard label="Booking rate" value={percent(stats.bookingRate)} hint="Of quotes that ended" />
        <StatCard
          label="Avg price"
          value={`${money(stats.avgAbandonedPrice)}`}
          hint={`abandoned vs ${money(stats.avgBookedPrice)} booked${gap != null && gap !== 0 ? ` (${gap > 0 ? '+' : '−'}${money(Math.abs(gap))})` : ''}`}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-8">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <h2 className="px-4 pt-4 pb-2 text-sm font-semibold text-slate-900">Booking rate by price</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  <th className={TH}>Price</th>
                  <th className={TH}>Quotes</th>
                  <th className={TH}>Booked</th>
                  <th className={TH}>Abandoned</th>
                  <th className={TH}>Booking rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {buckets.map((b) => (
                  <StatsRow key={b.label} label={b.label} stats={b} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden self-start">
          <h2 className="px-4 pt-4 pb-2 text-sm font-semibold text-slate-900">Furthest step reached</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  <th className={TH}>Step</th>
                  <th className={TH}>Quotes</th>
                  <th className={TH}>Booked</th>
                  <th className={TH}>Abandoned</th>
                  <th className={TH}>Booking rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {byStage.map((s) => (
                  <StatsRow key={s.stage} label={STAGE_LABELS[s.stage]} stats={s.stats} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-xs text-slate-400">
            Customers who leave at the Tidy Pro list saw a price range; those who leave on review saw their exact total.
          </p>
        </div>
      </div>

      <ReviewTabs
        basePath="/admin/abandoned-carts"
        current={tab}
        params={{ period }}
        tabs={[
          { value: 'abandoned', label: 'Abandoned', count: counts.abandoned },
          { value: 'booked', label: 'Booked', count: counts.booked },
          { value: 'open', label: 'In progress', count: counts.open },
          { value: 'all', label: 'All', count: all.length },
        ]}
      />

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className={TH}>Last saw price</th>
                <th className={TH}>Customer</th>
                <th className={TH}>Outcome</th>
                <th className={TH}>Price</th>
                <th className={TH}>Left at</th>
                <th className={TH}>Booking details</th>
                <th className={TH}>Requested</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r) => {
                const customer = profileById.get(r.customer_user_id)
                const pro = r.selected_tidy_pro_id ? profileById.get(r.selected_tidy_pro_id) : undefined
                const place = [customer?.city, customer?.state].filter(Boolean).join(', ')
                const details = readQuoteDetails(r.details)
                return (
                  <tr key={r.id} className="align-top">
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                      <div>{formatDateTime(r.last_viewed_at)}</div>
                      <div className="text-slate-400">
                        {r.view_count} view{r.view_count === 1 ? '' : 's'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{fullName(customer)}</div>
                      <div className="text-xs text-slate-400">{customer?.email}</div>
                      {customer?.phone && <div className="text-xs text-slate-400">{customer.phone}</div>}
                      {place && <div className="text-xs text-slate-400">{place}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <OutcomeBadge row={r} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      <div className="text-sm font-semibold text-slate-900 tabular-nums">{money(quotedPrice(r))}</div>
                      {r.review_total_price != null && (
                        <div>
                          {money(r.review_service_price)} + card fee{pro ? ` · ${fullName(pro)}` : ''}
                        </div>
                      )}
                      {r.lowest_price != null && (
                        <div>
                          List: {priceRange(r)}
                          {r.cleaner_count ? ` (${r.cleaner_count} pro${r.cleaner_count === 1 ? '' : 's'})` : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{STAGE_LABELS[r.stage]}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 min-w-72">
                      {details ? (
                        <dl className="space-y-1.5">
                          {quoteDetailRows(details).map(([label, lines]) => (
                            <div key={label}>
                              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
                              {lines.map((line, i) => (
                                <dd key={i} className="whitespace-pre-wrap break-words">
                                  {line}
                                </dd>
                              ))}
                            </div>
                          ))}
                        </dl>
                      ) : r.task_names.length > 0 ? (
                        <ul className="space-y-0.5">
                          {r.task_names.map((t, i) => (
                            <li key={i}>{t}</li>
                          ))}
                        </ul>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      <div>
                        {r.scheduled_date ?? 'Any day'} {r.scheduled_time ? r.scheduled_time.slice(0, 5) : ''}
                      </div>
                      {r.location_label && <div className="text-slate-400 max-w-56 truncate">{r.location_label}</div>}
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">
                    Nothing here for this period yet.
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
