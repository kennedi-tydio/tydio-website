import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import TimeZoneSync from '@/app/components/TimeZoneSync'
import { saveTimeZoneAction } from './actions'
import NotificationConsentModal from '@/app/components/NotificationConsentModal'
import NotificationConsentBanner from '@/app/components/NotificationConsentBanner'
import AccountNotice from '@/app/components/AccountNotice'
import PostHogIdentify from '@/app/components/PostHogIdentify'
import { SUSPENDED_MESSAGE } from '@/lib/accountSuspension'
import { appealDeadline, formatDeadline } from '@/lib/appealWindow'

export default async function ProLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const admin = createAdminClient()

  // A session outlives its account, so a cleaner denied while logged in would
  // otherwise keep hitting errors on every page. This signs them out properly.
  const { data: account } = await admin.from('profiles').select('id, phone, booking_access_status, suspended_at').eq('id', session.profileId).maybeSingle()
  if (!account) redirect('/account-removed')
  if (account.booking_access_status === 'waitlisted' || account.booking_access_status === 'denied') redirect('/waitlist')

  const [{ data: profile }, { data: denial }] = await Promise.all([
    admin.from('tidypro_profiles').select('phone, sms_consent, push_consent, time_zone').eq('id', session.profileId).maybeSingle(),
    admin
      .from('background_checks')
      .select('denied_at, denial_reason, appeal_token, appeal_submitted_at')
      .eq('pro_id', session.profileId)
      .not('denied_at', 'is', null)
      .maybeSingle(),
  ])

  return (
    <>
      <PostHogIdentify profileId={session.profileId} role={session.role} />
      {denial?.denied_at && (
        <AccountNotice title="Your background check was not approved">
          {denial.denial_reason}{' '}
          {denial.appeal_submitted_at ? (
            <>We&apos;ve received your appeal and will email you once it has been reviewed.</>
          ) : (
            <>
              If you think this is a mistake, you can{' '}
              <a href={`/appeal?token=${denial.appeal_token}`} className="underline font-medium">appeal</a> by{' '}
              {formatDeadline(appealDeadline(denial.denied_at))}. Without an accepted appeal by then, your account is closed.
            </>
          )}
        </AccountNotice>
      )}
      {account.suspended_at && <AccountNotice title="Account suspended">{SUSPENDED_MESSAGE}</AccountNotice>}
      <TimeZoneSync savedTimeZone={profile?.time_zone ?? null} onChange={saveTimeZoneAction} />
      <NotificationConsentModal
        initialPhone={profile?.phone ?? account.phone ?? null}
        smsConsent={profile?.sms_consent ?? null}
        pushConsent={profile?.push_consent ?? null}
      />
      <NotificationConsentBanner
        smsConsent={profile?.sms_consent ?? null}
        pushConsent={profile?.push_consent ?? null}
        notificationsHref="/pro/profile/notifications"
      />
      {children}
    </>
  )
}
