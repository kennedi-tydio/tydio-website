// Tracks whether a page navigation is under way, so the loading wheel can show
// during the gap before a route's loading.tsx arrives. That gap is nothing when a
// route is prefetched, but lasts as long as the server takes when it isn't — always
// the case for a route still compiling in development.

// A prefetched route swaps in faster than this, and shouldn't flash the wheel.
const SHOW_DELAY_MS = 150
// A navigation can end without the URL changing (a server redirect back to the
// current page, a failed request), and nothing reports that, so the wheel gives up.
const GIVE_UP_MS = 30_000

let visible = false
let showTimer: ReturnType<typeof setTimeout> | null = null
let giveUpTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

function setVisible(next: boolean) {
  if (visible === next) return
  visible = next
  listeners.forEach((listener) => listener())
}

function clearTimers() {
  if (showTimer) clearTimeout(showTimer)
  if (giveUpTimer) clearTimeout(giveUpTimer)
  showTimer = null
  giveUpTimer = null
}

export function startNavigation() {
  clearTimers()
  showTimer = setTimeout(() => setVisible(true), SHOW_DELAY_MS)
  giveUpTimer = setTimeout(stopNavigation, GIVE_UP_MS)
}

export function stopNavigation() {
  clearTimers()
  setVisible(false)
}

export function isNavigating(): boolean {
  return visible
}

export function subscribeToNavigation(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// False for anything that won't replace the current page: another site, a mailto:
// or tel: link, or only a change of #hash.
export function leadsToNewPage(href: string, currentHref: string): boolean {
  const target = new URL(href, currentHref)
  const current = new URL(currentHref)
  if (target.origin !== current.origin) return false
  return target.pathname !== current.pathname || target.search !== current.search
}

type ClickInfo = { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }
type AnchorInfo = { href: string; target: string; hasDownload: boolean }

// Clicks that open a new tab or window, or save a file, leave this page where it is.
export function clickStartsNavigation(click: ClickInfo, anchor: AnchorInfo, currentHref: string): boolean {
  if (click.button !== 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return false
  if ((anchor.target && anchor.target !== '_self') || anchor.hasDownload) return false
  return leadsToNewPage(anchor.href, currentHref)
}
