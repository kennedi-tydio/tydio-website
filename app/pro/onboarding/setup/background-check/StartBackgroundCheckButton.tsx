'use client'

import { useState, useTransition } from 'react'
import { useRouter } from '@/app/components/NavigationSpinner'
import { startBackgroundCheckAction } from '../../actions'

export default function StartBackgroundCheckButton({ label, feeCents }: { label: string; feeCents: number }) {
  const router = useRouter()
  const [acceptedFeeTerms, setAcceptedFeeTerms] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await startBackgroundCheckAction({ acceptedFeeTerms, displayedFeeCents: feeCents })
      if ('redirectUrl' in result) {
        window.location.href = result.redirectUrl
      } else if ('error' in result) {
        setError(result.error)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <>
      <label className="flex items-start gap-2.5 text-sm text-slate-700 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={acceptedFeeTerms}
          onChange={(e) => setAcceptedFeeTerms(e.target.checked)}
          className="mt-0.5"
        />
        I agree to the background-screening fee and refund terms
      </label>
      {error && (
        <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4 leading-relaxed">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending || !acceptedFeeTerms}
        className="w-full py-4 rounded-2xl text-white font-semibold text-base tracking-wide disabled:opacity-40 transition-opacity"
        style={{ backgroundColor: 'var(--color-brand)' }}
      >
        {isPending ? 'Please wait…' : label}
      </button>
    </>
  )
}
