import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAvailableForBooking } from '@/lib/cleanerMatching'
import { PUSH_REQUIRED, pushSubscribedIds, withPushStatus } from '@/lib/pushRequirement'
import { ACCEPTANCE_RATE_THRESHOLD, getAllAcceptanceStats, isAcceptanceRateLow } from '@/lib/acceptanceRate'

// Approved Tidy Pros, and approved ones since paused, have been let into the app.
function isLetIn(cleanerStatus: string | null | undefined): boolean {
  return cleanerStatus === 'approved' || cleanerStatus === 'paused'
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

export default async function AdminOverviewPage() {
  const admin = createAdminClient()
  const sevenDaysAgo = daysAgoIso(7)

  const [
    { data: customers },
    { data: areas },
    { count: recentCount },
    { count: tidyProCount },
    { data: activationEvents },
    { data: unapprovedPros, error: tidyProWaitlistError },
    { data: approvedPros },
    { count: awayCount, error: awayError },
  ] = await Promise.all([
    admin.from('profiles').select('id, booking_access_status, suspended_at, banned_at').eq('role', 'USER'),
    admin.from('service_areas').select('id, name, status'),
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'USER').gte('created_at', sevenDaysAgo),
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'TIDYPRO'),
    admin.from('service_area_activation_events').select('*').order('created_at', { ascending: false }).limit(5),
    // Filtered down to the not-yet-approved ones below.
    admin
      .from('profiles')
      .select('id, tidypro_profiles(cleaner_status)')
      .eq('role', 'TIDYPRO')
      .neq('booking_access_status', 'denied')
      .is('suspended_at', null)
      .is('banned_at', null),
    // Prefiltered like customer search; isAvailableForBooking below applies the rest.
    admin
      .from('tidypro_profiles')
      .select('id, active_for_booking, cleaner_status, is_away, profile_photo_url, bio, availability, stripe_onboarding_completed, travel_radius_miles, services_provided, latitude, longitude')
      .eq('active_for_booking', true)
      .eq('cleaner_status', 'approved')
      .eq('is_away', false),
    // Tidy Pros who've set themselves to Away (same set as available=away on /admin/users).
    admin.from('tidypro_profiles').select('id', { count: 'exact', head: true }).eq('is_away', true),
  ])
  if (awayError) console.error('[Tydio] Counting away Tidy Pros failed:', awayError.message)

  // Every Tidy Pro not let into the app yet: still on the signup waitlist, or let in
  // but not yet approved as a cleaner. Denied, suspended and banned accounts aren't
  // waiting, so they're left out. Same set as the card's link (status=not_approved on
  // /admin/users). A failed count shows as "—" rather than a misleading 0.
  if (tidyProWaitlistError) console.error('[Tydio] Counting the Tidy Pro waitlist failed:', tidyProWaitlistError.message)
  const tidyProWaitlist = tidyProWaitlistError
    ? null
    : (unapprovedPros ?? []).filter((p) => {
        const tidyPro = Array.isArray(p.tidypro_profiles) ? p.tidypro_profiles[0] : p.tidypro_profiles
        return !isLetIn(tidyPro?.cleaner_status)
      }).length

  const lowAcceptanceCount = [...(await getAllAcceptanceStats(admin)).values()].filter(isAcceptanceRateLow).length

  const total = (customers ?? []).length
  const waitlisted = (customers ?? []).filter(u => u.booking_access_status === 'waitlisted').length
  // Waitlisted customers plus Tidy Pros not let in yet (status=all_waitlisted on /admin/users).
  const totalWaitlisted = tidyProWaitlist == null ? null : waitlisted + tidyProWaitlist
  // Tidy Pros who can receive bookings right now: every onboarding step done, the same
  // rules customer search uses (lib/cleanerMatching).
  const bookingAllowed = (await withPushStatus(admin, approvedPros ?? [])).filter(isAvailableForBooking).length
  // Customers who can book right now: let in, not suspended or banned, and (while it's
  // required) push turned on.
  const allowedCustomers = (customers ?? []).filter(
    u => u.booking_access_status === 'booking_allowed' && !u.suspended_at && !u.banned_at
  )
  const customersWithPush = PUSH_REQUIRED ? await pushSubscribedIds(admin, allowedCustomers.map(u => u.id)) : null
  const activeUsers = allowedCustomers.filter(u => !customersWithPush || customersWithPush.has(u.id)).length

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Overview</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard label="Total Customers" value={total} href="/admin/users?role=USER" />
        <StatCard label="Total Waitlisted" value={totalWaitlisted} color="amber" href="/admin/users?status=all_waitlisted" />
        <StatCard label="Active Users" value={activeUsers} color="teal" href="/admin/users?role=USER&status=booking_allowed" />
        <StatCard label="Tidy Pros" value={tidyProCount ?? 0} href="/admin/users?role=TIDYPRO" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Areas" value={(areas ?? []).length} href="/admin/service-areas" />
        <StatCard label="New Users (7d)" value={recentCount ?? 0} color="teal" href={`/admin/users?role=USER`} />
        <StatCard label="Tidy Pro Waitlist" value={tidyProWaitlist} color="amber" href="/admin/users?role=TIDYPRO&status=not_approved" />
        <StatCard label="Tidy Pros Away" value={awayError ? null : awayCount ?? 0} color="amber" href="/admin/users?role=TIDYPRO&available=away" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 -mt-4">
        <StatCard label="Booking Allowed" value={bookingAllowed} color="teal" href="/admin/users?role=TIDYPRO&available=yes" />
        <StatCard
          label={`Tidy Pros Below ${Math.round(ACCEPTANCE_RATE_THRESHOLD * 100)}% Acceptance`}
          value={lowAcceptanceCount}
          color="amber"
          href="/admin/users?role=TIDYPRO&acceptance=low"
        />
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
  value: number | null
  color?: 'teal' | 'amber'
  href: string
}) {
  const valueColor =
    color === 'teal' ? 'var(--color-brand)' : color === 'amber' ? '#f59e0b' : '#1a2332'
  return (
    <Link
      href={href}
      className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:border-slate-200 hover:shadow-md transition-all block"
    >
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{label}</p>
      <p className="text-3xl font-bold" style={{ color: valueColor }}>
        {value ?? '—'}
      </p>
    </Link>
  )
}
