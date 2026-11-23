import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { bookingBlockedByAccess } from '@/lib/accountSuspension'
import { resolveStatePricing, resolveLocationSquareFootage } from '@/app/dashboard/taskPricing'
import { getReplacementOptions, MAX_EXTRA_BOOKING_CLEANERS } from '@/lib/bookingRequestGroups'
import { dropUnmatchedLaundryLinks } from '@/lib/laundry'
import type { TidyTask } from '@/app/dashboard/types'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import ChooseOtherTidyProsView from './ChooseOtherTidyProsView'
import { bookableSelection, snapshotForTidyPro } from '@/lib/fullServiceBooking'
import { bookingDurationMinutes, priceTasksPart } from '@/lib/bookingPricing'

export const metadata: Metadata = { title: 'Choose other Tidy Pros — Tydio' }

// Picked from the review page: other Tidy Pros to send this request to along with the
// chosen one. The same list the review page offers (getReplacementOptions), so the
// picks are ones confirmBookingAction will accept.
export default async function ChooseOtherTidyProsPage() {
  const session = await getSession()
  if (!session || session.role !== 'USER') redirect('/login')

  const admin = createAdminClient()
  if (await bookingBlockedByAccess(admin, session.profileId)) redirect('/dashboard')

  const { data: draft, error } = await admin
    .from('booking_drafts')
    .select('id, task_list, full_service, scheduled_location, scheduled_date, scheduled_time, selected_tidy_pro_id')
    .eq('customer_user_id', session.profileId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Failed to load booking draft: ${error.message}`)
  if (!draft) redirect('/dashboard')
  if (!draft.selected_tidy_pro_id || !draft.scheduled_date || !draft.scheduled_time) redirect('/book/schedule')
  const tasks = dropUnmatchedLaundryLinks(((draft.task_list as TidyTask[] | null) ?? []).filter((t) => t.completed))
  const fullService = bookableSelection(draft.full_service)
  if (tasks.length === 0 && !fullService) redirect('/dashboard')

  const { data: profile } = await admin.from('profiles').select('service_area_id, city, state').eq('id', session.profileId).single()
  const statePricing = await resolveStatePricing(admin, profile?.service_area_id ?? null, profile ?? undefined)
  if (!statePricing.configured) redirect('/book/review')

  const location = draft.scheduled_location as ScheduledLocation | null
  const squareFootage = await resolveLocationSquareFootage(admin, session.profileId, location)
  // The cleaning as booked with the chosen Tidy Pro: the others must be able to do
  // it for no more than their price.
  const fullServiceSnapshot = fullService ? await snapshotForTidyPro(admin, draft.selected_tidy_pro_id, fullService, squareFootage) : null
  if (fullService && !fullServiceSnapshot) redirect('/book/review')
  let durationMinutes: number
  try {
    priceTasksPart(tasks, statePricing.state, statePricing.medianFourHourPrice, squareFootage)
    durationMinutes = bookingDurationMinutes(tasks, squareFootage, fullServiceSnapshot?.duration_minutes ?? 0)
  } catch {
    redirect('/book/review')
  }

  const options = await getReplacementOptions(admin, {
    user_id: session.profileId,
    tidy_pro_id: draft.selected_tidy_pro_id,
    scheduled_location: draft.scheduled_location,
    scheduled_date: draft.scheduled_date,
    scheduled_time: draft.scheduled_time,
    estimated_duration_minutes: durationMinutes,
    task_list: tasks,
    full_service: fullServiceSnapshot,
  })

  return (
    <ChooseOtherTidyProsView
      draftId={draft.id}
      scheduledDate={draft.scheduled_date}
      scheduledTime={draft.scheduled_time}
      options={options}
      max={MAX_EXTRA_BOOKING_CLEANERS}
    />
  )
}
