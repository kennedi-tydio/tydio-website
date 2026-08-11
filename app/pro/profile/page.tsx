import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import ProfileView from './ProfileView'

export const metadata: Metadata = { title: 'Profile — Tydio' }

export default async function ProProfilePage() {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const admin = createAdminClient()

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, first_name, last_name, email')
    .eq('id', session.profileId)
    .single()

  if (profileError) throw new Error(`Failed to load profile: ${profileError.message}`)
  if (!profile) redirect('/login')

  const { data: tidyPro } = await admin
    .from('tidypro_profiles')
    .select('bio')
    .eq('id', session.profileId)
    .maybeSingle()

  return (
    <ProfileView
      firstName={profile.first_name ?? ''}
      lastName={profile.last_name ?? ''}
      email={profile.email}
      bio={tidyPro?.bio ?? null}
    />
  )
}
