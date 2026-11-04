'use client'

import { useEffect, useState } from 'react'

// "Start booking" shows up this long before the scheduled start.
const START_WINDOW_MS = 60 * 60 * 1000

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
