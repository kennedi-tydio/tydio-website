'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { MAX_TRAVEL_RADIUS_MILES } from '@/lib/cleanerMatching'
import { saveTravelRadiusAction } from './actions'

const DEFAULT_MILES = 10

export default function TravelDistanceView({ initialMiles }: { initialMiles: number | null }) {
  const [miles, setMiles] = useState(initialMiles ?? DEFAULT_MILES)
  const [savedMiles, setSavedMiles] = useState(initialMiles)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const percent = ((miles - 1) / (MAX_TRAVEL_RADIUS_MILES - 1)) * 100

  function handleSave() {
    setMessage(null)
    startTransition(async () => {
      const result = await saveTravelRadiusAction(miles)
      if (result.error) {
        setMessage({ type: 'error', text: result.error })
      } else {
        setSavedMiles(miles)
        setMessage({ type: 'success', text: 'Travel distance saved.' })
      }
    })
  }

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-10 pb-16 max-w-sm mx-auto w-full">
        <Link href="/pro/profile" className="flex items-center gap-1.5 mb-6 text-sm text-slate-500">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to Profile
        </Link>

        <h1 className="text-2xl font-bold text-slate-900 mb-6">Travel Distance</h1>

        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm mb-6">
          <p className="font-semibold text-slate-900 mb-1">How far are you willing to travel?</p>
          <p className="text-sm text-slate-400 mb-6">
            We&apos;ll only show you to customers within this distance of your address.
          </p>

          <p className="text-center mb-4">
            <span className="text-4xl font-bold" style={{ color: 'var(--color-brand)' }}>{miles}</span>
            <span className="text-base font-medium text-slate-500 ml-1.5">{miles === 1 ? 'mile' : 'miles'}</span>
          </p>

          <input
            type="range"
            min={1}
            max={MAX_TRAVEL_RADIUS_MILES}
            step={1}
            value={miles}
            onChange={(e) => {
              setMiles(Number(e.target.value))
              setMessage(null)
            }}
            aria-label="Travel distance in miles"
            className="w-full h-2 rounded-full appearance-none cursor-pointer"
            style={{
              accentColor: 'var(--color-brand)',
              background: `linear-gradient(to right, var(--color-brand) ${percent}%, #e2e8f0 ${percent}%)`,
            }}
          />
          <div className="flex justify-between text-xs text-slate-400 mt-2">
            <span>1 mile</span>
            <span>{MAX_TRAVEL_RADIUS_MILES} miles</span>
          </div>
        </div>

        {message && (
          <p role="alert" className={`text-sm mb-4 ${message.type === 'error' ? 'text-red-500' : 'text-emerald-600'}`}>
            {message.text}
          </p>
        )}

        <button
          onClick={handleSave}
          disabled={isPending || miles === savedMiles}
          className="w-full py-4 rounded-2xl text-white font-semibold text-base tracking-wide disabled:opacity-50"
          style={{ backgroundColor: '#1a2332' }}
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </main>
  )
}
