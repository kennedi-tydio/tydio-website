'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { usePostHog } from 'posthog-js/react'

// Rendered by the signed-in layouts, which read the httpOnly session cookie on
// the server. Sends only the profile ID and role — never email or name.
// Rechecks on navigation so a reset (e.g. a failed account deletion) recovers.
export default function PostHogIdentify({ profileId, role }: { profileId: string; role: 'USER' | 'TIDYPRO' | 'ADMIN' }) {
  const posthog = usePostHog()
  const pathname = usePathname()

  useEffect(() => {
    if (!posthog?.__loaded) return
    if (posthog.get_distinct_id() !== profileId) {
      posthog.identify(profileId, { role })
    }
  }, [posthog, profileId, role, pathname])

  return null
}
