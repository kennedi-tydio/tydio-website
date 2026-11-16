'use client'

import { useEffect, useState } from 'react'

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const mmss = `${String(minutes).padStart(hours > 0 ? 2 : 1, '0')}:${String(seconds).padStart(2, '0')}`
  return hours > 0 ? `${hours}:${mmss}` : mmss
}

// Time since the Tidy Pro pressed "I've arrived", shown small on every screen of the
// active booking.
export default function ElapsedTimer({ sinceMs, className = '' }: { sinceMs: number | null; className?: string }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  if (sinceMs == null) return null
  return (
    <p className={`text-xs text-slate-400 tabular-nums ${className}`}>
      Time since arrival: <span className="font-semibold text-slate-500" suppressHydrationWarning>{formatElapsed(now - sinceMs)}</span>
    </p>
  )
}
