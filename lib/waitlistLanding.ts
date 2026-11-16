import type { createAdminClient } from '@/lib/supabase/admin'
import { safeRedirectPath } from '@/lib/safeRedirect'

type Admin = ReturnType<typeof createAdminClient>

// Where a waitlisted customer goes after signing in: the /waitlist screen first,
// whose Continue button then takes them on to `dest`. They can use the app
// (profile, Tidy Tasks) but can't book until an admin grants access.
export function waitlistPath(dest: string): string {
  const next = safeRedirectPath(dest)
  return next && next !== '/dashboard' ? `/waitlist?next=${encodeURIComponent(next)}` : '/waitlist'
}

// Where to send someone who just signed in: `dest`, unless they're a
// waitlisted customer, who sees the /waitlist screen on the way.
export async function customerLanding(admin: Admin, profileId: string, role: string, dest: string): Promise<string> {
  if (role !== 'USER') return dest
  const { data } = await admin.from('profiles').select('booking_access_status').eq('id', profileId).maybeSingle()
  return data?.booking_access_status === 'waitlisted' ? waitlistPath(dest) : dest
}
