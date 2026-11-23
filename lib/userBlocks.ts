import type { createAdminClient } from '@/lib/supabase/admin'
import { userFacingError } from '@/lib/userFacingError'

type Admin = ReturnType<typeof createAdminClient>

// Blocks (supabase/migrations/097_user_blocks.sql). A customer can block a Tidy Pro and
// a Tidy Pro can block a customer. Either way the block covers both of them: no messages
// between them, no booking or quote requests from the customer to that Tidy Pro, and
// the Tidy Pro is left out of that customer's search results.

export const BLOCKED_MESSAGE = 'You can’t message this person.'
export const BLOCKED_BOOKING_MESSAGE = 'This Tidy Pro isn’t available to book. Please go back and choose another Tidy Pro.'

// True when either of the two has blocked the other.
export async function isBlockedBetween(admin: Admin, a: string | null, b: string | null): Promise<boolean> {
  if (!a || !b) return false
  const { data } = await admin
    .from('user_blocks')
    .select('blocker_id')
    .or(`and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`)
    .limit(1)
  return (data ?? []).length > 0
}

// Everyone this person has blocked or been blocked by.
export async function blockedIdsFor(admin: Admin, profileId: string): Promise<Set<string>> {
  const { data } = await admin
    .from('user_blocks')
    .select('blocker_id, blocked_id')
    .or(`blocker_id.eq.${profileId},blocked_id.eq.${profileId}`)
  const ids = new Set<string>()
  for (const row of data ?? []) ids.add(row.blocker_id === profileId ? row.blocked_id : row.blocker_id)
  return ids
}

export async function blockUser(
  admin: Admin,
  blockerId: string,
  blockedId: string,
  bookingId: string | null
): Promise<{ success: true } | { error: string }> {
  if (blockerId === blockedId) return { error: 'You can’t block yourself.' }
  const { error } = await admin
    .from('user_blocks')
    .upsert({ blocker_id: blockerId, blocked_id: blockedId, booking_id: bookingId }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true })
  if (error) return { error: userFacingError(error, 'Couldn’t block this person. Please try again.') }
  return { success: true }
}
