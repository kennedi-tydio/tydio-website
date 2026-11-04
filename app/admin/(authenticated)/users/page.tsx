import { createAdminClient } from '@/lib/supabase/admin'
import { backgroundCheckStage } from '@/lib/backgroundCheck'
import { FEE_REFUND_REASONS, feeStatusLabel, hasPaidFee } from '@/lib/backgroundCheckFee'
import { missingOnboardingSteps } from '@/lib/cleanerOnboarding'
import { ICA_VERSION } from '@/lib/legal/contractorAgreement'
import { grantAccessAction, denyAccessAction, revokeAccessAction, approveCleanerAction, pauseCleanerAction, refundBackgroundCheckFeeAction, resendSignedAgreementAction } from '../../actions'
import { BulkAccountActions, RowAccountActions, RowSelectCheckbox, SelectAllAccounts } from './AccountActions'

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
  searchParams: Promise<{ search?: string; role?: string; status?: string; verified?: string }>
}) {
  const { search = '', role = '', status = '', verified = '' } = await searchParams
  const admin = createAdminClient()

  let query = admin
    .from('profiles')
    .select('id, first_name, last_name, email, phone, street_address, zip_code, role, booking_access_status, email_verified_at, suspended_at, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  if (search) {
    query = query.or(
      `email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,zip_code.ilike.%${search}%,phone.ilike.%${search}%`
    )
  }
  if (role) query = query.eq('role', role as 'USER' | 'TIDYPRO' | 'ADMIN')
  if (status === 'suspended') query = query.not('suspended_at', 'is', null)
  else if (status) query = query.eq('booking_access_status', status as 'waitlisted' | 'booking_allowed' | 'paused' | 'closed')
  if (verified === 'yes') query = query.not('email_verified_at', 'is', null)
  if (verified === 'no') query = query.is('email_verified_at', null)

  const { data: users, error: usersError } = await query
  const hasFilters = search || role || status || verified

  const cleanerIds = (users ?? []).filter((u) => u.role === 'TIDYPRO').map((u) => u.id)
  const { data: cleanerProfiles } = cleanerIds.length
    ? await admin
        .from('tidypro_profiles')
        .select('id, cleaner_status, active_for_booking, is_away, profile_photo_url, bio, availability, stripe_onboarding_completed, travel_radius_miles, phone, street_address, city, state, zip_code')
        .in('id', cleanerIds)
    : { data: [] }
  const cleanerById = new Map((cleanerProfiles ?? []).map((c) => [c.id, c]))

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

  const { data: deletedAccounts } = await admin
    .from('deleted_accounts')
    .select('id, email, first_name, last_name, role, deleted_at')
    .order('deleted_at', { ascending: false })
    .limit(200)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Users</h1>
        <p className="text-sm text-slate-400">{(users ?? []).length} shown</p>
      </div>

      {/* Filters */}
      <form method="get" className="flex flex-wrap gap-2 mb-4 items-center">
        <input
          aria-label="Search users"
          name="search"
          defaultValue={search}
          placeholder="Search name, email, phone, ZIP…"
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
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Email</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Phone</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Address</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Role</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Background Check</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Verified</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Joined</th>
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
                  : cleaner
                  ? `${cleaner.cleaner_status ?? 'applied'}${!cleaner.active_for_booking ? ' · not bookable' : cleaner.is_away ? ' · away' : missingOnboardingSteps(cleaner).length > 0 ? ' · onboarding incomplete' : ''}`
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
                return (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                    <td className="pl-4 py-3">
                      {user.role !== 'ADMIN' && <RowSelectCheckbox profileId={user.id} label={name} />}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                      {name}
                    </td>
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
