'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadCustomerSeries, newTidyProOptions } from '@/lib/recurringBookings'
import { userFacingError } from '@/lib/userFacingError'

// Stops booking new visits. Visits already booked stay, and can be canceled on their own
// page under the usual cancellation rules.
export async function cancelRecurringBookingAction(seriesId: string): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('recurring_bookings')
    .update({ status: 'cancelled', cancelled_at: now, updated_at: now })
    .eq('id', seriesId)
    .eq('user_id', session.profileId)
    .eq('status', 'active')
    .select('id')

  if (error) return { error: userFacingError(error) }
  if (!data || data.length === 0) return { error: 'This recurring booking was already canceled.' }

  revalidatePath('/dashboard/bookings')
  return { success: true }
}

// The next visit not yet booked, and every one after, goes to this Tidy Pro instead.
export async function chooseRecurringTidyProAction(seriesId: string, tidyProId: string): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const admin = createAdminClient()
  const series = await loadCustomerSeries(admin, session.profileId, seriesId)
  if (!series) return { error: 'This recurring booking was canceled.' }

  // Checked the same way they were offered, so they can do the job at that time.
  const chosen = (await newTidyProOptions(admin, series)).find((o) => o.id === tidyProId)
  if (!chosen) return { error: 'That Tidy Pro is no longer available at this time. Please choose again.' }

  const { error } = await admin
    .from('recurring_bookings')
    .update({
      tidy_pro_id: chosen.id,
      tidy_pro_name: chosen.name,
      tidy_pro_photo_url: chosen.photoUrl,
      // They haven't accepted it yet: the next visit goes to them as a request, and
      // accepting it accepts the series (see lib/recurringBookings).
      tidy_pro_accepted_at: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', series.id)
    .eq('user_id', session.profileId)

  if (error) return { error: userFacingError(error) }

  revalidatePath('/dashboard/bookings')
  return { success: true }
}
