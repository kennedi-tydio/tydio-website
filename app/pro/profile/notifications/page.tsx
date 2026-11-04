import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import NotificationsView from './NotificationsView'

export const metadata: Metadata = { title: 'Notifications — Tydio' }

export default async function ProNotificationsPage() {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('tidypro_profiles')
    .select('phone, sms_consent, push_consent, email_notifications_enabled')
    .eq('id', session.profileId)
    .maybeSingle()

  return (
    <NotificationsView
      initialPhone={profile?.phone ?? null}
      initialSmsConsent={profile?.sms_consent ?? null}
      initialPushConsent={profile?.push_consent ?? null}
      initialEmailEnabled={profile?.email_notifications_enabled !== false}
    />
  )
}
