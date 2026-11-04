'use client'

import { useSyncExternalStore } from 'react'

export type LocalClock = { todayISO: string; nowMinutes: number }

function subscribe(): () => void {
  return () => {}
}

// A string, since React compares snapshots by identity. Stable within the minute.
function readDeviceClock(): string {
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return `${today}|${now.getHours() * 60 + now.getMinutes()}`
}

function readOnServer(): null {
  return null
}

// "Today" and "now" have to come from the customer's device: a server knows neither, and
// in UTC its date rolls over during a Georgia evening. Null while rendering on the server,
// so callers show a loading state for that first moment.
export function useLocalClock(): LocalClock | null {
  const snapshot = useSyncExternalStore(subscribe, readDeviceClock, readOnServer)
  if (!snapshot) return null
  const [todayISO, nowMinutes] = snapshot.split('|')
  return { todayISO, nowMinutes: Number(nowMinutes) }
}
