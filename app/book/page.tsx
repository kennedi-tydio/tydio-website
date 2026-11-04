import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveStatePricing, priceTaskListForState, ensurePriceableTasks } from '@/app/dashboard/taskPricing'
import type { TidyTask } from '@/app/dashboard/types'
import BookingSummary from './BookingSummary'

export const metadata: Metadata = { title: 'Book a Cleaning — Tydio' }

export default async function BookPage() {
  const session = await getSession()
  if (!session || session.role !== 'USER') redirect('/login')

  const admin = createAdminClient()

  // Independent reads — run in parallel instead of one-after-another.
  const [
    { data: profile, error: profileError },
    { data: draft, error: draftError },
  ] = await Promise.all([
    admin
      .from('profiles')
      .select('first_name, booking_access_status, service_area_id')
      .eq('id', session.profileId)
      .single(),
    admin
      .from('booking_drafts')
      .select('id, task_list')
      .eq('customer_user_id', session.profileId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (profileError) throw new Error(`Failed to load booking profile: ${profileError.message}`)
  if (!profile) redirect('/login')
  if (profile.booking_access_status !== 'booking_allowed') redirect('/dashboard')
  if (draftError) throw new Error(`Failed to load booking draft: ${draftError.message}`)

  // `completed` marks a task as checked/selected in the dashboard list —
  // only selected tasks are included in the booking.
  const allTasks = (draft?.task_list as TidyTask[] | null) ?? []
  let tasks = allTasks.filter((t) => t.completed)
  if (tasks.length === 0) redirect('/dashboard')

  const statePricing = await resolveStatePricing(admin, profile.service_area_id)
  if (!statePricing.configured) redirect('/dashboard?priceError=state_pricing_not_configured')

  // Backfill any task that's missing a price estimate (e.g. saved before an
  // earlier estimate attempt was interrupted) instead of failing the whole
  // booking over it.
  if (draft?.id) {
    const repaired = await ensurePriceableTasks(admin, draft.id, allTasks)
    tasks = repaired.filter((t) => t.completed)
  }

  let breakdown
  try {
    breakdown = priceTaskListForState(tasks, statePricing.state, statePricing.medianFourHourPrice)
  } catch {
    redirect('/dashboard?priceError=1')
  }

  if (draft?.id) {
    // Persist the pricing snapshot in the background — it isn't needed to
    // render this page, so don't make navigation wait on it.
    admin
      .from('booking_drafts')
      .update({ pricing_breakdown: breakdown as never })
      .eq('id', draft.id)
      .then(({ error }) => {
        if (error) console.error('Failed to persist pricing snapshot', error)
      })
  }

  return <BookingSummary tasks={tasks} firstName={profile.first_name ?? 'Your'} />
}
