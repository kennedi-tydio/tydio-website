import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

// Stops a cleaner getting new bookings until an admin approves them again.
export async function pauseCleaner(admin: Admin, tidyProId: string, reason: string | null = null, now: Date = new Date()): Promise<void> {
  const { error } = await admin.from('tidypro_profiles').update({
    cleaner_status: 'paused',
    active_for_booking: false,
    paused_at: now.toISOString(),
    ...(reason ? { pause_reason: reason } : {}),
  }).eq('id', tidyProId)
  if (error) throw new Error(error.message)
}
