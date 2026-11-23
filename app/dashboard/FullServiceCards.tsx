'use client'

import { useState, useTransition } from 'react'
import { useRouter } from '@/app/components/NavigationSpinner'
import {
  FULL_SERVICE_LABEL,
  isCompleteSelection,
  scopeLabel,
  type FullServiceSelection,
  type FullServiceType,
} from '@/lib/fullService'
import { clearFullServiceAction, startFullServiceAction } from '@/app/book/full-service/actions'

const BLURB: Record<FullServiceType, string> = {
  standard: 'Routine cleaning of your whole home or chosen rooms.',
  deep: 'Everything in Standard, plus detailed cleaning.',
}

// Spray bottle: a routine clean.
function IconStandardClean() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-brand)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 9h5l1 3v8a1 1 0 01-1 1H9a1 1 0 01-1-1v-8l1-3z" />
      <path d="M10 9V6h3v3" />
      <path d="M13 6h3l1.5 1.5" />
      <path d="M19 4.5l1.5-1M19.5 7h2M19 9.5l1.5 1" />
    </svg>
  )
}

// Scrub brush with sparkles: a deep clean.
function IconDeepClean() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-brand)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="13" height="5" rx="1.5" />
      <path d="M5 16v3M8 16v3M11 16v3M14 16v3" />
      <path d="M8 11V9a2 2 0 012-2h2" />
      <path d="M19 3l.7 1.8L21.5 5.5l-1.8.7L19 8l-.7-1.8L16.5 5.5l1.8-.7z" />
      <path d="M20 11l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4z" />
    </svg>
  )
}

// Top of the customer's Home: start a Standard or Deep Cleaning, or pick up
// the one they're part-way through booking.
export default function FullServiceCards({ selection }: { selection: FullServiceSelection | null }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function start(type: FullServiceType) {
    setError(null)
    startTransition(async () => {
      const result = await startFullServiceAction(type)
      if (result.error) setError(result.error)
      else router.push('/book/full-service/scope')
    })
  }

  if (selection) {
    const resumeHref = isCompleteSelection(selection) ? `/book/full-service/${selection.step}` : '/book/full-service/scope'
    return (
      <div className="rounded-2xl border border-brand bg-[#f0fafa] px-4 py-4 mb-7">
        <p className="text-xs font-semibold text-brand mb-0.5">In progress</p>
        <p className="text-base font-bold text-slate-900">Your {FULL_SERVICE_LABEL[selection.type]}</p>
        <p className="text-sm text-slate-600 mb-3">{scopeLabel(selection)}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => router.push(resumeHref)}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ backgroundColor: '#1a2332' }}
          >
            Continue booking
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await clearFullServiceAction()
                router.refresh()
              })
            }
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-700 border border-slate-200 bg-white"
          >
            Remove
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-7">
      <div className="grid grid-cols-2 gap-3">
        {(['standard', 'deep'] as FullServiceType[]).map((type) => (
          <button
            key={type}
            type="button"
            disabled={pending}
            onClick={() => start(type)}
            // A column from the top-left, so the icon and title sit at the same
            // height on both cards whatever the description's length.
            className="flex flex-col items-start justify-start h-full text-left rounded-2xl border border-slate-100 shadow-sm px-4 py-4 hover:border-brand transition-colors disabled:opacity-60"
          >
            <span className="w-10 h-10 rounded-xl bg-[#f0fafa] flex items-center justify-center mb-2.5" aria-hidden="true">
              {type === 'deep' ? <IconDeepClean /> : <IconStandardClean />}
            </span>
            <span className="block text-sm font-bold text-slate-900 leading-snug">Book a {FULL_SERVICE_LABEL[type]}</span>
            <span className="block text-xs text-slate-500 mt-1 leading-snug">{BLURB[type]}</span>
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-600 mt-2">
          {error}
        </p>
      )}
    </div>
  )
}
