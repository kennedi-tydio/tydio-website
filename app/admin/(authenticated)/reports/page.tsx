import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  BAN_THRESHOLDS,
  CUSTOMER_REPORT_CATEGORIES,
  REPORT_SEVERITIES,
  SEVERITY_LABELS,
  TIDY_PRO_REPORT_CATEGORIES,
  countBySeverity,
  findReportChoice,
  normalizeSeverity,
  reachesBanThreshold,
  reportChoiceLabel,
  type ReportCategory,
  type ReportSeverity,
} from '@/lib/reportCategories'
import { saveReportReviewAction, setReportSeverityAction } from '../../actions'
import ReviewForm from '../ReviewForm'
import ReviewTabs from '../ReviewTabs'
import { BanAccountButton } from '../users/AccountActions'
import SeveritySelect from './SeveritySelect'

const TH = 'px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide'

// The risk_events a person filed about a booking: a customer reporting their Tidy Pro, or
// a Tidy Pro reporting the customer. user_id is who was reported, created_by who reported.
const REPORT_TYPES: Record<string, { label: string; categories: readonly ReportCategory[] }> = {
  customer_complaint: {
    label: 'Customer reported Tidy Pro',
    categories: TIDY_PRO_REPORT_CATEGORIES,
  },
  cleaner_complaint: {
    label: 'Tidy Pro reported customer',
    categories: CUSTOMER_REPORT_CATEGORIES,
  },
}

type Profile = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  role: string | null
  banned_at: string | null
}

function fullName(p: Profile | undefined): string {
  return [p?.first_name, p?.last_name].filter(Boolean).join(' ') || p?.email || '—'
}

function roleLabel(p: Profile | undefined): string {
  return p?.role === 'TIDYPRO' ? 'Tidy Pro' : p?.role === 'USER' ? 'Customer' : ''
}

function metadataOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

// What the report was filed under. Older reports used a single list of categories
function reportSummary(eventType: string, metadata: Record<string, unknown>, description: string | null): { label: string; details: string | null } {
  const categories = REPORT_TYPES[eventType]?.categories ?? []
  const choice = findReportChoice(categories, metadata.category, metadata.reason)
  if (choice && 'note' in metadata) {
    return {
      label: reportChoiceLabel(choice),
      details: typeof metadata.note === 'string' ? metadata.note : null,
    }
  }
  const category = typeof metadata.category === 'string' ? metadata.category.replaceAll('_', ' ') : 'Report'
  return {
    label: category.charAt(0).toUpperCase() + category.slice(1),
    details: description,
  }
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  })
}

function profileHref(p: Profile): string | null {
  return p.role === 'TIDYPRO' ? `/admin/tidy-pros/${p.id}` : null
}

function PersonCell({ profile }: { profile: Profile | undefined }) {
  if (!profile) return <span className="text-slate-400">—</span>
  const name = fullName(profile)
  const href = profileHref(profile)
  return (
    <>
      <div>
        {href ? (
          <Link href={href} className="hover:underline">
            {name}
          </Link>
        ) : (
          name
        )}
      </div>
      <div className="text-xs text-slate-400">{profile.email}</div>
    </>
  )
}

function reportsHref(params: { tab: string; level?: string; user?: string }): string {
  const query = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => !!entry[1]))
  return `/admin/reports?${query}`
}

// The reasons that file a report at this level, for the ban policy note.
function reasonsAtLevel(categories: readonly ReportCategory[], level: ReportSeverity): string[] {
  return categories.flatMap((c) => c.reasons.filter((r) => r.severity === level).map((r) => r.label))
}

const COUNT_TONE: Record<ReportSeverity, string> = {
  low: 'text-slate-700',
  medium: 'text-amber-700',
  high: 'text-red-700',
}

type ReportedPerson = {
  id: string
  profile: Profile | undefined
  counts: Record<ReportSeverity, number>
  total: number
  pending: number
  overThreshold: boolean
}

