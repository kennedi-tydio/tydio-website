'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { TIDY_PRO_SERVICES, type TidyProService } from '@/lib/tidyProServices'
import { saveServicesAction } from './actions'

export default function ServicesView({ initialServices }: { initialServices: TidyProService[] }) {
  const [selected, setSelected] = useState<Set<TidyProService>>(() => new Set(initialServices))
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  function toggle(key: TidyProService) {
    setMessage(null)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function handleSave() {
    setMessage(null)
    startTransition(async () => {
      const result = await saveServicesAction(Array.from(selected))
      setMessage(result.error ? { type: 'error', text: result.error } : { type: 'success', text: 'Services saved.' })
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

        <h1 className="text-2xl font-bold text-slate-900 mb-2">Services Provided</h1>
        <p className="text-sm text-slate-500 mb-6">Check every service you provide. You can change these any time.</p>

        <fieldset className="flex flex-col gap-3 mb-6">
          <legend className="sr-only">Services you provide</legend>
          {TIDY_PRO_SERVICES.map((service) => {
            const checked = selected.has(service.key)
            return (
              <label
                key={service.key}
                className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 cursor-pointer transition-colors ${
                  checked ? 'border-brand bg-[#f0fafa]' : 'border-slate-100 bg-white'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(service.key)}
                  className="sr-only peer"
                />
                <span
                  aria-hidden="true"
                  className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 ${
                    checked ? 'border-brand bg-brand' : 'border-slate-300'
                  }`}
                >
                  {checked && (
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <path d="M2 5.5l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold text-slate-900">{service.label}</span>
                    {service.comingSoon && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                        Coming soon
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-slate-500 leading-relaxed mt-0.5">{service.description}</span>
                </span>
              </label>
            )
          })}
        </fieldset>

        {message && (
          <p role="alert" className={`text-sm mb-4 ${message.type === 'error' ? 'text-red-500' : 'text-emerald-600'}`}>
            {message.text}
          </p>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || selected.size === 0}
          className="w-full py-3.5 rounded-2xl text-white font-semibold text-sm disabled:opacity-40 transition-opacity"
          style={{ backgroundColor: 'var(--color-brand)' }}
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </main>
  )
}
