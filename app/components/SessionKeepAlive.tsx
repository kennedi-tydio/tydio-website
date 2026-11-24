'use client'

import { useEffect } from 'react'

// A session without "Stay signed in" ends after 30 minutes away. While someone
// is actually using the page (tapping, typing, scrolling), this tells the
// server so their 30 minutes start over. Coming back to the tab counts too,
// but only if the 30 minutes haven't already run out.
const PING_EVERY_MS = 5 * 60 * 1000

export default function SessionKeepAlive() {
  useEffect(() => {
    let lastPing = 0

    function ping() {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - lastPing < PING_EVERY_MS) return
      lastPing = now
      fetch('/api/session/keepalive', { method: 'POST', credentials: 'same-origin', keepalive: true }).catch(() => {})
    }

    ping()
    const events = ['pointerdown', 'keydown', 'scroll', 'visibilitychange'] as const
    for (const e of events) document.addEventListener(e, ping, { passive: true, capture: true })
    return () => {
      for (const e of events) document.removeEventListener(e, ping, { capture: true })
    }
  }, [])

  return null
}
