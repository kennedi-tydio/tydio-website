import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import TimeZoneSync from '@/app/components/TimeZoneSync'
import { saveTimeZoneAction } from './actions'
import NotificationConsentModal from '@/app/components/NotificationConsentModal'
import NotificationConsentBanner from '@/app/components/NotificationConsentBanner'

export default async function ProLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const admin = createAdminClient()

  // A session outlives its account, so a cleaner denied while logged in would
  // otherwise keep hitting errors on every page. This signs them out properly.
  const { data: account } = await admin.from('profiles').select('id, phone, booking_access_status').eq('id', session.profileId).maybeSingle()
  if (!account) redirect('/account-removed')
  if (account.booking_access_status === 'waitlisted' || account.booking_access_status === 'denied') redirect('/waitlist')

  const { data: profile } = await admin
    .from('tidypro_profiles')
    .select('phone, sms_consent, push_consent, time_zone')
    .eq('id', session.profileId)
    .maybeSingle()

  return (
    <>
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
