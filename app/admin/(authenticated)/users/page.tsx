import { createAdminClient } from '@/lib/supabase/admin'
import { backgroundCheckStage } from '@/lib/backgroundCheck'
import { FEE_REFUND_REASONS, feeStatusLabel, hasPaidFee } from '@/lib/backgroundCheckFee'
import { missingOnboardingSteps } from '@/lib/cleanerOnboarding'
import { withPushStatus } from '@/lib/pushRequirement'
import { ICA_VERSION } from '@/lib/legal/contractorAgreement'
import { grantAccessAction, denyAccessAction, revokeAccessAction, approveCleanerAction, pauseCleanerAction, refundBackgroundCheckFeeAction, resendSignedAgreementAction } from '../../actions'
import { BulkAccountActions, RowAccountActions, RowSelectCheckbox, SelectAllAccounts } from './AccountActions'
import { UserNote } from './UserNote'
import { FavoriteStar } from './FavoriteStar'
import { zipLocation } from '@/lib/zipLocation'
import { IconLeaf } from '@/app/components/IconLeaf'
import { IconMoon } from '@/app/components/IconMoon'
import { onboardingStatusLabel, remainingOnboardingActions } from '@/lib/onboardingProgress'
import { WEEKDAY_KEYS, formatCompactTime, isAvailableForBooking, type WeeklyAvailability } from '@/lib/cleanerMatching'
import Link from 'next/link'
import { ACCEPTANCE_RATE_THRESHOLD, NO_ACCEPTANCE_STATS, formatAcceptanceRate, getAcceptanceStats, getAllAcceptanceStats, isAcceptanceRateLow } from '@/lib/acceptanceRate'

const SUSPENDED_COLOR = '#ef4444'

const STATUS_COLORS: Record<string, string> = {
  booking_allowed: '#22c55e',
  waitlisted: '#f59e0b',
  paused: '#64748b',
  closed: '#ef4444',
  denied: '#ef4444',
}

const CLEANER_STATUS_COLORS: Record<string, string> = {
  approved: '#22c55e',
  applied: '#f59e0b',
  paused: '#64748b',
}

// background_checks.status is a pre-existing check constraint allowing only
// pending/in_review/passed/failed/expired.
function withDate(label: string, iso: string | null): string {
  if (!iso) return label
  return `${label} (${new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`
}

