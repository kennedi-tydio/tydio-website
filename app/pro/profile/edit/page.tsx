import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUnreadMessageCountForTidyPro } from '@/lib/bookings'
import EditProfileView from './EditProfileView'

export const metadata: Metadata = { title: 'Your Profile — Tydio' }

export default async function ProEditProfilePage() {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const admin = createAdminClient()

  const [{ data: profile, error }, { data: tidyPro }, unreadMessageCount] = await Promise.all([
    admin.from('profiles').select('first_name, last_name, phone').eq('id', session.profileId).maybeSingle(),
    admin
      .from('tidypro_profiles')
      .select('bio, profile_photo_url, city, state, phone, allergies')
      .eq('id', session.profileId)
      .maybeSingle(),
    getUnreadMessageCountForTidyPro(admin, session.profileId),
  ])

  if (error) throw new Error(`Failed to load profile: ${error.message}`)
  if (!profile) redirect('/login')

  return (
    <EditProfileView
      firstName={profile.first_name ?? ''}
      lastName={profile.last_name ?? ''}
      bio={tidyPro?.bio ?? ''}
      phone={tidyPro?.phone ?? profile.phone ?? ''}
      location={[tidyPro?.city, tidyPro?.state].filter(Boolean).join(', ')}
      photoUrl={tidyPro?.profile_photo_url ?? null}
      allergies={Array.isArray(tidyPro?.allergies) ? (tidyPro.allergies as string[]) : []}
      unreadMessageCount={unreadMessageCount}
    />
  )
}
