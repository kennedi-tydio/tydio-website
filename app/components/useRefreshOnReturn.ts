'use client'

import { useEffect } from 'react'
import { useRouter } from './NavigationSpinner'

// The first page of a full load was just rendered by the server, so it's fresh.
// Every later mount in the same document is a client-side navigation.
let servedFreshFromServer = true

// Re-fetches the page's server data whenever someone comes back to it, so
// things they changed elsewhere show up without a manual reload. Without this
// a page can come back stale in three ways:
//  - Back/forward within the app: Next reuses the page it cached for that
//    history entry instead of asking the server again.
//  - Back from an external site (e.g. Stripe's hosted pages): the browser
//    restores the page from its back/forward cache exactly as it was left.
//  - Switching back to the tab after making changes in another one.
export function useRefreshOnReturn() {
  const router = useRouter()

  useEffect(() => {
    if (servedFreshFromServer) servedFreshFromServer = false
    else router.refresh()

    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) router.refresh()
    }
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') router.refresh()
    }

    window.addEventListener('pageshow', handlePageShow)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('pageshow', handlePageShow)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [router])
}
