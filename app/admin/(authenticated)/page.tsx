import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'

export default async function AdminOverviewPage() {
  const admin = createAdminClient()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { data: customers },
    { data: areas },
    { count: recentCount },
    { count: tidyProCount },
    { data: activationEvents },
  ] = await Promise.all([
    admin.from('profiles').select('booking_access_status').eq('role', 'USER'),
    admin.from('service_areas').select('id, name, status'),
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'USER').gte('created_at', sevenDaysAgo),
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'TIDYPRO'),
    admin.from('service_area_activation_events').select('*').order('created_at', { ascending: false }).limit(5),
  ])

  const total = (customers ?? []).length
  const waitlisted = (customers ?? []).filter(u => u.booking_access_status === 'waitlisted').length
  const bookingAllowed = (customers ?? []).filter(u => u.booking_access_status === 'booking_allowed').length
  const activeAreas = (areas ?? []).filter(a => a.status === 'beta_open').length

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Overview</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard label="Total Customers" value={total} href="/admin/users?role=USER" />
        <StatCard label="Waitlisted" value={waitlisted} color="amber" href="/admin/users?role=USER&status=waitlisted" />
        <StatCard label="Booking Allowed" value={bookingAllowed} color="teal" href="/admin/users?role=USER&status=booking_allowed" />
        <StatCard label="Tidy Pros" value={tidyProCount ?? 0} href="/admin/users?role=TIDYPRO" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Active Areas" value={activeAreas} color="teal" href="/admin/service-areas" />
        <StatCard label="Total Areas" value={(areas ?? []).length} href="/admin/service-areas" />
        <StatCard label="New Users (7d)" value={recentCount ?? 0} color="teal" href={`/admin/users?role=USER`} />
      </div>

      {(activationEvents ?? []).length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900 text-sm">Recent Activations</h2>
          </div>
          <ul className="divide-y divide-slate-50">
            {(activationEvents ?? []).map(event => (
              <li key={event.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {event.previous_status} → {event.new_status}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {event.users_notified_count} users notified
                  </p>
                </div>
                <p className="text-xs text-slate-400 flex-shrink-0">
                  {new Date(event.created_at).toLocaleDateString()}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  color,
  href,
}: {
  label: string
  value: number
  color?: 'teal' | 'amber'
  href: string
}) {
  const valueColor =
    color === 'teal' ? '#38C7CA' : color === 'amber' ? '#f59e0b' : '#1a2332'
  return (
    <Link
      href={href}
      className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:border-slate-200 hover:shadow-md transition-all block"
    >
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{label}</p>
      <p className="text-3xl font-bold" style={{ color: valueColor }}>
        {value}
      </p>
    </Link>
  )
}
