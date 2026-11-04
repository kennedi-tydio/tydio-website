'use client'

import { useEffect } from 'react'

// Only the device knows what timezone someone is really in, so a cleaner's is picked up
// here and saved when it changes, for showing them bookings in their own time.
export default function TimeZoneSync({
  savedTimeZone,
  onChange,
}: {
  savedTimeZone: string | null
  onChange: (timeZone: string) => Promise<void>
}) {
  useEffect(() => {
    const current = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (current && current !== savedTimeZone) onChange(current).catch(() => {})
  }, [savedTimeZone, onChange])

  return null
}
