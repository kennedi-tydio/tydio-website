'use client'

import { usePostHog } from 'posthog-js/react'
import { logoutAction } from '@/app/dashboard/actions'

// Clears the PostHog identity before the server action signs the user out, so
// the next person on this device isn't tracked as them.
export default function SignOutForm({ className, buttonClassName }: { className?: string; buttonClassName?: string }) {
  const posthog = usePostHog()

  return (
    <form action={logoutAction} onSubmit={() => posthog?.reset()} className={className}>
      <button type="submit" className={buttonClassName}>
        Sign out
      </button>
    </form>
  )
}
