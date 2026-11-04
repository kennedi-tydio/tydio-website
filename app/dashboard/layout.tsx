import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import NotificationConsentModal from '@/app/components/NotificationConsentModal'
import NotificationConsentBanner from '@/app/components/NotificationConsentBanner'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session || session.role !== 'USER') redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('phone, sms_consent, push_consent, booking_access_status')
    .eq('id', session.profileId)
    .maybeSingle()

  if (profile?.booking_access_status === 'waitlisted' || profile?.booking_access_status === 'denied') redirect('/waitlist')

  return (
    <>
      <NotificationConsentModal
        initialPhone={profile?.phone ?? null}
        smsConsent={profile?.sms_consent ?? null}
        pushConsent={profile?.push_consent ?? null}
      />
      <NotificationConsentBanner
        smsConsent={profile?.sms_consent ?? null}
        pushConsent={profile?.push_consent ?? null}
        notificationsHref="/dashboard/profile/notifications"
      />
      {children}
    </>
  )
}
