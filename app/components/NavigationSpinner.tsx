'use client'

import { Suspense, useEffect, useMemo, useSyncExternalStore } from 'react'
// eslint-disable-next-line no-restricted-imports -- this is the wrapper the rule points everyone else to
import { usePathname, useRouter as useNextRouter, useSearchParams } from 'next/navigation'
import { LoadingSpinner } from './LoadingSpinner'
import {
  clickStartsNavigation,
  isNavigating,
  leadsToNewPage,
  startNavigation,
  stopNavigation,
  subscribeToNavigation,
} from '@/lib/navigationSpinner'

// next/navigation's useRouter, except that push and replace also bring up the
// loading wheel. refresh doesn't: the page stays on screen while it runs, and the
// message threads call it every few seconds to pick up new messages.
export function useRouter(): ReturnType<typeof useNextRouter> {
  const router = useNextRouter()
  return useMemo(
    () => ({
      ...router,
      push(href, options) {
        if (leadsToNewPage(href, window.location.href)) startNavigation()
        router.push(href, options)
      },
      replace(href, options) {
        if (leadsToNewPage(href, window.location.href)) startNavigation()
        router.replace(href, options)
      },
    }),
    [router]
  )
}

function NavigationSpinnerOverlay() {
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const visible = useSyncExternalStore(subscribeToNavigation, isNavigating, () => false)

  // The URL changes as the new route takes over, showing its loading.tsx or the page.
  useEffect(() => {
    stopNavigation()
  }, [pathname, search])

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(anchor instanceof HTMLAnchorElement)) return
      const link = { href: anchor.href, target: anchor.target, hasDownload: anchor.hasAttribute('download') }
      if (clickStartsNavigation(event, link, window.location.href)) startNavigation()
    }

    // Coming back to this page through the browser's back/forward cache restores it
    // exactly as it was left, which could be with the wheel showing.
    function handlePageShow() {
      stopNavigation()
    }

    // Capture phase, since Link cancels the click's default behavior further down.
    document.addEventListener('click', handleClick, true)
    window.addEventListener('pageshow', handlePageShow)
    return () => {
      document.removeEventListener('click', handleClick, true)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [])

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/70 pointer-events-none">
      <LoadingSpinner />
    </div>
  )
}

export default function NavigationSpinner() {
  return (
    <Suspense fallback={null}>
      <NavigationSpinnerOverlay />
    </Suspense>
  )
}
