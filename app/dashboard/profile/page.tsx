import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import ProfileView from './ProfileView'

export const metadata: Metadata = { title: 'Profile — Tydio' }

export default async function ProfilePage() {
  const session = await getSession()
  if (!session || session.role !== 'USER') redirect('/login')

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('id, first_name, last_name, email, phone, zip_code')
    .eq('id', session.profileId)
    .single()

  if (!profile) redirect('/login')

  return (
    <ProfileView
      firstName={profile.first_name ?? ''}
      lastName={profile.last_name ?? ''}
      email={profile.email}
    />
  )
}
