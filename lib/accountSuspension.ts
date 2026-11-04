import type { createAdminClient } from '@/lib/supabase/admin'
import { TYDIO_ADMIN_EMAIL } from '@/lib/email'

type Admin = ReturnType<typeof createAdminClient>

export const SUSPENDED_MESSAGE = `Your Tydio account is suspended, so you can't book or take bookings right now. If you think this is a mistake, please email ${TYDIO_ADMIN_EMAIL}.`

export const SUSPENDED_PAUSE_REASON = 'Account suspended'

// A suspended person can still sign in and see their account, but can't book or take
// bookings: see bookingBlockedBySuspension, checked wherever a booking is made or
// accepted. A Tidy Pro is also paused, which takes them out of search. Bookings
// already on the calendar are left as they are for the admin to sort out.
// Admin accounts are never touched. Returns how many accounts were newly suspended.
export async function suspendAccounts(admin: Admin, profileIds: string[]): Promise<number> {
  if (profileIds.length === 0) return 0
  const now = new Date().toISOString()

  const { data: suspended, error } = await admin
    .from('profiles')
    .update({ suspended_at: now })
    .in('id', profileIds)
    .neq('role', 'ADMIN')
    .is('suspended_at', null)
    .select('id, role')
  if (error) throw new Error(error.message)

  const proIds = (suspended ?? []).filter(p => p.role === 'TIDYPRO').map(p => p.id)
  if (proIds.length > 0) {
    const { error: pauseError } = await admin
      .from('tidypro_profiles')
      .update({ cleaner_status: 'paused', active_for_booking: false, paused_at: now, pause_reason: SUSPENDED_PAUSE_REASON })
      .in('id', proIds)
    if (pauseError) throw new Error(pauseError.message)
  }

  return suspended?.length ?? 0
}

// Lets them book again. A Tidy Pro stays paused until an admin approves them,
// so nobody starts getting jobs again without someone deciding they should.
export async function unsuspendAccounts(admin: Admin, profileIds: string[]): Promise<number> {
  if (profileIds.length === 0) return 0

  const { data, error } = await admin
    .from('profiles')
    .update({ suspended_at: null })
    .in('id', profileIds)
    .not('suspended_at', 'is', null)
    .select('id')
  if (error) throw new Error(error.message)

  return data?.length ?? 0
}

// The error to show when someone suspended tries to book or accept a booking, or null.
export async function bookingBlockedBySuspension(admin: Admin, profileId: string): Promise<string | null> {
  const { data } = await admin.from('profiles').select('suspended_at').eq('id', profileId).maybeSingle()
  return data?.suspended_at ? SUSPENDED_MESSAGE : null
}
