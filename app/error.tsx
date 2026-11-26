'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import posthog from 'posthog-js'
import { isNetworkError } from '@/lib/networkError'

const CONTACT_EMAIL = 'kennedicoats@tydioapp.com'

// When the page last retried by itself after a dropped connection, so a
// connection that keeps failing settles on this page instead of looping.
let lastAutoRetryAt = 0
const AUTO_RETRY_GAP_MS = 15_000

// Shown when a page fails to load. In production Next.js replaces server error
// messages with a generic one, so this never shows database details.
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  // A request from the page that never finished (lost signal, screen locked,
  // switched apps — iPhones drop the request): nothing is wrong on our end.
  const connectionDropped = isNetworkError(error)

  useEffect(() => {
    console.error(error)
    // A crash in the browser never reaches the server's logs, so it's sent to
    // PostHog (Error tracking) with the page it happened on. Server errors arrive
    // here with only their digest, which matches the server's own log line.
    // Does nothing where PostHog isn't set up (local testing, the admin dashboard).
    try {
      // (This component is named Error, so the built-in is reached through globalThis.)
      const err = error instanceof globalThis.Error ? error : new globalThis.Error(String(error))
      const digest = (error as { digest?: string } | null)?.digest
      posthog.captureException(err, { error_page: window.location.pathname, connection_dropped: connectionDropped, ...(digest ? { digest } : {}) })
    } catch {
      // Reporting must never break the error page itself.
    }
  }, [error, connectionDropped])

  // After a dropped connection, try again by itself as soon as the phone is
  // online with the page on screen (now, or when they come back to the app).
  useEffect(() => {
    if (!connectionDropped) return
    function retryWhenReady() {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return
      if (Date.now() - lastAutoRetryAt < AUTO_RETRY_GAP_MS) return
      lastAutoRetryAt = Date.now()
      retry()
    }
    const timer = window.setTimeout(retryWhenReady, 1000)
    window.addEventListener('online', retryWhenReady)
    document.addEventListener('visibilitychange', retryWhenReady)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('online', retryWhenReady)
      document.removeEventListener('visibilitychange', retryWhenReady)
    }
  }, [connectionDropped, retry])

  return (
    <main id="main-content" className="min-h-svh bg-slate-50 flex flex-col items-center justify-center px-4 py-12">
      <Image src="/Tydio Logo No Bkg.png" alt="Tydio" width={120} height={44} priority className="mb-8" />

      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-100 p-8 flex flex-col items-center text-center gap-4">
        <div>
          <h1 className="font-bold text-slate-900 text-xl">
            {connectionDropped ? 'Your connection dropped' : <>This page didn&apos;t load</>}
          </h1>
          {connectionDropped ? (
            <p className="text-sm text-slate-500 mt-2 leading-relaxed">
              The page couldn&apos;t reach Tydio. Check your signal or Wi-Fi and tap Try again. Anything you&apos;d already
              saved is still there.
            </p>
          ) : (
            <p className="text-sm text-slate-500 mt-2 leading-relaxed">
              Something went wrong on our end. Try again, and if it keeps happening, email{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-sky-600 underline underline-offset-2">{CONTACT_EMAIL}</a>.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => retry()}
          className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-brand)' }}
        >
          Try again
        </button>
      </div>
    </main>
  )
}
