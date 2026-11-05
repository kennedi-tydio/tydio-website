import { createAdminClient } from '@/lib/supabase/admin'
import { backgroundCheckStage, type BackgroundCheckStage, type ScreeningPart } from '@/lib/backgroundCheck'
import { feeStatusLabel, formatFeeCents } from '@/lib/backgroundCheckFee'
import {
  denyCleanerAction,
  passBackgroundCheckAction,
  removeBanAction,
  setScreeningPartCompletedAction,
} from '../../actions'
import SendLinkForm from './SendLinkForm'

type Tab = BackgroundCheckStage | 'banned'

// Each cleaner gets one link that covers both parts of the screening. Once both
// are ticked off as completed, they move to Processing to be approved or denied.
const SCREENING_PART_LABELS: { part: ScreeningPart; label: string }[] = [
  { part: 'background_check', label: 'Background check' },
  { part: 'id_verification', label: 'ID verification' },
]

const STAGE_TABS: { label: string; value: BackgroundCheckStage }[] = [
  { label: 'Paid', value: 'needs_link' },
  { label: 'Link sent', value: 'link_sent' },
  { label: 'Processing', value: 'pending' },
  { label: 'Approved', value: 'passed' },
  { label: 'Not paid', value: 'not_started' },
]

const STAGE_BADGES: Record<BackgroundCheckStage, { label: string; color: string }> = {
  not_started: { label: 'Not paid', color: '#64748b' },
  needs_link: { label: 'Paid · send link', color: '#ef4444' },
  link_sent: { label: 'Link sent', color: '#f59e0b' },
  pending: { label: 'Processing · decide', color: '#f59e0b' },
  passed: { label: 'Approved', color: '#22c55e' },
  failed: { label: 'Not approved', color: '#ef4444' },
}

const BUTTON_PRIMARY = 'text-xs font-semibold px-2.5 py-1 rounded-lg text-white transition-opacity hover:opacity-90'
const BUTTON_SECONDARY = 'text-xs font-medium text-slate-500 border border-slate-200 px-2.5 py-1 rounded-lg hover:bg-slate-50 transition-colors'
const TH = 'px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide'

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : '—'
}

