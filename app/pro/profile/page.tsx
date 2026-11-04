import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUnreadMessageCountForTidyPro } from '@/lib/bookings'
import { summarizeEarnings, unpaidStripeBalance } from '@/lib/earnings'
import { stripe } from '@/lib/stripe'
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
    .select('profile_photo_url, city, state, stripe_account_id')
    .eq('id', session.profileId)
    .maybeSingle()

  const unreadMessageCount = await getUnreadMessageCountForTidyPro(admin, session.profileId)

  const { data: completedBookings } = await admin
    .from('bookings')
    .select('cleaner_pay, tip, stripe_transfer_id')
    .eq('tidy_pro_id', session.profileId)
    .eq('status', 'completed')

  const accountId = tidyPro?.stripe_account_id ?? null
  const earnings = summarizeEarnings(completedBookings ?? [], accountId != null)

  // A Stripe hiccup shouldn't take the profile page down, or pass off a partial
  // figure as the whole amount, so pending earnings go blank instead.
  let pendingEarnings: number | null = earnings.heldByTydio
  if (accountId) {
    try {
      const balance = await stripe.balance.retrieve({}, { stripeAccount: accountId })
      pendingEarnings = earnings.heldByTydio + unpaidStripeBalance(balance)
    } catch (err) {
      console.error(`Failed to load Stripe balance for ${accountId}:`, err)
      pendingEarnings = null
    }
  }

  return (
    <ProfileView
      firstName={profile.first_name ?? ''}
      lastName={profile.last_name ?? ''}
      email={profile.email}
      location={[tidyPro?.city, tidyPro?.state].filter(Boolean).join(', ')}
      photoUrl={tidyPro?.profile_photo_url ?? null}
      pendingEarnings={pendingEarnings}
      overallEarnings={earnings.overall}
      unreadMessageCount={unreadMessageCount}
    />
  )
}
