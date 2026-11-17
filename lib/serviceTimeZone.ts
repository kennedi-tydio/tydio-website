import type { createAdminClient } from '@/lib/supabase/admin'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import { isValidTimeZone } from '@/lib/bookingTime'

type Admin = ReturnType<typeof createAdminClient>

// A booking's time is the local time where the cleaning happens, so its zone comes from
// the home's state, not the customer's device (a laptop set to Pacific time booking an
// Atlanta home would otherwise put the job three hours late). States split across zones
// use the zone most of their people live in.
export const STATE_TIME_ZONES: Record<string, string> = {
  AL: 'America/Chicago', AK: 'America/Anchorage', AZ: 'America/Phoenix', AR: 'America/Chicago',
  CA: 'America/Los_Angeles', CO: 'America/Denver', CT: 'America/New_York', DE: 'America/New_York',
  DC: 'America/New_York', FL: 'America/New_York', GA: 'America/New_York', HI: 'Pacific/Honolulu',
  ID: 'America/Boise', IL: 'America/Chicago', IN: 'America/Indiana/Indianapolis', IA: 'America/Chicago',
  KS: 'America/Chicago', KY: 'America/New_York', LA: 'America/Chicago', ME: 'America/New_York',
  MD: 'America/New_York', MA: 'America/New_York', MI: 'America/Detroit', MN: 'America/Chicago',
  MS: 'America/Chicago', MO: 'America/Chicago', MT: 'America/Denver', NE: 'America/Chicago',
  NV: 'America/Los_Angeles', NH: 'America/New_York', NJ: 'America/New_York', NM: 'America/Denver',
  NY: 'America/New_York', NC: 'America/New_York', ND: 'America/Chicago', OH: 'America/New_York',
  OK: 'America/Chicago', OR: 'America/Los_Angeles', PA: 'America/New_York', RI: 'America/New_York',
  SC: 'America/New_York', SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago',
  UT: 'America/Denver', VT: 'America/New_York', VA: 'America/New_York', WA: 'America/Los_Angeles',
  WV: 'America/New_York', WI: 'America/Chicago', WY: 'America/Denver', PR: 'America/Puerto_Rico',
}

export function timeZoneForState(state: string | null | undefined): string | null {
  return STATE_TIME_ZONES[(state ?? '').trim().toUpperCase()] ?? null
}

// The zone for a booking at `location`: the saved address's state, else the customer's
// profile state (a "current location" booking has only coordinates), else the zone their
// browser reported, else `fallback`.
export async function serviceTimeZone(
  admin: Admin,
  customerId: string,
  location: ScheduledLocation | null,
  browserTimeZone: string | null | undefined,
  fallback: string
): Promise<string> {
  if (location?.type === 'address') {
    const { data: address } = await admin
      .from('user_addresses')
      .select('state')
      .eq('id', location.addressId)
      .eq('user_id', customerId)
      .maybeSingle()
    const zone = timeZoneForState(address?.state)
    if (zone) return zone
  }
  const { data: profile } = await admin.from('profiles').select('state').eq('id', customerId).maybeSingle()
  const zone = timeZoneForState(profile?.state)
  if (zone) return zone
  return isValidTimeZone(browserTimeZone) ? browserTimeZone : fallback
}
