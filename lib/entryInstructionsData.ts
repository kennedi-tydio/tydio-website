import type { createAdminClient } from '@/lib/supabase/admin'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import { normalizeEntryInstructions } from './entryInstructions'

type Admin = ReturnType<typeof createAdminClient>

// The entry instructions saved on the booking's address, if it's a saved address.
export async function savedEntryInstructionsForLocation(
  admin: Admin,
  profileId: string,
  location: ScheduledLocation | null
): Promise<string | null> {
  if (location?.type !== 'address') return null
  const { data } = await admin
    .from('user_addresses')
    .select('entry_instructions')
    .eq('id', location.addressId)
    .eq('user_id', profileId)
    .maybeSingle()
  return normalizeEntryInstructions(data?.entry_instructions)
}

// What the booking gets: whatever the customer typed on the review step (even if
// they cleared it), or the address's saved instructions if they never touched it.
export async function draftEntryInstructions(
  admin: Admin,
  profileId: string,
  draftValue: string | null,
  location: ScheduledLocation | null
): Promise<string | null> {
  if (draftValue !== null) return normalizeEntryInstructions(draftValue)
  return savedEntryInstructionsForLocation(admin, profileId, location)
}
