'use client'

import Link from 'next/link'
import { useIsStandalone } from '@/app/components/pushSubscription'

// Top-of-profile nudge to add Tydio to the home screen. Hidden once they're
// using the installed app (opened from the home screen).
export default function DownloadAppCard({ href }: { href: string }) {
  const standalone = useIsStandalone()
  if (standalone) return null

  return (
    <Link
      href={href}
      className="w-full rounded-2xl px-5 py-4 mb-4 shadow-sm flex items-center justify-between gap-3 text-white"
      style={{ backgroundColor: 'var(--color-brand)' }}
    >
      <span>
        <span className="block font-semibold text-sm">Download the app</span>
        <span className="block text-xs opacity-90 mt-0.5">Add Tydio to your home screen to get push notifications.</span>
      </span>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="flex-none">
        <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  )
}
