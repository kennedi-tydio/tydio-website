import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

export type UnseenTips = { bookingIds: string[]; totalAmount: number }

// A Tidy Pro's tips they haven't seen the "You received a tip!" pop-up for
// (bookings.tip_seen_by_pro_at, cleared when a tip is paid). Several are shown together.
export async function loadUnseenTips(admin: Admin, tidyProId: string): Promise<UnseenTips> {
  const { data } = await admin
    .from('bookings')
    .select('id, tip')
    .eq('tidy_pro_id', tidyProId)
    .gt('tip', 0)
    .is('tip_seen_by_pro_at', null)
  const rows = data ?? []
  return {
    bookingIds: rows.map((b) => b.id),
    totalAmount: Math.round(rows.reduce((sum, b) => sum + Number(b.tip), 0) * 100) / 100,
  }
}
