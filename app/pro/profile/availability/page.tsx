import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import AvailabilityView from './AvailabilityView'
import type { WeeklyAvailability } from '@/lib/cleanerMatching'
import { DEFAULT_BOOKING_TIME_ZONE, todayInZone } from '@/lib/bookingTime'
import { normalizeTimeOff, parseTimeOff } from '@/lib/timeOff'

export const metadata: Metadata = { title: 'Availability — Tydio' }

export default async function AvailabilityPage() {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const admin = createAdminClient()

  const { data: tidyPro, error } = await admin
    .from('tidypro_profiles')
    .select('availability, is_away, time_off, time_zone')
    .eq('id', session.profileId)
    .single()

  if (error) throw new Error(`Failed to load availability: ${error.message}`)

  // Dates that are over are hidden here, and dropped from the column on the next change.
  const today = todayInZone(tidyPro?.time_zone ?? DEFAULT_BOOKING_TIME_ZONE)

  return (
    <AvailabilityView
      initialAvailability={(tidyPro?.availability as WeeklyAvailability | null) ?? {}}
      initialAway={tidyPro?.is_away ?? false}
      initialTimeOff={normalizeTimeOff(parseTimeOff(tidyPro?.time_off), today)}
      todayISO={today}
    />
  )
}
