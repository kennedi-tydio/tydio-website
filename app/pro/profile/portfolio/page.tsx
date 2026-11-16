import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadPortfolio } from '@/lib/tidyProPortfolio'
import PortfolioView from './PortfolioView'

export const metadata: Metadata = { title: 'My Work Photos — Tydio' }

export default async function ProPortfolioPage() {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  // Everything, not just the pairs the public profile shows.
  const items = await loadPortfolio(createAdminClient(), session.profileId, 200)
  return <PortfolioView initialItems={items} />
}
