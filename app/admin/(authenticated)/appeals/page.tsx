import { createAdminClient } from '@/lib/supabase/admin'
import { appealDeadline } from '@/lib/appealWindow'
import AppealDecision from './AppealDecision'

const TH = 'px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide'

function formatDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

type Row = {
  key: string
  kind: 'ban' | 'background_check'
  decisionId: string
  name: string
  email: string
  reason: string | null
  openedAt: string
  appealMessage: string | null
  appealedAt: string | null
}

// Everyone inside a 7-day appeal window: bans from /admin/users (account still
// there), and denied background checks. Appeals waiting on a decision come first.
// Each is closed automatically on its deadline: a ban's account is deleted, a
// denied cleaner is banned and deleted.
export default async function AppealsPage() {
  const admin = createAdminClient()
  const [{ data: bans, error: bansError }, { data: denials, error: denialsError }] = await Promise.all([
    admin
      .from('banned_users')
      .select('id, email, first_name, last_name, note, banned_at, appeal_message, appeal_submitted_at, appeal_denied_at')
      .not('appeal_token', 'is', null)
      .is('account_deleted_at', null)
      .is('appeal_denied_at', null),
    admin
      .from('background_checks')
      .select('pro_id, denied_at, denial_reason, appeal_message, appeal_submitted_at')
      .not('denied_at', 'is', null),
  ])

  const proIds = (denials ?? []).map(d => d.pro_id)
  const { data: pros } = proIds.length
    ? await admin.from('profiles').select('id, email, first_name, last_name').in('id', proIds)
    : { data: [] }
  const proById = new Map((pros ?? []).map(p => [p.id, p]))
  const fullName = (p: { first_name: string | null; last_name: string | null; email: string }) =>
    [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email

  const rows: Row[] = [
    ...(bans ?? []).map(b => ({
      key: `ban-${b.id}`,
      kind: 'ban' as const,
      decisionId: b.id,
      name: fullName(b),
      email: b.email,
      reason: b.note,
      openedAt: b.banned_at,
      appealMessage: b.appeal_message,
      appealedAt: b.appeal_submitted_at,
    })),
    ...(denials ?? []).flatMap(d => {
      const pro = proById.get(d.pro_id)
      if (!pro || !d.denied_at) return []
      return [{
        key: `bg-${d.pro_id}`,
        kind: 'background_check' as const,
        decisionId: d.pro_id,
        name: fullName(pro),
        email: pro.email,
        reason: d.denial_reason,
        openedAt: d.denied_at,
        appealMessage: d.appeal_message,
        appealedAt: d.appeal_submitted_at,
      }]
    }),
  ].sort((a, b) => a.openedAt.localeCompare(b.openedAt))

  const pending = rows.filter(r => r.appealedAt)
  const waiting = rows.filter(r => !r.appealedAt)
  const loadError = bansError ?? denialsError

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Appeals</h1>
        <p className="text-sm text-slate-400">{pending.length} waiting for review</p>
      </div>

      {loadError && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
          Couldn&apos;t load appeals: {loadError.message}
        </p>
      )}

      <p className="text-sm text-slate-400 mb-4">
        Decide each appeal before its deadline. On the deadline, a banned account is deleted and a cleaner with a denied
        background check is banned and deleted, whether or not they appealed.
      </p>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-8">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className={TH}>Name</th>
                <th className={TH}>Type</th>
                <th className={TH}>Reason</th>
                <th className={TH}>Appeal</th>
                <th className={TH}>Deadline</th>
                <th className={TH}>Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {pending.map(row => (
                <tr key={row.key} className="align-top">
                  <NameCell row={row} />
                  <TypeCell row={row} />
                  <td className="px-4 py-3 text-xs text-slate-500 max-w-48">{row.reason ?? '—'}</td>
                  <td className="px-4 py-3 max-w-md">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{row.appealMessage}</p>
                    {row.appealedAt && <p className="text-xs text-slate-400 mt-1">Sent {formatDate(row.appealedAt)}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{formatDate(appealDeadline(row.openedAt))}</td>
                  <td className="px-4 py-3">
                    <AppealDecision kind={row.kind} id={row.decisionId} name={row.name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pending.length === 0 && !loadError && (
            <div className="text-center py-12 text-slate-400 text-sm">No appeals waiting for review.</div>
          )}
        </div>
      </div>

      <h2 className="text-lg font-bold text-slate-900 mb-1">No appeal yet</h2>
      <p className="text-sm text-slate-400 mb-4">To lift a ban without an appeal, use Background Checks → Banned.</p>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className={TH}>Name</th>
                <th className={TH}>Type</th>
                <th className={TH}>Reason</th>
                <th className={TH}>Deadline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {waiting.map(row => (
                <tr key={row.key} className="align-top">
                  <NameCell row={row} />
                  <TypeCell row={row} />
                  <td className="px-4 py-3 text-xs text-slate-500 max-w-48">{row.reason ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{formatDate(appealDeadline(row.openedAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {waiting.length === 0 && !loadError && (
            <div className="text-center py-12 text-slate-400 text-sm">Nobody else is in an appeal window.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function NameCell({ row }: { row: Row }) {
  return (
    <td className="px-4 py-3">
      <p className="font-medium text-slate-800 whitespace-nowrap">{row.name}</p>
      <p className="text-xs text-slate-500">{row.email}</p>
    </td>
  )
}

function TypeCell({ row }: { row: Row }) {
  return (
    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
      {row.kind === 'ban' ? 'Ban' : 'Background check'}
      <span className="block text-slate-400">since {formatDate(row.openedAt)}</span>
    </td>
  )
}
