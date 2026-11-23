'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from '@/app/components/NavigationSpinner'
import { TIDY_PRO_SERVICES, type TidyProService } from '@/lib/tidyProServices'
import { saveServicesAction } from './actions'
import { missingPricesMessage } from '@/lib/fullServiceRates'

type PricedServices = { standardCleaning: boolean; deepCleaning: boolean }

export default function ServicesView({
  initialServices,
  priced,
  pricesSaved = false,
  added = null,
}: {
  // The service whose prices were just saved and that was added with them.
  added?: 'standard' | 'deep' | null
  initialServices: TidyProService[]
  // Just came back from saving Standard & Deep Cleaning prices.
  pricesSaved?: boolean
  // Whether Standard / Deep Cleaning has a base price set. Without one, the
  // Tidy Pro isn't matched to that service (they still get everything else).
  priced: PricedServices
}) {
  const [selected, setSelected] = useState<Set<TidyProService>>(() => new Set(initialServices))
  const [saved, setSaved] = useState<Set<TidyProService>>(() => new Set(initialServices))
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function toggle(key: TidyProService) {
    setMessage(null)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Standard / Deep Cleaning can't be saved as a service until it has prices.
  function unpricedTicked(): ('standard' | 'deep')[] {
    return (['standardCleaning', 'deepCleaning'] as const)
      .filter((k) => selected.has(k) && !priced[k])
      .map((k) => (k === 'deepCleaning' ? 'deep' : 'standard'))
  }

  function handleSave() {
    setMessage(null)
    const missing = missingPricesMessage(unpricedTicked())
    if (missing) {
      setMessage({ type: 'error', text: missing })
      return
    }
    startTransition(async () => {
      const chosen = Array.from(selected)
      const result = await saveServicesAction(chosen)
      if (result.error) {
        setMessage({ type: 'error', text: result.error })
        return
      }
      setSaved(new Set(chosen))
      const needsPrices = chosen.some((s) => (s === 'standardCleaning' || s === 'deepCleaning') && !priced[s])
      setMessage({
        type: 'success',
        text: needsPrices ? 'Services saved. Next, set your Standard & Deep Cleaning prices.' : 'Services saved.',
      })
    })
  }

  function pricingHref(key: 'standardCleaning' | 'deepCleaning'): string {
    return `/pro/profile/services/pricing?service=${key === 'deepCleaning' ? 'deep' : 'standard'}`
  }

  // The pricing page only shows services that are saved as offered, so a
  // service ticked again but not saved yet is saved first.
  function openPricing(e: React.MouseEvent, key: 'standardCleaning' | 'deepCleaning') {
    e.stopPropagation()
    const unsaved = selected.size !== saved.size || Array.from(selected).some((s) => !saved.has(s))
    if (!unsaved) return
    e.preventDefault()
    // Not priced yet: price it first; saving the prices adds the service.
    if (!priced[key] && !saved.has(key)) {
      router.push(`${pricingHref(key)}&add=1`)
      return
    }
    if (isPending) return
    setMessage(null)
    startTransition(async () => {
      const chosen = Array.from(selected)
      const result = await saveServicesAction(chosen)
      if (result.error) {
        setMessage({ type: 'error', text: result.error })
        return
      }
      setSaved(new Set(chosen))
      router.push(pricingHref(key))
    })
  }

  return (
    <main id="main-content" className="min-h-svh bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-10 pb-16 max-w-sm mx-auto w-full">
        <Link href="/pro/profile" className="flex items-center gap-1.5 mb-6 text-sm text-slate-500">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to Profile
        </Link>

        <h1 className="text-2xl font-bold text-slate-900 mb-2">Services Provided</h1>
        <p className="text-sm text-slate-500 mb-6">Check every service you provide. You can change these any time.</p>

        {pricesSaved && (
          <p role="status" className="text-sm font-semibold text-emerald-700 bg-emerald-50 rounded-xl px-4 py-3 mb-5">
            {added
              ? `✓ ${added === 'deep' ? 'Deep' : 'Standard'} Cleaning is added to your services, and your prices are saved.`
              : '✓ Your Standard & Deep Cleaning prices are saved.'}
          </p>
        )}

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
                  {(service.key === 'standardCleaning' || service.key === 'deepCleaning') && checked && (
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2">
                      <span className={`text-xs font-semibold ${priced[service.key] ? 'text-emerald-700' : 'text-red-600'}`}>
                        {priced[service.key] ? '✓ Prices set' : 'Set your prices to receive these requests'}
                      </span>
                      <Link
                        href={pricingHref(service.key)}
                        onClick={(e) => openPricing(e, service.key as 'standardCleaning' | 'deepCleaning')}
                        aria-disabled={isPending}
                        className="text-xs font-semibold text-white bg-brand rounded-lg px-3 py-1.5"
                      >
                        {priced[service.key] ? 'Edit' : 'Set prices'}
                      </Link>
                    </span>
                  )}
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
