// A "detour" is a page the customer opens from Review Your Request to change
// something (pets, payment method) before coming back. Returning by pushing
// /book/review again would leave the detour page in the history, so the Review
// page's Back button would land on it instead of the previous booking step.
// So the detour page goes back in history instead (the Review page reloads its
// data whenever it's shown, so the change is still picked up).

type Router = { back: () => void; push: (href: string) => void }

const DETOUR_KEY = 'tydio:review-detour'

/** Call when the customer taps a link on the Review page that leads to a detour. */
export function startReviewDetour(detourPath: string) {
  try {
    sessionStorage.setItem(DETOUR_KEY, detourPath)
  } catch {}
}

/** On the Review page: back on it by any route, so an unfinished detour no longer applies. */
export function endReviewDetour() {
  try {
    sessionStorage.removeItem(DETOUR_KEY)
  } catch {}
}

/** Return to the Review page from the detour page at `detourPath`. */
export function returnToReview(router: Router, detourPath: string) {
  let cameFromReview = false
  try {
    cameFromReview = sessionStorage.getItem(DETOUR_KEY) === detourPath
    sessionStorage.removeItem(DETOUR_KEY)
  } catch {}
  // Opened some other way (a reload in a new tab, a shared link): no Review page to go back to.
  if (cameFromReview && window.history.length > 1) router.back()
  else router.push('/book/review')
}