// Who has been reported and their strikes at each level, against the ban threshold.
function ReportedPeopleTable({
  title,
  subtitle,
  people,
  emptyText,
  tab,
  level,
  showViewLink,
}: {
  title: string
  subtitle?: string
  people: ReportedPerson[]
  emptyText: string
  tab: string
  level: ReportSeverity | null
  showViewLink: boolean
}) {
  return (
    <>
      <h2 className="text-sm font-semibold text-slate-700 mb-1">{title}</h2>
      {subtitle && <p className="text-xs text-slate-500 mb-2">{subtitle}</p>}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-8">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className={TH}>Person</th>
                <th className={TH}>Role</th>
                {REPORT_SEVERITIES.map((s) => (
                  <th key={s} className={TH}>
                    {SEVERITY_LABELS[s]} <span className="normal-case font-normal">(ban at {BAN_THRESHOLDS[s]})</span>
                  </th>
                ))}
                <th className={TH}>Status</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {people.map((p) => {
                const name = fullName(p.profile)
                return (
                  <tr key={p.id} className={`align-top ${p.overThreshold && !p.profile?.banned_at ? 'bg-red-50/40' : ''}`}>
                    <td className="px-4 py-3 text-slate-600">
                      <PersonCell profile={p.profile} />
                      {showViewLink && (
                        <Link
                          href={reportsHref({
                            tab,
                            level: level ?? undefined,
                            user: p.id,
                          })}
                          className="text-xs font-semibold text-brand hover:underline"
                        >
                          View {p.total} report{p.total === 1 ? '' : 's'}
                        </Link>
                      )}
                      {p.pending > 0 && <div className="text-xs text-amber-700">{p.pending} awaiting review</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{roleLabel(p.profile) || '—'}</td>
                    {REPORT_SEVERITIES.map((s) => (
                      <td key={s} className={`px-4 py-3 tabular-nums ${p.counts[s] >= BAN_THRESHOLDS[s] ? `font-bold ${COUNT_TONE[s]}` : 'text-slate-500'}`}>
                        {p.counts[s]} <span className="text-xs font-normal text-slate-400">strike{p.counts[s] === 1 ? '' : 's'}</span>
                      </td>
                    ))}
                    <td className="px-4 py-3 text-xs">
                      {p.profile?.banned_at ? (
                        <span className="font-semibold text-slate-500">Banned</span>
                      ) : p.overThreshold ? (
                        <span className="font-semibold text-red-600">Reached ban threshold</span>
                      ) : (
                        <span className="text-slate-400">Under threshold</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {p.profile && !p.profile.banned_at && p.profile.role !== 'ADMIN' && <BanAccountButton profileId={p.id} name={name} />}
                    </td>
                  </tr>
                )
              })}
              {people.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">
                    {emptyText}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string; level?: string; user?: string }> }) {
  const { tab: tabParam, level: levelParam, user: userParam } = await searchParams
  const tab = tabParam === 'resolved' ? 'resolved' : 'open'
  const level = REPORT_SEVERITIES.includes(levelParam as ReportSeverity) ? (levelParam as ReportSeverity) : null
  const userFilter = userParam || null
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('risk_events')
    .select('id, event_type, booking_id, user_id, severity, description, metadata, resolved_at, resolution_notes, created_by, created_at')
    .in('event_type', Object.keys(REPORT_TYPES))
    .order('created_at', { ascending: false })
    .limit(1000)

  const reports = (data ?? []).map((r) => ({
    ...r,
    level: normalizeSeverity(r.severity),
  }))

  const profileIds = [...new Set(reports.flatMap((r) => [r.user_id, r.created_by]).filter((id): id is string => !!id))]
  const { data: profiles } = profileIds.length
    ? await admin.from('profiles').select('id, first_name, last_name, email, role, banned_at').in('id', profileIds)
    : { data: [] }
  const profileById = new Map<string, Profile>((profiles ?? []).map((p) => [p.id, p as Profile]))

  // Everyone who has been reported. A report becomes a strike once it's resolved; open
  // ones are still awaiting review and don't count toward the ban threshold yet.
  // Most serious first.
  const byReported = new Map<string, typeof reports>()
  for (const r of reports) if (r.user_id) byReported.set(r.user_id, [...(byReported.get(r.user_id) ?? []), r])
  const reportedPeople = [...byReported]
    .map(([id, theirs]) => {
      const counts = countBySeverity(theirs.filter((r) => r.resolved_at).map((r) => r.level))
      return {
        id,
        profile: profileById.get(id),
        counts,
        total: theirs.length,
        pending: theirs.filter((r) => !r.resolved_at).length,
        overThreshold: reachesBanThreshold(counts),
      }
    })
    .sort(
      (a, b) => Number(b.overThreshold) - Number(a.overThreshold) || b.counts.high - a.counts.high || b.counts.medium - a.counts.medium || b.total - a.total
    )

  const forUser = userFilter ? reports.filter((r) => r.user_id === userFilter) : reports
  const forLevel = level ? forUser.filter((r) => r.level === level) : forUser
  const open = forLevel.filter((r) => !r.resolved_at)
  const resolved = forLevel.filter((r) => r.resolved_at)
  const rows = tab === 'open' ? open : resolved
  const people = userFilter ? reportedPeople.filter((p) => p.id === userFilter) : reportedPeople
  const tidyPros = reportedPeople.filter((p) => p.profile?.role === 'TIDYPRO')
  const customers = reportedPeople.filter((p) => p.profile?.role !== 'TIDYPRO')
  const filterParams = {
    ...(level ? { level } : {}),
    ...(userFilter ? { user: userFilter } : {}),
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Reports</h1>
      <p className="text-sm text-slate-500 mb-4">
        Reports filed from a booking, newest first. Check one off once it&apos;s been dealt with, and keep notes for yourself. The person who filed it
        isn&apos;t notified either way.
      </p>

      <div role="note" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-6 text-sm text-amber-900">
        <strong>Ban policy:</strong> {BAN_THRESHOLDS.low} low, {BAN_THRESHOLDS.medium} mid, or {BAN_THRESHOLDS.high} high-level report leads to an account ban.
        A report becomes a strike once you resolve it; open reports don&apos;t count yet. Each level counts on its own. Banning isn&apos;t automatic: use Ban below once you&apos;ve
        checked the reports.
        <div className="grid gap-3 sm:grid-cols-3 mt-3">
          {REPORT_SEVERITIES.map((s) => (
            <div key={s} className="rounded-lg bg-white/70 border border-amber-100 px-3 py-2">
              <p className={`text-xs font-bold uppercase tracking-wide mb-1 ${COUNT_TONE[s]}`}>
                {SEVERITY_LABELS[s]} · ban at {BAN_THRESHOLDS[s]}
              </p>
              {Object.values(REPORT_TYPES).map((type) => (
                <div key={type.label} className="mb-1.5 last:mb-0">
                  <p className="text-[11px] font-semibold text-slate-500">{type.label}</p>
                  <ul className="text-xs text-slate-700 list-disc pl-4">
                    {reasonsAtLevel(type.categories, s).map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className="text-xs text-amber-800 mt-2">&ldquo;Something else&rdquo; reports start as Low; change the level once you&apos;ve read them.</p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
          Couldn&apos;t load reports: {error.message}
        </p>
      )}

      <form method="get" action="/admin/reports" className="flex flex-wrap items-end gap-3 mb-6">
        <input type="hidden" name="tab" value={tab} />
        <label className="text-xs font-semibold text-slate-500">
          Person reported
          <select
            name="user"
            defaultValue={userFilter ?? ''}
            className="mt-1 block w-64 text-sm font-normal text-slate-700 border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
          >
            <option value="">Everyone</option>
            {reportedPeople.map((p) => (
              <option key={p.id} value={p.id}>
                {fullName(p.profile)}
                {roleLabel(p.profile) && ` (${roleLabel(p.profile)})`} · {p.total}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Level
          <select
            name="level"
            defaultValue={level ?? ''}
            className="mt-1 block w-32 text-sm font-normal text-slate-700 border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
          >
            <option value="">All levels</option>
            {REPORT_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {SEVERITY_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="text-sm font-semibold text-white bg-brand rounded-lg px-4 py-1.5">
          Filter
        </button>
        {(level || userFilter) && (
          <Link href={reportsHref({ tab })} className="text-sm text-slate-400 hover:text-slate-600 py-1.5">
            Clear filters
          </Link>
        )}
      </form>

      <ReportedPeopleTable
        title={userFilter ? 'This person' : 'Tidy Pros reported'}
        subtitle={userFilter ? undefined : 'Strikes are resolved reports, counted by level. Open reports show as awaiting review until you resolve them.'}
        people={userFilter ? people : tidyPros}
        emptyText={userFilter ? 'No reports for this person.' : 'No Tidy Pros have been reported.'}
        tab={tab}
        level={level}
        showViewLink={!userFilter}
      />
      {!userFilter && (
        <ReportedPeopleTable title="Customers reported" people={customers} emptyText="No customers have been reported." tab={tab} level={level} showViewLink />
      )}

      <h2 className="text-sm font-semibold text-slate-700 mb-2">Reports</h2>
      <ReviewTabs
        basePath="/admin/reports"
        current={tab}
        params={filterParams}
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
                <th className={TH}>Filed</th>
                <th className={TH}>Level</th>
                <th className={TH}>Report</th>
                <th className={TH}>Filed by</th>
                <th className={TH}>About</th>
                <th className={TH}>Booking</th>
                <th className={TH}>Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r) => {
                const summary = reportSummary(r.event_type, metadataOf(r.metadata), r.description)
                const reported = r.user_id ? profileById.get(r.user_id) : undefined
                return (
                  <tr key={r.id} className="align-top">
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                    <td className="px-4 py-3">
                      <SeveritySelect
                        key={`${r.id}-${r.level}`}
                        action={setReportSeverityAction.bind(null, r.id)}
                        severity={r.level}
                        label={`the report about ${fullName(reported)}`}
                      />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-72">
                      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">{REPORT_TYPES[r.event_type]?.label}</div>
                      <div className="font-medium text-slate-700">{summary.label}</div>
                      {summary.details && <div className="text-slate-500 mt-1 whitespace-pre-wrap">&ldquo;{summary.details}&rdquo;</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <PersonCell profile={r.created_by ? profileById.get(r.created_by) : undefined} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <PersonCell profile={reported} />
                      {reported?.banned_at && <div className="text-xs font-semibold text-slate-500 mt-0.5">Banned</div>}
                    </td>
                    <td className="px-4 py-3 text-[11px] font-mono text-slate-400">{r.booking_id ? r.booking_id.slice(0, 8) : '—'}</td>
                    <td className="px-4 py-3">
                      <ReviewForm
                        key={`${r.id}-${r.resolved_at ?? ''}`}
                        action={saveReportReviewAction.bind(null, r.id)}
                        label={`the report about ${fullName(reported)}`}
                        resolved={!!r.resolved_at}
                        note={r.resolution_notes ?? ''}
                      />
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">
                    {tab === 'open' ? 'No open reports.' : 'No resolved reports.'}
                    {(level || userFilter) && ' Try clearing the filters.'}
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
