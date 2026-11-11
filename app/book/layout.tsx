import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { CUSTOMER_PUSH_SETUP_PATH, customerNeedsPush } from '@/lib/pushRequirement'
import { PETS_REQUIRED_PATH } from '@/lib/customerPets'
import { customerNeedsPets } from '@/lib/customerPetsData'

// No booking pages until the customer has answered the pets question (lib/customerPets)
// and, temporarily, turned on push (lib/pushRequirement).
// Each page still does its own sign-in and access checks.
export default async function BookLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (session?.role === 'USER') {
    const admin = createAdminClient()
    if (await customerNeedsPets(admin, session.profileId)) redirect(PETS_REQUIRED_PATH)
    if (await customerNeedsPush(admin, session.profileId)) redirect(CUSTOMER_PUSH_SETUP_PATH)
  }
  return children
}