function backgroundCheckBadge(
  check:
    | {
        status: string
        requested_at: string | null
        link_sent_at: string | null
        submitted_at: string | null
        completed_at: string | null
      }
    | undefined
): { label: string; color: string } {
  if (!check) return { label: '—', color: '#cbd5e1' }
  if (check.status === 'in_review') return { label: 'Needs review', color: '#ef4444' }
  switch (backgroundCheckStage(check)) {
    case 'passed':
      return { label: withDate('Passed', check.completed_at), color: '#22c55e' }
    case 'failed':
      return { label: withDate('Rejected', check.completed_at), color: '#ef4444' }
    case 'pending':
      return { label: withDate('Submitted · awaiting result', check.submitted_at), color: '#f59e0b' }
    case 'link_sent':
      return { label: withDate('Form sent', check.link_sent_at), color: '#f59e0b' }
    case 'needs_link':
      return { label: withDate('Needs form sent', check.requested_at), color: '#ef4444' }
    default:
      return { label: 'Not started', color: '#64748b' }
  }
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; role?: string; status?: string; verified?: string; state?: string; city?: string; organic?: string; acceptance?: string; available?: string; favorite?: string }>
}) {
  const { search = '', role = '', status = '', verified = '', state = '', city = '', organic = '', acceptance = '', available = '', favorite = '' } = await searchParams
  const admin = createAdminClient()
  const locations = await userLocations(admin)
  // City options are "City, ST" so two same-named cities stay distinct.
  const cityFilter = parseCityOption(city)
  const cityOptions = locations.filter((l) => !state || l.state === state)
  const stateOptions = [...new Set(locations.map((l) => l.state))]

  let query = admin
    .from('profiles')
    .select('id, first_name, last_name, email, phone, street_address, city, state, zip_code, role, booking_access_status, email_verified_at, suspended_at, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(200)

  if (search) {
    // Users whose admin note mentions the search also match.
    const { data: noteMatches } = await admin
      .from('admin_user_notes')
      .select('profile_id')
      .ilike('note', `%${search}%`)
      .limit(200)
    const noteMatchIds = (noteMatches ?? []).map((n) => n.profile_id)
    query = query.or(
      [
        `email.ilike.%${search}%`,
        `first_name.ilike.%${search}%`,
        `last_name.ilike.%${search}%`,
        `zip_code.ilike.%${search}%`,
        `city.ilike.%${search}%`,
        `phone.ilike.%${search}%`,
        ...(noteMatchIds.length ? [`id.in.(${noteMatchIds.join(',')})`] : []),
      ].join(',')
    )
  }
  if (role) query = query.eq('role', role as 'USER' | 'TIDYPRO' | 'ADMIN')
  if (status === 'suspended') query = query.not('suspended_at', 'is', null)
  else if (status === 'not_approved' || status === 'all_waitlisted') {
    // Tidy Pros not let into the app yet (the Overview's Tidy Pro Waitlist card):
    // anyone not approved (or approved then paused), less denied/suspended/banned.
    // all_waitlisted adds waitlisted customers (the Overview's Total Waitlisted card).
    const { data: letIn, error: letInError } = await admin
      .from('tidypro_profiles')
      .select('id')
      .in('cleaner_status', ['approved', 'paused'])
    if (letInError) throw new Error(`Failed to load approved Tidy Pros: ${letInError.message}`)
    const letInIds = (letIn ?? []).map((p) => p.id)
    const proConditions = [
      'role.eq.TIDYPRO',
      'booking_access_status.neq.denied',
      'suspended_at.is.null',
      'banned_at.is.null',
      ...(letInIds.length ? [`id.not.in.(${letInIds.join(',')})`] : []),
    ].join(',')
    query =
      status === 'all_waitlisted'
        ? query.or(`and(role.eq.USER,booking_access_status.eq.waitlisted),and(${proConditions})`)
        : query.or(`and(${proConditions})`)
  } else if (status) query = query.eq('booking_access_status', status as 'waitlisted' | 'booking_allowed' | 'paused' | 'closed')
  if (verified === 'yes') query = query.not('email_verified_at', 'is', null)
  if (verified === 'no') query = query.is('email_verified_at', null)
  if (state) query = query.eq('state', state)
  if (cityFilter) query = query.eq('city', cityFilter.city).eq('state', cityFilter.state)
  if (organic === 'yes') {
    // The setting lives on tidypro_profiles, so this narrows to Tidy Pros who ticked it.
    const { data: organicPros, error: organicError } = await admin
      .from('tidypro_profiles')
      .select('id')
      .eq('uses_organic_products', true)
    if (organicError) throw new Error(`Failed to load organic Tidy Pros: ${organicError.message}`)
    const organicIds = (organicPros ?? []).map((p) => p.id)
    // An empty list would make .in() match nothing in an invalid way, so use an id no profile has.
    query = query.eq('role', 'TIDYPRO').in('id', organicIds.length ? organicIds : ['00000000-0000-0000-0000-000000000000'])
  }

  if (acceptance === 'low') {
    const lowIds = [...(await getAllAcceptanceStats(admin))].filter(([, stats]) => isAcceptanceRateLow(stats)).map(([id]) => id)
    query = query.eq('role', 'TIDYPRO').in('id', lowIds.length ? lowIds : ['00000000-0000-0000-0000-000000000000'])
  }

  if (favorite === 'yes') {
    const { data: favorites, error: favoritesError } = await admin.from('admin_favorite_tidy_pros').select('pro_id')
    if (favoritesError) throw new Error(`Failed to load favorite Tidy Pros: ${favoritesError.message}`)
    const favoriteIds = (favorites ?? []).map((f) => f.pro_id)
    // An empty list would make .in() match nothing in an invalid way, so use an id no profile has.
    query = query.eq('role', 'TIDYPRO').in('id', favoriteIds.length ? favoriteIds : ['00000000-0000-0000-0000-000000000000'])
  }

  if (available === 'away') {
    const { data: awayPros, error: awayError } = await admin.from('tidypro_profiles').select('id').eq('is_away', true)
    if (awayError) throw new Error(`Failed to load away Tidy Pros: ${awayError.message}`)
    const awayIds = (awayPros ?? []).map((p) => p.id)
    // An empty list would make .in() match nothing in an invalid way, so use an id no profile has.
    query = query.eq('role', 'TIDYPRO').in('id', awayIds.length ? awayIds : ['00000000-0000-0000-0000-000000000000'])
  }

  if (available === 'yes' || available === 'no') {
    // Worked out the same way customer search decides who's bookable (lib/cleanerMatching).
    const { data: pros, error: prosError } = await admin
      .from('tidypro_profiles')
      .select('id, active_for_booking, cleaner_status, is_away, profile_photo_url, bio, availability, stripe_onboarding_completed, travel_radius_miles, services_provided, latitude, longitude')
      .eq('active_for_booking', true)
      .eq('cleaner_status', 'approved')
      .eq('is_away', false)
    if (prosError) throw new Error(`Failed to load Tidy Pro availability: ${prosError.message}`)
    const availableIds = (await withPushStatus(admin, pros ?? [])).filter(isAvailableForBooking).map((p) => p.id)
    query = query.eq('role', 'TIDYPRO')
    if (available === 'yes') query = query.in('id', availableIds.length ? availableIds : ['00000000-0000-0000-0000-000000000000'])
    else if (availableIds.length) query = query.not('id', 'in', `(${availableIds.join(',')})`)
  }

  const { data: users, error: usersError, count: userCount } = await query
  const hasFilters = search || role || status || verified || state || city || organic || acceptance || available || favorite

  const cleanerIds = (users ?? []).filter((u) => u.role === 'TIDYPRO').map((u) => u.id)
  const { data: cleanerProfiles } = cleanerIds.length
    ? await admin
        .from('tidypro_profiles')
        .select('id, cleaner_status, active_for_booking, is_away, profile_photo_url, bio, availability, stripe_onboarding_completed, travel_radius_miles, services_provided, latitude, longitude, phone, street_address, city, state, zip_code, uses_organic_products, time_off')
        .in('id', cleanerIds)
    : { data: [] }
  const cleanerById = new Map((await withPushStatus(admin, cleanerProfiles ?? [])).map((c) => [c.id, c]))
  const acceptanceByProId = await getAcceptanceStats(admin, cleanerIds)
  const { data: favoriteRows } = cleanerIds.length
    ? await admin.from('admin_favorite_tidy_pros').select('pro_id').in('pro_id', cleanerIds)
    : { data: [] }
  const favoriteProIds = new Set((favoriteRows ?? []).map((f) => f.pro_id))

  // A customer's default saved address, else their first one.
  const customerIds = (users ?? []).filter((u) => u.role === 'USER').map((u) => u.id)
  const { data: savedAddresses } = customerIds.length
    ? await admin
        .from('user_addresses')
        .select('user_id, street_address, unit_number, city, state, zip_code, is_default')
        .in('user_id', customerIds)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true })
    : { data: [] }
  const addressByUserId = new Map<string, NonNullable<typeof savedAddresses>[number]>()
  for (const a of savedAddresses ?? []) if (!addressByUserId.has(a.user_id)) addressByUserId.set(a.user_id, a)

  const { data: backgroundChecks } = cleanerIds.length
    ? await admin
        .from('background_checks')
        .select('pro_id, status, requested_at, link_sent_at, submitted_at, completed_at, fee_paid_at, fee_amount_cents, fee_refunded_at, fee_refund_reason')
        .in('pro_id', cleanerIds)
    : { data: [] }
  const backgroundCheckByProId = new Map((backgroundChecks ?? []).map((b) => [b.pro_id, b]))

  const { data: signatures } = cleanerIds.length
    ? await admin
        .from('agreement_signatures')
        .select('id, pro_id, signed_at, emailed_at')
        .eq('agreement_version', ICA_VERSION)
        .in('pro_id', cleanerIds)
    : { data: [] }
  const signatureByProId = new Map((signatures ?? []).map((s) => [s.pro_id, s]))

  // Banned from this page and still inside the appeal process (see lib/banAccount).
  const userIds = (users ?? []).map((u) => u.id)
  const { data: activeBans } = userIds.length
    ? await admin
        .from('banned_users')
        .select('former_profile_id, banned_at, appeal_submitted_at, appeal_denied_at')
        .in('former_profile_id', userIds)
        .is('account_deleted_at', null)
    : { data: [] }
  const banByProfileId = new Map((activeBans ?? []).map((b) => [b.former_profile_id, b]))

  const { data: notes } = userIds.length
    ? await admin.from('admin_user_notes').select('profile_id, note').in('profile_id', userIds)
    : { data: [] }
  const noteByProfileId = new Map((notes ?? []).map((n) => [n.profile_id, n.note]))

  const { data: deletedAccounts } = await admin
    .from('deleted_accounts')
    .select('id, email, first_name, last_name, role, deleted_at')
    .order('deleted_at', { ascending: false })
    .limit(200)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Users</h1>
      </div>

      {/* Filters */}
      <form method="get" className="flex flex-wrap gap-2 mb-4 items-center">
        <input
          aria-label="Search users"
          name="search"
          defaultValue={search}
          placeholder="Search name, email, phone, city, ZIP, note…"
          className="w-60 px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand transition-colors"
        />
        <select
          aria-label="Filter by role"
          name="role"
          defaultValue={role}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-brand"
        >
          <option value="">All roles</option>
          <option value="USER">Customer</option>
          <option value="TIDYPRO">Tidy Pro</option>
          <option value="ADMIN">Admin</option>
        </select>
        <select
          aria-label="Filter by status"
          name="status"
          defaultValue={status}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-brand"
        >
          <option value="">All statuses</option>
          <option value="waitlisted">Waitlisted</option>
          <option value="booking_allowed">Booking Allowed</option>
          <option value="paused">Paused</option>
          <option value="closed">Closed</option>
          <option value="denied">Denied</option>
          <option value="suspended">Suspended</option>
          <option value="not_approved">Tidy Pros not let in yet</option>
          <option value="all_waitlisted">All waitlisted (customers + Tidy Pros)</option>
        </select>
        <select
          aria-label="Filter by verified"
          name="verified"
          defaultValue={verified}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-brand"
        >
          <option value="">All verified</option>
          <option value="yes">Email verified</option>
          <option value="no">Not verified</option>
        </select>
        <select
          aria-label="Filter by organic products"
          name="organic"
          defaultValue={organic}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-brand"
        >
          <option value="">All products</option>
          <option value="yes">Uses organic products</option>
        </select>
        <select
          aria-label="Filter by acceptance rate"
          name="acceptance"
          defaultValue={acceptance}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-brand"
        >
          <option value="">All acceptance rates</option>
          <option value="low">Below {Math.round(ACCEPTANCE_RATE_THRESHOLD * 100)}% acceptance</option>
        </select>
        <select
          aria-label="Filter by favorites"
          name="favorite"
          defaultValue={favorite}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-brand"
        >
          <option value="">All Tidy Pros</option>
          <option value="yes">★ Favorites</option>
        </select>
        <select
          aria-label="Filter by availability for bookings"
          name="available"
          defaultValue={available}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-brand"
        >
          <option value="">All availability</option>
          <option value="yes">Available for bookings</option>
          <option value="no">Not available for bookings</option>
          <option value="away">Away</option>
        </select>
        <select
          aria-label="Filter by state"
          name="state"
          defaultValue={state}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-brand"
        >
          <option value="">All states</option>
          {stateOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          aria-label="Filter by city"
          name="city"
          defaultValue={city}
          className="max-w-56 px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-brand"
        >
          <option value="">All cities</option>
          {cityOptions.map((l) => {
            const value = `${l.city}, ${l.state}`
            return <option key={value} value={value}>{value}</option>
          })}
        </select>
        <button
          type="submit"
          className="px-4 py-2 rounded-xl text-white text-sm font-semibold"
          style={{ backgroundColor: 'var(--color-brand)' }}
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

      {usersError && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
          Couldn&apos;t load users: {usersError.message}
        </p>
      )}

      <BulkAccountActions />

      {/* The count is every matching user; the table only loads the newest 200. */}
      <p className="text-sm font-semibold text-slate-700 mb-2">
        {(userCount ?? (users ?? []).length).toLocaleString()} {(userCount ?? (users ?? []).length) === 1 ? 'user' : 'users'}
        {hasFilters ? ' matching filters' : ''}
        {userCount != null && userCount > (users ?? []).length && (
          <span className="font-normal text-slate-400"> · showing newest {(users ?? []).length}</span>
        )}
      </p>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className="pl-4 py-3 w-8">
                  <SelectAllAccounts />
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Name</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">City</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">State</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Email</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Phone</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Address</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Role</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Availability</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Onboarding Left</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Background Check</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Acceptance</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Verified</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Joined</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Note</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(users ?? []).map(user => {
                // A Tidy Pro still on (or turned down from) the signup waitlist hasn't
                // started onboarding, so show that status rather than their cleaner status.
                const cleanerWaitlisted =
                  user.role === 'TIDYPRO' && (user.booking_access_status === 'waitlisted' || user.booking_access_status === 'denied')
                const cleaner = user.role === 'TIDYPRO' && !cleanerWaitlisted ? cleanerById.get(user.id) : undefined
                const ban = banByProfileId.get(user.id)
                const statusColor = ban || user.suspended_at
                  ? SUSPENDED_COLOR
                  : cleaner
                  ? CLEANER_STATUS_COLORS[cleaner.cleaner_status ?? 'applied'] ?? '#64748b'
                  : STATUS_COLORS[user.booking_access_status ?? 'waitlisted'] ?? '#64748b'
                const statusLabel = ban
                  ? ban.appeal_denied_at
                    ? 'banned · appeal denied'
                    : ban.appeal_submitted_at
                    ? 'banned · appeal to review'
                    : withDate('banned', ban.banned_at)
                  : user.suspended_at
                  ? withDate('suspended', user.suspended_at)
                  : cleaner && (cleaner.cleaner_status === 'approved' || cleaner.cleaner_status === 'paused')
                  ? `${cleaner.cleaner_status}${!cleaner.active_for_booking ? ' · not bookable' : cleaner.is_away ? ' · away' : missingOnboardingSteps(cleaner).length > 0 ? ' · onboarding incomplete' : ''}`
                  : user.role === 'TIDYPRO'
                  ? onboardingStatusLabel({ bookingAccessStatus: user.booking_access_status, backgroundCheck: backgroundCheckByProId.get(user.id) })
                  : user.booking_access_status ?? '—'
                const name =
                  [user.first_name, user.last_name].filter(Boolean).join(' ') || '—'
                const bgCheck = user.role === 'TIDYPRO' ? backgroundCheckByProId.get(user.id) : undefined
                const bgCheckBadge = backgroundCheckBadge(bgCheck)
                // Tidy Pros keep their phone and address on tidypro_profiles (cleaner is
                // unset while they're waitlisted, so look them up directly).
                const proProfile = user.role === 'TIDYPRO' ? cleanerById.get(user.id) : undefined
                const saved = addressByUserId.get(user.id)
                const phone = proProfile?.phone ?? user.phone
                const address = proProfile?.street_address
                  ? [proProfile.street_address, proProfile.city, proProfile.state, proProfile.zip_code]
                  : saved
                  ? [[saved.street_address, saved.unit_number].filter(Boolean).join(' '), saved.city, saved.state, saved.zip_code]
                  : [user.street_address, proProfile?.zip_code ?? user.zip_code]
                const addressText = address.filter(Boolean).join(', ')
                // From their signup ZIP. Looked up here too, so accounts the
                // backfill hasn't reached yet still show one.
                const location = user.city && user.state ? { city: user.city, state: user.state } : zipLocation(user.zip_code)
                return (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                    <td className="pl-4 py-3">
                      {user.role !== 'ADMIN' && <RowSelectCheckbox profileId={user.id} label={name} />}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        {user.role === 'TIDYPRO' && (
                          <FavoriteStar key={`${user.id}-${favoriteProIds.has(user.id)}`} proId={user.id} name={name} initialFavorite={favoriteProIds.has(user.id)} />
                        )}
                        {user.role === 'TIDYPRO' && proProfile ? (
                          <Link href={`/admin/tidy-pros/${user.id}`} className="underline hover:text-slate-950">
                            {name}
                          </Link>
                        ) : (
                          name
                        )}
                        {proProfile?.is_away && <IconMoon size={14} title="Away — not taking bookings" />}
                        {proProfile?.uses_organic_products && <IconLeaf size={14} title="Uses organic cleaning products" />}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{location?.city ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{location?.state ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{user.email}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {phone ? <a href={`tel:${phone}`} className="underline">{phone}</a> : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 min-w-48">{addressText || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{user.role}</td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                        style={{ color: statusColor, backgroundColor: `${statusColor}1a` }}
                      >
                        {statusLabel}
                      </span>
                      {user.role === 'TIDYPRO' && (() => {
                        const signature = signatureByProId.get(user.id)
                        if (!signature) return <p className="text-xs text-slate-400 mt-1 whitespace-nowrap">Agreement not signed</p>
                        return (
                          <div className="mt-1 text-xs whitespace-nowrap">
                            <a href={`/admin/agreements/${signature.id}`} target="_blank" rel="noopener noreferrer" className="text-slate-500 underline">
                              Agreement signed {new Date(signature.signed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </a>
                            {!signature.emailed_at && (
                              <form action={resendSignedAgreementAction.bind(null, signature.id)} className="inline ml-1">
                                <button type="submit" className="text-amber-600 underline">Email failed, resend</button>
                              </form>
                            )}
                          </div>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {proProfile && (
                        <div className="flex items-start gap-2">
                          {isAvailableForBooking(proProfile) && (
                            <span
                              role="img"
                              aria-label="Available for bookings"
                              title="Available for bookings"
                              className="inline-block w-2.5 h-2.5 rounded-full bg-green-500 mt-1 flex-shrink-0"
                            />
                          )}
                          <WeeklyHours
                            availability={(proProfile.availability as WeeklyAvailability | null) ?? {}}
                            away={proProfile.is_away}
                            hasTimeOff={Array.isArray(proProfile.time_off) && proProfile.time_off.length > 0}
                            profileHref={`/admin/tidy-pros/${user.id}`}
                          />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top min-w-48">
                      {user.role === 'TIDYPRO' && (() => {
                        const remaining = remainingOnboardingActions({
                          bookingAccessStatus: user.booking_access_status,
                          cleanerStatus: proProfile?.cleaner_status ?? null,
                          hasSignedAgreement: signatureByProId.has(user.id),
                          backgroundCheck: bgCheck,
                          profile: proProfile,
                        })
                        if (remaining.length === 0) return <span className="text-xs font-semibold text-green-600">✓ Done</span>
                        return (
                          <ul className="text-xs text-slate-500 list-disc pl-4 space-y-0.5">
                            {remaining.map((step) => (
                              <li key={step} className={step.endsWith('(Tydio)') ? 'text-amber-600 font-medium' : undefined}>{step}</li>
                            ))}
                          </ul>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      {user.role === 'TIDYPRO' && (
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                          style={{ color: bgCheckBadge.color, backgroundColor: `${bgCheckBadge.color}1a` }}
                        >
                          {bgCheckBadge.label}
                        </span>
                      )}
                      {user.role === 'TIDYPRO' && (
                        <p className="text-xs text-slate-400 mt-1 whitespace-nowrap">
                          {feeStatusLabel(bgCheck)}
                        </p>
                      )}
                      {hasPaidFee(bgCheck) && (
                        <form action={refundBackgroundCheckFeeAction.bind(null, user.id)} className="flex items-center gap-1 mt-1">
                          <select name="reason" required defaultValue="" aria-label="Refund reason" className="text-xs text-slate-500 border border-slate-200 rounded-lg px-1 py-0.5 max-w-[130px]">
                            <option value="" disabled>Refund reason</option>
                            {Object.entries(FEE_REFUND_REASONS).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                          <button type="submit" className="text-xs font-medium text-slate-500 border border-slate-200 px-2 py-0.5 rounded-lg hover:bg-slate-50">
                            Refund
                          </button>
                        </form>
                      )}
                      {user.role === 'TIDYPRO' && bgCheck && (
                        <a href="/admin/background-checks" className="block text-xs text-slate-500 underline mt-1">
                          Manage
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {user.role === 'TIDYPRO' && (() => {
                        const stats = acceptanceByProId.get(user.id) ?? NO_ACCEPTANCE_STATS
                        const answered = stats.accepted + stats.declined
                        const low = isAcceptanceRateLow(stats)
                        return (
                          <>
                            <span className={`text-xs font-semibold ${low ? 'text-red-600' : 'text-slate-700'}`}>
                              {formatAcceptanceRate(stats)}
                            </span>
                            <p className="text-xs text-slate-400 mt-1">
                              {answered === 0 ? 'No requests answered' : `${stats.declined} of ${answered} declined`}
                            </p>
                          </>
                        )
                      })()}
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
                    <td className="px-4 py-3 align-top">
                      <UserNote profileId={user.id} name={name} note={noteByProfileId.get(user.id) ?? ''} />
                    </td>
                    <td className="px-4 py-3">
                      {!user.suspended_at && user.role === 'USER' && (
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
                          <WaitlistDecision profileId={user.id} canDeny={user.booking_access_status === 'waitlisted'} />
                        )
                      )}
                      {!user.suspended_at && cleanerWaitlisted && (
                        <WaitlistDecision profileId={user.id} canDeny={user.booking_access_status === 'waitlisted'} />
                      )}
                      {!user.suspended_at && user.role === 'TIDYPRO' && !cleanerWaitlisted && (
                        cleaner?.active_for_booking ? (
                          <form action={pauseCleanerAction.bind(null, user.id)}>
                            <button
                              type="submit"
                              title="Don't use Pause to reject someone over a screening result. Use the Background Checks tab, after Checkr's adverse action process."
                              className="text-xs font-medium text-slate-500 border border-slate-200 px-2.5 py-1 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
                            >
                              Pause
                            </button>
                          </form>
                        ) : (
                          <form action={approveCleanerAction.bind(null, user.id)}>
                            <button
                              type="submit"
                              className="text-xs font-semibold px-2.5 py-1 rounded-lg text-white transition-opacity hover:opacity-90"
                              style={{ backgroundColor: 'var(--color-brand)' }}
                            >
                              Approve
                            </button>
                          </form>
                        )
                      )}
                      {user.role !== 'ADMIN' && (
                        <RowAccountActions profileId={user.id} name={name} suspended={Boolean(user.suspended_at)} banned={Boolean(ban)} />
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

      <DeletedAccounts accounts={deletedAccounts ?? []} />
    </div>
  )
}

// Every city/state pair among users, worked out from their ZIP at signup
// (lib/zipLocation.ts), sorted by state then city. Paged because PostgREST caps
// a response at 1,000 rows.
const DAY_SHORT: Record<string, string> = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' }

// A Tidy Pro's weekly hours, one line per day they work. Time off is on their profile page.
function WeeklyHours({
  availability,
  away,
  hasTimeOff,
  profileHref,
}: {
  availability: WeeklyAvailability
  away: boolean
  hasTimeOff: boolean
  profileHref: string
}) {
  const days = WEEKDAY_KEYS.filter((day) => (availability[day] ?? []).length > 0)
  return (
    <div className="text-xs text-slate-500 whitespace-nowrap">
      {away && <p className="font-semibold text-amber-600">Away</p>}
      {days.length === 0 ? (
        <p className="text-slate-400">No hours set</p>
      ) : (
        <ul className="space-y-0.5">
          {days.map((day) => (
            <li key={day}>
              <span className="font-medium text-slate-700">{DAY_SHORT[day]}</span>{' '}
              {(availability[day] ?? []).map((r) => `${formatCompactTime(r.start)}–${formatCompactTime(r.end)}`).join(', ')}
            </li>
          ))}
        </ul>
      )}
      {hasTimeOff && (
        <Link href={profileHref} className="block mt-1 text-slate-500 underline">
          Has time off
        </Link>
      )}
    </div>
  )
}

async function userLocations(admin: ReturnType<typeof createAdminClient>): Promise<{ city: string; state: string }[]> {
  const seen = new Map<string, { city: string; state: string }>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from('profiles')
      .select('city, state')
      .not('city', 'is', null)
      .not('state', 'is', null)
      .order('id')
      .range(from, from + 999)
    if (error) {
      console.error('[Tydio] Loading user locations failed:', error.message)
      break
    }
    for (const row of data) if (row.city && row.state) seen.set(`${row.city}, ${row.state}`, { city: row.city, state: row.state })
    if (data.length < 1000) break
  }
  return [...seen.values()].sort((a, b) => a.state.localeCompare(b.state) || a.city.localeCompare(b.city))
}

function parseCityOption(value: string): { city: string; state: string } | null {
  const at = value.lastIndexOf(', ')
  if (at <= 0) return null
  return { city: value.slice(0, at), state: value.slice(at + 2) }
}

// Accounts deleted from this page. They're gone from the database; this is the log
// kept in deleted_accounts.
function DeletedAccounts({
  accounts,
}: {
  accounts: { id: string; email: string; first_name: string | null; last_name: string | null; role: string; deleted_at: string }[]
}) {
  return (
    <section className="mt-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-900">Deleted Accounts</h2>
        <p className="text-sm text-slate-400">{accounts.length} shown</p>
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Name</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Email</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Role</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Deleted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {accounts.map(account => (
                <tr key={account.id}>
                  <td className="px-4 py-3 font-medium text-slate-500 whitespace-nowrap">
                    {[account.first_name, account.last_name].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{account.email}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{account.role}</td>
                  <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                    {new Date(account.deleted_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {accounts.length === 0 && (
            <div className="text-center py-12 text-slate-400 text-sm">No deleted accounts yet.</div>
          )}
        </div>
      </div>
    </section>
  )
}

// Grant Access, plus Deny for someone still waiting. A denied account only
// gets Grant Access, to reverse the decision.
function WaitlistDecision({ profileId, canDeny }: { profileId: string; canDeny: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <form action={grantAccessAction.bind(null, profileId)}>
        <button
          type="submit"
          className="text-xs font-semibold px-2.5 py-1 rounded-lg text-white transition-opacity hover:opacity-90 whitespace-nowrap"
          style={{ backgroundColor: 'var(--color-brand)' }}
        >
          Grant Access
        </button>
      </form>
      {canDeny && (
        <form action={denyAccessAction.bind(null, profileId)}>
          <button
            type="submit"
            className="text-xs font-medium text-slate-500 border border-slate-200 px-2.5 py-1 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
          >
            Deny
          </button>
        </form>
      )}
    </div>
  )
}
