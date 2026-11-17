'use client'

import { useEffect, useState } from 'react'
import { useRouter } from '@/app/components/NavigationSpinner'

// Reloads the board's data in place every so often, so cards move and turn red without
// anyone reloading the page.
export default function AutoRefresh({ seconds, renderedAt }: { seconds: number; renderedAt: string }) {
  const router = useRouter()
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const id = setInterval(() => router.refresh(), seconds * 1000)
    return () => clearInterval(id)
  }, [paused, router, seconds])

  return (
    <div className="flex items-center gap-3 text-xs text-slate-500">
      <span>
        Updated {new Date(renderedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
        {paused ? ' · auto-refresh paused' : ` · refreshes every ${seconds}s`}
      </span>
      <button type="button" onClick={() => setPaused((p) => !p)} className="font-semibold text-brand hover:underline">
        {paused ? 'Resume' : 'Pause'}
      </button>
      <button type="button" onClick={() => router.refresh()} className="font-semibold text-brand hover:underline">
        Refresh now
      </button>
    </div>
  )
}
