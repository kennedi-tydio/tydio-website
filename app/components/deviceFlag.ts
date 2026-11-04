import { useSyncExternalStore } from 'react'

// A yes/no flag remembered by this browser only (localStorage), for choices
// that belong to a device rather than the account. Falls back to memory when
// storage is blocked, and reads as set on the server so nothing it gates
// flashes in before hydration.
export function createDeviceFlag(key: string) {
  const listeners = new Set<() => void>()
  let fallback = false

  function read(): boolean {
    try {
      return localStorage.getItem(key) === '1' || fallback
    } catch {
      return fallback
    }
  }

  function set() {
    fallback = true
    try {
      localStorage.setItem(key, '1')
    } catch {}
    listeners.forEach((l) => l())
  }

  function subscribe(callback: () => void) {
    listeners.add(callback)
    return () => listeners.delete(callback)
  }

  function useFlag(): boolean {
    return useSyncExternalStore(subscribe, read, () => true)
  }

  return { set, useFlag }
}
