'use client'

import { useMemo, useState } from 'react'
import type { PushRecipient } from '@/lib/adminPush'

type RoleFilter = 'all' | 'USER' | 'TIDYPRO'
type SortOrder = 'newest' | 'oldest' | 'name'

const ROLE_FILTERS: { value: RoleFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'USER', label: 'Customers' },
  { value: 'TIDYPRO', label: 'Tidy Pros' },
]

function displayName(r: PushRecipient): string {
  return [r.firstName, r.lastName].filter(Boolean).join(' ')
}

export default function SubscriberList({ recipients }: { recipients: PushRecipient[] }) {
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<RoleFilter>('all')
  const [sort, setSort] = useState<SortOrder>('newest')

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = recipients.filter(
      (r) =>
        (role === 'all' || r.role === role) &&
        (!q || `${displayName(r)} ${r.email}`.toLowerCase().includes(q))
    )
    return rows.sort((a, b) => {
      if (sort === 'name') return (displayName(a) || a.email).localeCompare(displayName(b) || b.email)
      const diff = a.subscribedAt.localeCompare(b.subscribedAt)
      return sort === 'newest' ? -diff : diff
    })
  }, [recipients, search, role, sort])

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col min-h-0">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-semibold text-slate-900 text-sm">Subscribed</h2>
        <span className="text-xs text-slate-400">
          {visible.length === recipients.length ? recipients.length : `${visible.length} of ${recipients.length}`}
        </span>
      </div>

      <input
        type="search"
        aria-label="Search subscribers"
        placeholder="Search by name or email"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-brand transition-colors mb-2"
      />

      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <div className="flex gap-1" role="group" aria-label="Filter by role">
          {ROLE_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={role === f.value}
              onClick={() => setRole(f.value)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                role === f.value ? 'border-brand text-slate-900 bg-slate-50' : 'border-slate-200 text-slate-500'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          aria-label="Sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOrder)}
          className="px-2 py-1 rounded-lg border border-slate-200 text-xs bg-white focus:outline-none focus:border-brand"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>

      <ul className="overflow-y-auto max-h-[70vh] rounded-lg border border-slate-100 divide-y divide-slate-100">
        {visible.length === 0 ? (
          <li className="p-4 text-sm text-slate-400">
            {recipients.length === 0 ? 'Nobody has turned on push notifications yet.' : 'No one matches.'}
          </li>
        ) : (
          visible.map((r) => (
            <li key={r.id} className="px-3 py-2.5 flex items-center gap-3 text-sm">
              <span className="flex-1 min-w-0">
                <span className="block text-slate-900 truncate">{displayName(r) || r.email}</span>
                {displayName(r) && <span className="block text-xs text-slate-400 truncate">{r.email}</span>}
              </span>
              <span className="text-right flex-shrink-0">
                <span
                  className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    r.role === 'TIDYPRO' ? 'bg-violet-50 text-violet-700' : 'bg-sky-50 text-sky-700'
                  }`}
                >
                  {r.role === 'TIDYPRO' ? 'Tidy Pro' : 'Customer'}
                </span>
                <span className="block text-xs text-slate-400 mt-0.5">
                  {r.devices} {r.devices === 1 ? 'device' : 'devices'}
                  {r.subscribedAt && ` · since ${new Date(r.subscribedAt).toLocaleDateString()}`}
                </span>
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
