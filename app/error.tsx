'use client'

import { useEffect } from 'react'
import Image from 'next/image'

const CONTACT_EMAIL = 'kennedicoats@tydioapp.com'

// Shown when a page fails to load. In production Next.js replaces server error
// messages with a generic one, so this never shows database details.
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-12">
      <Image src="/Tydio Logo No Bkg.png" alt="Tydio" width={120} height={44} priority className="mb-8" />

      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-100 p-8 flex flex-col items-center text-center gap-4">
        <div>
          <h1 className="font-bold text-slate-900 text-xl">This page didn&apos;t load</h1>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            Something went wrong on our end. Try again, and if it keeps happening, email{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-sky-600 underline underline-offset-2">{CONTACT_EMAIL}</a>.
          </p>
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
