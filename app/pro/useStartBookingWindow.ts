'use client'

import { useEffect, useState } from 'react'
import { START_BOOKING_WINDOW_MINUTES } from '@/lib/bookingTime'

const START_WINDOW_MS = START_BOOKING_WINDOW_MINUTES * 60 * 1000

// Whether a not-yet-started booking is close enough to its start for the
// cleaner to begin it. Re-checks every 30 seconds so the button appears
// without a reload.
export function useStartBookingWindow(startsAtMs: number | null): boolean {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(interval)
  }, [])

  return startsAtMs != null && now >= startsAtMs - START_WINDOW_MS
}
