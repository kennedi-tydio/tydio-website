import { createAdminClient } from '@/lib/supabase/admin'
import { grantAccessAction, revokeAccessAction } from '../../actions'

const STATUS_COLORS: Record<string, string> = {
  booking_allowed: '#22c55e',
  waitlisted: '#f59e0b',
  paused: '#64748b',
  closed: '#ef4444',
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; role?: string; status?: string; verified?: string }>
}) {
  const { search = '', role = '', status = '', verified = '' } = await searchParams
  const admin = createAdminClient()

  let query = admin
    .from('profiles')
    .select('id, first_name, last_name, email, zip_code, role, booking_access_status, email_verified_at, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  if (search) {
    query = query.or(
      `email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,zip_code.ilike.%${search}%`
    )
  }
  if (role) query = query.eq('role', role as 'USER' | 'TIDYPRO' | 'ADMIN')
  if (status) query = query.eq('booking_access_status', status as 'waitlisted' | 'booking_allowed' | 'paused' | 'closed')
  if (verified === 'yes') query = query.not('email_verified_at', 'is', null)
  if (verified === 'no') query = query.is('email_verified_at', null)

  const { data: users } = await query
  const hasFilters = search || role || status || verified

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Users</h1>
        <p className="text-sm text-slate-400">{(users ?? []).length} shown</p>
      </div>

      {/* Filters */}
      <form method="get" className="flex flex-wrap gap-2 mb-4 items-center">
        <input
          name="search"
          defaultValue={search}
          placeholder="Search name, email, ZIP…"
          className="w-60 px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-[#38C7CA] transition-colors"
        />
        <select
          name="role"
          defaultValue={role}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-[#38C7CA]"
        >
          <option value="">All roles</option>
          <option value="USER">Customer</option>
          <option value="TIDYPRO">Tidy Pro</option>
          <option value="ADMIN">Admin</option>
        </select>
        <select
          name="status"
          defaultValue={status}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-[#38C7CA]"
        >
          <option value="">All statuses</option>
          <option value="waitlisted">Waitlisted</option>
          <option value="booking_allowed">Booking Allowed</option>
          <option value="paused">Paused</option>
          <option value="closed">Closed</option>
        </select>
        <select
          name="verified"
          defaultValue={verified}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-[#38C7CA]"
        >
          <option value="">All verified</option>
          <option value="yes">Email verified</option>
          <option value="no">Not verified</option>
        </select>
        <button
          type="submit"
          className="px-4 py-2 rounded-xl text-white text-sm font-semibold"
          style={{ backgroundColor: '#38C7CA' }}
        >
          Filter
        </button>
        {hasFilters && (
          <a
            href="/admin/users"
            className="px-3 py-2 rounded-xl text-sm text-slate-400 hover:text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            Clear
          </a>
        )}
      </form>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Name</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Email</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">ZIP</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Role</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Verified</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Joined</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(users ?? []).map(user => {
                const statusColor =
                  STATUS_COLORS[user.booking_access_status ?? 'waitlisted'] ?? '#64748b'
                const name =
                  [user.first_name, user.last_name].filter(Boolean).join(' ') || '—'
                return (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                      {name}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{user.email}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {user.zip_code ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{user.role}</td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                        style={{ color: statusColor, backgroundColor: `${statusColor}1a` }}
                      >
                        {user.booking_access_status ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {user.email_verified_at ? (
                        <span className="text-xs font-semibold text-green-600">✓ Yes</span>
                      ) : (
                        <span className="text-xs text-slate-300">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {user.role === 'USER' && (
                        user.booking_access_status === 'booking_allowed' ? (
                          <form action={revokeAccessAction.bind(null, user.id)}>
                            <button
                              type="submit"
                              className="text-xs font-medium text-slate-500 border border-slate-200 px-2.5 py-1 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
                            >
                              Revoke
                            </button>
                          </form>
                        ) : (
                          <form action={grantAccessAction.bind(null, user.id)}>
                            <button
                              type="submit"
                              className="text-xs font-semibold px-2.5 py-1 rounded-lg text-white transition-opacity hover:opacity-90"
                              style={{ backgroundColor: '#38C7CA' }}
                            >
                              Grant Access
                            </button>
                          </form>
                        )
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {(users ?? []).length === 0 && (
            <div className="text-center py-12 text-slate-400 text-sm">
              {hasFilters ? 'No users match your filters.' : 'No users yet.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