export default async function AdminBackgroundChecksPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>
}) {
  const { stage: stageParam } = await searchParams
  const tab: Tab = stageParam === 'banned' || STAGE_TABS.some((t) => t.value === stageParam) ? (stageParam as Tab) : 'needs_link'
  const admin = createAdminClient()

  const [{ data, error }, { data: bannedData, error: bannedError }] = await Promise.all([
    admin
      .from('background_checks')
      .select(
        'pro_id, status, requested_at, link_sent_at, submitted_at, completed_at, background_check_link, manual_decision_note, fee_paid_at, fee_amount_cents, fee_refunded_at, fee_refund_reason, background_check_completed_at, id_verification_completed_at'
      )
      .order('requested_at', { ascending: true, nullsFirst: false }),
    admin
      .from('banned_users')
      .select('id, email, first_name, last_name, note, fee_amount_cents, banned_at')
      .order('banned_at', { ascending: false }),
  ])

  const checks = data ?? []
  const banned = bannedData ?? []
  const rows = checks.filter((c) => backgroundCheckStage(c) === tab)
  const loadError = error ?? bannedError

  const proIds = rows.map((r) => r.pro_id)
  const { data: profiles } = proIds.length
    ? await admin.from('profiles').select('id, first_name, last_name, email').in('id', proIds)
    : { data: [] }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-slate-900">Background Checks</h1>
        <p className="text-sm text-slate-400">{tab === 'banned' ? banned.length : rows.length} shown</p>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        Order each check in the{' '}
        <a href="https://dashboard.checkr.com" target="_blank" rel="noopener noreferrer" className="underline">
          Checkr dashboard
        </a>
        , and send each cleaner their link here (one link covers the background check and ID verification). Tick off each part as
        it&apos;s completed, then approve or deny under Processing. Nothing updates automatically.
      </p>

      {loadError && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
          Couldn&apos;t load background checks: {loadError.message}. If a column or table is missing, apply the latest database migrations.
        </p>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          ...STAGE_TABS.map((t) => ({ ...t, count: checks.filter((c) => backgroundCheckStage(c) === t.value).length })),
          { label: 'Banned', value: 'banned' as Tab, count: banned.length },
        ].map((t) => (
          <a
            key={t.value}
            href={`/admin/background-checks?stage=${t.value}`}
            className="px-3 py-2 rounded-xl text-sm border transition-colors"
            style={
              tab === t.value
                ? { backgroundColor: 'var(--color-brand)', color: 'white', borderColor: 'var(--color-brand)' }
                : { borderColor: '#e2e8f0', color: '#64748b' }
            }
          >
            {t.label} ({t.count})
          </a>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {tab === 'banned' ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  <th className={TH}>Name</th>
                  <th className={TH}>Email</th>
                  <th className={TH}>Note</th>
                  <th className={TH}>Fee paid</th>
                  <th className={TH}>Banned</th>
                  <th className={TH}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {banned.map((ban) => (
                  <tr key={ban.id} className="hover:bg-slate-50 transition-colors align-top">
                    <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                      {[ban.first_name, ban.last_name].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{ban.email}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs max-w-xs">{ban.note ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                      {ban.fee_amount_cents != null ? formatFeeCents(ban.fee_amount_cents) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{formatDate(ban.banned_at)}</td>
                    <td className="px-4 py-3">
                      <form action={removeBanAction.bind(null, ban.id)}>
                        <button type="submit" className={BUTTON_SECONDARY}>
                          Remove ban
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  <th className={TH}>Name</th>
                  <th className={TH}>Email</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Paid</th>
                  <th className={TH}>Link sent</th>
                  <th className={TH}>Progress</th>
                  <th className={TH}>Decided</th>
                  <th className={TH}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((row) => {
                  const profile = profileById.get(row.pro_id)
                  const stage = backgroundCheckStage(row)
                  const badge = row.status === 'in_review' ? { label: 'Needs review', color: '#ef4444' } : STAGE_BADGES[stage]
                  const name = profile ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || '—' : '—'
                  const linkForm = (
                    <SendLinkForm
                      proId={row.pro_id}
                      defaultLink={row.background_check_link ?? ''}
                      label={stage === 'needs_link' ? 'Send link' : 'Resend link'}
                      buttonClassName={BUTTON_SECONDARY}
                    />
                  )
                  return (
                    <tr key={row.pro_id} className="hover:bg-slate-50 transition-colors align-top">
                      <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{name}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{profile?.email ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                          style={{ color: badge.color, backgroundColor: `${badge.color}1a` }}
                        >
                          {badge.label}
                        </span>
                        <p className="text-xs text-slate-400 mt-1 whitespace-nowrap">{feeStatusLabel(row)}</p>
                        {row.manual_decision_note && <p className="text-xs text-slate-400 mt-1 max-w-xs">{row.manual_decision_note}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{formatDate(row.fee_paid_at)}</td>
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{formatDate(row.link_sent_at)}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {stage === 'not_started' || stage === 'needs_link' ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <ul className="flex flex-col gap-1.5">
                            {SCREENING_PART_LABELS.map(({ part, label }) => {
                              const completedAt = part === 'background_check' ? row.background_check_completed_at : row.id_verification_completed_at
                              // Past the link stage both parts are done, even if a tick was never recorded.
                              const completed = stage !== 'link_sent' || Boolean(completedAt)
                              return (
                                <li key={part}>
                                  {stage === 'link_sent' ? (
                                    <form action={setScreeningPartCompletedAction.bind(null, row.pro_id, part, !completed)}>
                                      <button
                                        type="submit"
                                        aria-pressed={completed}
                                        className={`flex items-center gap-1.5 hover:underline ${completed ? 'text-slate-500' : 'text-slate-700 font-medium'}`}
                                      >
                                        <span
                                          aria-hidden
                                          className={`inline-flex h-4 w-4 items-center justify-center rounded border ${completed ? 'bg-brand border-brand text-white' : 'border-slate-300 bg-white'}`}
                                        >
                                          {completed ? '✓' : ''}
                                        </span>
                                        {label} completed
                                      </button>
                                    </form>
                                  ) : (
                                    <span className="text-slate-500">
                                      ✓ {label}
                                      {completedAt ? `: ${formatDate(completedAt)}` : ''}
                                    </span>
                                  )}
                                </li>
                              )
                            })}
                          </ul>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{formatDate(row.completed_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-2 min-w-[240px]">
                          {stage === 'pending' && (
                            <form action={passBackgroundCheckAction.bind(null, row.pro_id)} className="flex flex-col gap-1.5">
                              <label className="flex items-center gap-1.5 text-xs text-slate-500">
                                <input type="checkbox" name="backgroundCheckPassed" required />
                                Background check passed
                              </label>
                              <label className="flex items-center gap-1.5 text-xs text-slate-500">
                                <input type="checkbox" name="idVerificationPassed" required />
                                ID verification passed
                              </label>
                              <button type="submit" className={`${BUTTON_PRIMARY} self-start`} style={{ backgroundColor: '#22c55e' }}>
                                Approve
                              </button>
                            </form>
                          )}
                          {stage === 'needs_link' && linkForm}
                          {stage === 'link_sent' && (
                            <details className="text-xs text-slate-500">
                              <summary className="cursor-pointer">Resend link</summary>
                              <div className="mt-2">{linkForm}</div>
                            </details>
                          )}
                          {stage !== 'not_started' && (
                            <form action={denyCleanerAction.bind(null, row.pro_id)} className="flex flex-col gap-1.5">
                              {stage === 'pending' && (
                                <select
                                  aria-label="Which check failed"
                                  name="failedCheck"
                                  defaultValue=""
                                  className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-brand"
                                >
                                  <option value="">Which check failed? (optional)</option>
                                  <option value="background_check">Background check</option>
                                  <option value="id_verification">ID verification</option>
                                  <option value="both">Both</option>
                                </select>
                              )}
                              <textarea
                                aria-label="Reason, sent to the cleaner"
                                name="reason"
                                required={stage !== 'pending'}
                                placeholder={stage === 'pending' ? 'Reason, sent to the cleaner…' : 'Reason, sent to the cleaner (required)…'}
                                rows={2}
                                className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-brand resize-none"
                              />
                              <label className="flex items-start gap-1.5 text-xs text-slate-500">
                                <input type="checkbox" name="noticesConfirmed" required className="mt-0.5" />
                                <span>
                                  Checkr&apos;s pre-adverse notice has been sent, or this denial isn&apos;t based on the report. I understand the
                                  cleaner is emailed this reason and has 7 days to appeal, after which they&apos;re banned and their account is
                                  permanently deleted.
                                </span>
                              </label>
                              <button
                                type="submit"
                                className="text-xs font-medium text-slate-500 border border-slate-200 px-2.5 py-1 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors self-start"
                              >
                                Deny
                              </button>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          {(tab === 'banned' ? banned.length === 0 : rows.length === 0) && !loadError && (
            <div className="text-center py-12 text-slate-400 text-sm">Nothing in this view.</div>
          )}
        </div>
      </div>
    </div>
  )
}
