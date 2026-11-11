import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadCustomerPetsWithPhotos } from '@/lib/customerPetsData'
import PetsView from './PetsView'

export const metadata: Metadata = { title: 'Pets — Tydio' }

export default async function PetsPage({
  searchParams,
}: {
  searchParams: Promise<{ required?: string; onboarding?: string; next?: string }>
}) {
  const session = await getSession()
  if (!session || session.role !== 'USER') redirect('/login')

  const { required, onboarding, next } = await searchParams
  const admin = createAdminClient()

  const [{ data: profile, error }, pets] = await Promise.all([
    admin.from('profiles').select('has_no_pets').eq('id', session.profileId).maybeSingle(),
    loadCustomerPetsWithPhotos(admin, session.profileId),
  ])
  if (error) throw new Error(`Failed to load pets: ${error.message}`)

  // onboarding: just signed up. required: sent here from booking (next: the booking
  // page to go back to, only ever a /book path).
  const bookingReturn = next && /^\/book(\/[\w-]*)*$/.test(next) ? next : null
  const mode = onboarding === '1' ? 'onboarding' : required === '1' || bookingReturn ? 'required' : 'settings'
  const continueHref = mode === 'required' ? bookingReturn ?? '/book' : '/dashboard'

  return (
    <PetsView
      initialPets={pets}
      initialHasNoPets={profile?.has_no_pets === true}
      mode={mode}
      continueHref={continueHref}
    />
  )
}
