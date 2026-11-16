'use client'

import { useState, useTransition } from 'react'
import { setTidyProVerifiedAction } from '../../actions'

// Click to verify a Tidy Pro (or take it back). Verified Tidy Pros get the badge on
// their profile. It flips straight away and flips back if the save fails.
export function VerifiedToggle({ proId, name, initialVerified }: { proId: string; name: string; initialVerified: boolean }) {
  const [verified, setVerified] = useState(initialVerified)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function toggle() {
    const next = !verified
    setVerified(next)
    setError(null)
    startTransition(async () => {
      const result = await setTidyProVerifiedAction(proId, next)
      if (result.error) {
        setVerified(!next)
        setError(result.error)
      }
    })
  }

  return (
    <span className="inline-flex flex-col items-start">
      {verified ? (
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md border border-green-200 bg-green-50 px-1.5 py-0.5 text-xs font-semibold text-green-700">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            Verified
          </span>
          <button
            type="button"
            onClick={toggle}
            disabled={pending}
            aria-label={`Unverify ${name}`}
            className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-60"
          >
            Unverify
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          aria-label={`Verify ${name}`}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-60"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Verify
        </button>
      )}
      {error && (
        <span role="alert" className="text-[11px] font-normal text-red-600 mt-0.5">
          {error}
        </span>
      )}
    </span>
  )
}
