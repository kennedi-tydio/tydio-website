import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPendingTaskAddition, taskAdditionBlockedReason } from '@/lib/bookingTaskAdditions'
import type { TidyTask } from '@/app/dashboard/types'
import AddTasksView from './AddTasksView'
import { readSnapshot } from '@/lib/fullServiceBooking'

export const metadata: Metadata = { title: 'Add Tasks — Tydio' }

// Adding tasks from the dashboard to an accepted booking more than 2 hours away. The
// customer pays for them here, and they go to the Tidy Pro to accept or decline (see
// lib/bookingTaskAdditions).
export default async function AddTasksPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'USER') redirect('/login')

  const { bookingId } = await params
  const admin = createAdminClient()
  const { data: booking } = await admin
    .from('bookings')
    .select('id, tidy_pro_id, tidy_pro_name, status, progress_status, scheduled_date, scheduled_time, time_zone, task_list, full_service, recurring_booking_id, suspended_for_upcharge_at, suspended_for_payment_at, payment_failed_at')
    .eq('id', bookingId)
    .eq('user_id', session.profileId)
    .maybeSingle()

  if (!booking || taskAdditionBlockedReason(booking) || (await getPendingTaskAddition(admin, booking.id))) {
    redirect(`/dashboard/bookings/${bookingId}`)
  }

  const [{ data: draft }, { data: profile }] = await Promise.all([
    admin
      .from('booking_drafts')
      .select('id, task_list')
      .eq('customer_user_id', session.profileId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from('profiles').select('custom_rooms').eq('id', session.profileId).maybeSingle(),
  ])

  return (
    <AddTasksView
      bookingId={booking.id}
      cleanerFirstName={(booking.tidy_pro_name ?? 'your Tidy Pro').split(' ')[0]}
      isRecurring={booking.recurring_booking_id != null}
      draftId={draft?.id ?? null}
      dashboardTasks={(draft?.task_list as TidyTask[] | null) ?? []}
      bookingTaskIds={((booking.task_list as TidyTask[] | null) ?? []).map((t) => t.id)}
      savedRooms={(profile?.custom_rooms as string[] | null) ?? []}
      fullService={(() => {
        const snapshot = readSnapshot(booking.full_service)
        return snapshot ? { ...snapshot.selection, version: 1 as const, step: 'notes' as const } : null
      })()}
    />
  )
}
