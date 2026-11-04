'use client'

import { useEffect } from 'react'
// Loaded from the root layout so it catches beforeinstallprompt early.
import './installGuide'

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])

  return null
}
