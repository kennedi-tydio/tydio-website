import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { requireCurrentAgreement } from '@/lib/legal/contractorAgreement'

// Tidy Pros sign the current contractor agreement before using this part of the app.
export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')
  await requireCurrentAgreement(session.profileId, '/pro/bookings')
  return children
}
