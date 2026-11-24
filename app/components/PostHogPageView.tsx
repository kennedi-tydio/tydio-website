'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, Suspense } from 'react'
import { usePostHog } from 'posthog-js/react'
import { isAdminPath } from '../providers'

function PostHogPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const posthog = usePostHog()

  // Client-side navigation doesn't re-run init, so pause the screen recording
  // on entering the admin dashboard and resume it on leaving.
  useEffect(() => {
    if (!pathname || !posthog || !posthog.__loaded) return
    if (isAdminPath(pathname)) {
      if (posthog.sessionRecordingStarted()) posthog.stopSessionRecording()
    } else if (!posthog.sessionRecordingStarted()) {
      posthog.startSessionRecording()
    }
  }, [pathname, posthog])

  useEffect(() => {
    if (pathname && posthog) {
      let url = window.origin + pathname
      const search = searchParams.toString()
      if (search) url += `?${search}`
      const timer = setTimeout(() => {
        posthog.capture('$pageview', { $current_url: url })
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [pathname, searchParams, posthog])

  return null
}

export default function SuspendedPostHogPageView() {
  return (
    <Suspense fallback={null}>
      <PostHogPageView />
    </Suspense>
  )
}
