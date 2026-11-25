import { createAdminClient } from '@/lib/supabase/admin'

// A booking under way: the Tidy Pro is on the way, has arrived, or is cleaning.
// While someone has one (as its customer or its Tidy Pro), a session without
// "Stay signed in" doesn't time out after 30 minutes away, so a Tidy Pro who
// puts their phone down to clean isn't signed out before they can finish.
export const ACTIVE_PROGRESS = ['on_the_way', 'arrived', 'cleaning'] as const

export async function hasActiveBooking(profileId: string, role: 'USER' | 'TIDYPRO' | 'ADMIN'): Promise<boolean> {
  if (role === 'ADMIN') return false
  const { data, error } = await createAdminClient()
    .from('bookings')
    .select('id')
    .eq(role === 'TIDYPRO' ? 'tidy_pro_id' : 'user_id', profileId)
    .eq('status', 'scheduled')
    .in('progress_status', [...ACTIVE_PROGRESS])
    .limit(1)
  // A failed lookup falls back to the normal 30 minutes rather than failing sign-in.
  if (error) return false
  return (data ?? []).length > 0
}
