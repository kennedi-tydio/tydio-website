'use client'

import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import { useEffect } from 'react'

// The admin dashboard is left out of analytics entirely: no events, no
// pageviews, no screen recording.
export function isAdminPath(pathname: string) {
  return pathname === '/admin' || pathname.startsWith('/admin/')
}

// A production build run on this machine (`next start`, or a phone on the LAN
// hitting it) still reports NODE_ENV 'production', so check the address too.
function isLocalHostname(hostname: string) {
  return /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|.*\.local)$/.test(
    hostname,
  )
}

export function PHProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // NODE_ENV is 'production' in any `next build` and 'development' under
    // `next dev`; together with the local-address check, local testing never
    // reaches analytics.
    if (
      process.env.NEXT_PUBLIC_POSTHOG_KEY &&
      process.env.NODE_ENV === 'production' &&
      !isLocalHostname(window.location.hostname)
    ) {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? '/ingest',
        ui_host: 'https://us.posthog.com',
        person_profiles: 'identified_only',
        capture_pageview: false,
        capture_pageleave: true,
        disable_session_recording: isAdminPath(window.location.pathname),
        // Drop anything sent while on an admin page.
        before_send: (event) => (isAdminPath(window.location.pathname) ? null : event),
      })
    }
  }, [])

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>
}
