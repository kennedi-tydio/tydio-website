import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { PUSH_REQUIRED, hasPushSubscription } from '@/lib/pushRequirement'
import NotificationsView from './NotificationsView'

export const metadata: Metadata = { title: 'Notifications — Tydio' }

export default async function NotificationsPage() {
  const session = await getSession()
  if (!session || session.role !== 'USER') redirect('/login')

  const admin = createAdminClient()
  const [{ data: profile }, hasPush] = await Promise.all([
    admin
    .from('profiles')
    .select('phone, sms_consent, push_consent, email_notifications_enabled')
    .eq('id', session.profileId)
    .maybeSingle(),
    hasPushSubscription(admin, session.profileId),
  ])

  return (
    <NotificationsView
      initialPhone={profile?.phone ?? null}
      initialSmsConsent={profile?.sms_consent ?? null}
      initialPushConsent={profile?.push_consent ?? null}
      initialEmailEnabled={profile?.email_notifications_enabled !== false}
      pushRequired={PUSH_REQUIRED && !hasPush}
    />
  )
}
