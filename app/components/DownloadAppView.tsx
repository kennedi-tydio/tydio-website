'use client'

import { useState } from 'react'
import Link from 'next/link'
import AddToHomeScreenGuide from '@/app/components/AddToHomeScreenGuide'
import { dismissInstallGuide } from '@/app/components/installGuide'
import { useIsStandalone } from '@/app/components/pushSubscription'

function IconBack() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M10 12L6 8l4-4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Profile → Download app: the add-to-home-screen steps, always available after
// the one-time install prompt has been skipped or dismissed.
export default function DownloadAppView({ backHref, notificationsHref }: { backHref: string; notificationsHref: string }) {
  const standalone = useIsStandalone()
  const [added, setAdded] = useState(false)

  function handleDone() {
    dismissInstallGuide()
    setAdded(true)
  }

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-10 pb-16 max-w-sm mx-auto w-full">
        <Link
          href={backHref}
          aria-label="Back to Profile"
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-2 mb-4"
        >
          <IconBack />
        </Link>

        {standalone || added ? (
          <>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Download the app</h1>
            <p className="text-sm text-slate-600 mb-4">
              {standalone
                ? "You're using the Tydio app from your home screen."
                : 'Now open Tydio from the icon on your home screen. You may need to log in once more the first time.'}
            </p>
            {standalone && (
              <Link href={notificationsHref} className="text-sm text-brand underline underline-offset-2">
                Check your notification settings
              </Link>
            )}
            {added && !standalone && (
              <button type="button" onClick={() => setAdded(false)} className="text-sm text-slate-500 underline underline-offset-2">
                Show the steps again
              </button>
            )}
          </>
        ) : (
          <AddToHomeScreenGuide titleId="download-app-title" variant="page" onDone={handleDone} skipLabel={null} />
        )}
      </div>
    </main>
  )
}
