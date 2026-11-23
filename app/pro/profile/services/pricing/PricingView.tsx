'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from '@/app/components/NavigationSpinner'
import {
  ADD_ONS,
  DEFAULT_ROOM_PERCENTS,
  FULL_SERVICE_LABEL,
  MAX_BASE_TAKE_HOME,
  MIN_BASE_TAKE_HOME,
  ROOM_TYPES,
  defaultTakeHome,
  round2,
  roomPercentForPrice,
  roomPriceForPercent,
  type AddOnKey,
  type FullServiceType,
  type RoomTypeKey,
} from '@/lib/fullService'
import { SQUARE_FOOTAGE_MULTIPLIER } from '@/lib/pricingRules'
import { SQUARE_FOOTAGE_OPTIONS } from '@/lib/squareFootage'
import type { AddOnRate } from '@/lib/fullServiceRates'
import { saveFullServiceRatesAction } from './actions'

// Every amount on this page is what the Tidy Pro earns. Room prices are typed
// in dollars and kept as a percentage of the whole-home price (that's what's
// stored), so changing the whole-home price moves every room with it.

type Initial = {
  standardBase: number | null
  deepBase: number | null
  standardRooms: Record<RoomTypeKey, number>
  deepRooms: Record<RoomTypeKey, number>
  addOns: Record<AddOnKey, AddOnRate>
}

// A room's percentage, plus what the Tidy Pro is typing until they leave the field.
type RoomState = { percent: number; text: string | null }

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

// A typed amount, or null while it's blank or not a number.
function parseAmount(text: string): number | null {
  const n = Number(text.replace(/[$,\s]/g, ''))
  return text.trim() !== '' && Number.isFinite(n) ? n : null
}

function toText(n: number | null): string {
  return n == null ? '' : String(n)
}

function roomsFrom(percents: Record<RoomTypeKey, number>): Record<RoomTypeKey, RoomState> {
  return Object.fromEntries(ROOM_TYPES.map((r) => [r.key, { percent: percents[r.key], text: null }])) as Record<RoomTypeKey, RoomState>
}

export default function PricingView({
  offers,
  initial,
  initialTab = 'standard',
  adding = null,
}: {
  offers: Record<FullServiceType, boolean>
  initialTab?: FullServiceType
  // The service they just ticked on Services Provided: saving adds it.
  adding?: FullServiceType | null
  initial: Initial
}) {
  const offered = (['standard', 'deep'] as FullServiceType[]).filter((t) => offers[t])
  const [tab, setTab] = useState<FullServiceType>(offered.includes(initialTab) ? initialTab : (offered[0] ?? 'standard'))
  const [base, setBase] = useState<Record<FullServiceType, string>>({
    standard: toText(initial.standardBase),
    deep: toText(initial.deepBase),
  })
  const [rooms, setRooms] = useState<Record<FullServiceType, Record<RoomTypeKey, RoomState>>>(() => ({
    standard: roomsFrom(initial.standardRooms),
    deep: roomsFrom(initial.deepRooms),
  }))
  const [addOns, setAddOns] = useState<Record<AddOnKey, { enabled: boolean; takeHome: string }>>(
    () =>
      Object.fromEntries(
        ADD_ONS.map((a) => [a.key, { enabled: initial.addOns[a.key].enabled, takeHome: initial.addOns[a.key].takeHome.toFixed(2) }])
      ) as Record<AddOnKey, { enabled: boolean; takeHome: string }>
  )
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const validBase = (t: FullServiceType) => {
    const n = parseAmount(base[t])
    return n != null && n >= MIN_BASE_TAKE_HOME && n <= MAX_BASE_TAKE_HOME ? n : null
  }
  const baseAmount = parseAmount(base[tab])
  const baseValue = validBase(tab)

  const addOnsForTab = useMemo(() => ADD_ONS.filter((a) => a.services.includes(tab)), [tab])

  if (offered.length === 0) {
    return (
      <Shell>
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          You don&apos;t offer Standard or Deep Cleaning. To set prices for them, add them on Services Provided first.
        </p>
        <Link href="/pro/profile/services" className="text-sm font-semibold text-brand underline">
          Go to Services Provided
        </Link>
      </Shell>
    )
  }

  function edited() {
    setMessage(null)
  }

  // Whether an add-on is at Tydio's suggested price (what's typed, to the cent).
  function isSuggestedAddOn(key: AddOnKey): boolean {
    const a = ADD_ONS.find((x) => x.key === key)!
    return parseAmount(addOns[key].takeHome) === defaultTakeHome(a.defaultCustomerPrice)
  }

  // Puts one add-on back to Tydio's suggested price; whether it's offered stays as it is.
  function resetAddOnPrice(key: AddOnKey) {
    const a = ADD_ONS.find((x) => x.key === key)!
    edited()
    setAddOns((prev) => ({ ...prev, [key]: { ...prev[key], takeHome: defaultTakeHome(a.defaultCustomerPrice).toFixed(2) } }))
  }

  // Whether a typed room price works with this whole-home price.
  function roomError(t: FullServiceType, text: string): string | null {
    const b = validBase(t)
    const n = parseAmount(text)
    if (n == null || n <= 0) return 'Enter a price over $0'
    if (b != null && n > b) return 'Can’t be more than your whole-home price'
    return null
  }

  // A finished room price becomes its percentage of the whole-home price.
  function commitRoom(t: FullServiceType, key: RoomTypeKey) {
    const b = validBase(t)
    setRooms((prev) => {
      const room = prev[t][key]
      if (room.text == null || b == null || roomError(t, room.text)) return prev
      const percent = roomPercentForPrice(b, parseAmount(room.text)!)
      return { ...prev, [t]: { ...prev[t], [key]: { percent, text: null } } }
    })
  }

  function handleSave() {
    setMessage(null)
    // Rooms still being typed in are worked out the same way as on leaving the field.
    const percentsFor = (t: FullServiceType): Partial<Record<RoomTypeKey, number>> | string => {
      const b = validBase(t)
      const out: Partial<Record<RoomTypeKey, number>> = {}
      for (const r of ROOM_TYPES) {
        const room = rooms[t][r.key]
        if (room.text == null || b == null) {
          out[r.key] = room.percent
          continue
        }
        const problem = roomError(t, room.text)
        if (problem) return `${FULL_SERVICE_LABEL[t]}, ${r.label}: ${problem.toLowerCase()}.`
        out[r.key] = roomPercentForPrice(b, parseAmount(room.text)!)
      }
      return out
    }
    const standardRooms = percentsFor('standard')
    const deepRooms = percentsFor('deep')
    if (typeof standardRooms === 'string' || typeof deepRooms === 'string') {
      setMessage({ type: 'error', text: (typeof standardRooms === 'string' ? standardRooms : deepRooms) as string })
      return
    }
    startTransition(async () => {
      const result = await saveFullServiceRatesAction({
        // A service they don't offer right now keeps whatever price it had, so
        // switching it off and on again doesn't lose it.
        standardBaseTakeHome: parseAmount(base.standard),
        deepBaseTakeHome: parseAmount(base.deep),
        standardRoomPercents: standardRooms,
        deepRoomPercents: deepRooms,
        addOns: Object.fromEntries(
          ADD_ONS.map((a) => [a.key, { enabled: addOns[a.key].enabled, takeHome: parseAmount(addOns[a.key].takeHome) }])
        ),
      }, adding)
      if (result.error) {
        setMessage({ type: 'error', text: result.error })
        return
      }
      // Back to Services Provided, which confirms the save.
      router.push(`/pro/profile/services?pricesSaved=1${adding ? `&added=${adding}` : ''}`)
    })
  }

  return (
    <Shell>
      <p className="text-sm text-slate-500 leading-relaxed mb-5">
        Every price here is <strong className="text-slate-700">what you earn</strong> for the job. Tips are extra.
      </p>
      {adding && (
        <p className="text-sm text-slate-700 bg-slate-50 rounded-xl px-4 py-3 mb-5">
          Set your {FULL_SERVICE_LABEL[adding]} prices to add it to your services. It&apos;s added when you save.
        </p>
      )}

      {offered.length > 1 && (
        <div role="tablist" aria-label="Service" className="grid grid-cols-2 gap-2 mb-6">
          {offered.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`py-2.5 rounded-xl text-sm font-semibold border ${
                tab === t ? 'border-brand bg-[#f0fafa] text-slate-900' : 'border-slate-100 text-slate-500'
              }`}
            >
              {FULL_SERVICE_LABEL[t]}
            </button>
          ))}
        </div>
      )}

      {/* Whole home */}
      <section className="mb-8" aria-labelledby="base-heading">
        <h2 id="base-heading" className="text-base font-bold text-slate-900 mb-1">
          {FULL_SERVICE_LABEL[tab]}: whole home
        </h2>
        <p className="text-xs text-slate-500 mb-3">
          What you earn for cleaning an entire home under 1,000 sq ft. Bigger homes pay more automatically.
        </p>
        <label className="block">
          <span className="sr-only">{FULL_SERVICE_LABEL[tab]}: what you earn for a whole home</span>
          <span className="flex items-center rounded-2xl border border-slate-200 px-4 py-3 focus-within:border-brand">
            <span className="text-slate-400 mr-1">$</span>
            <input
              inputMode="decimal"
              value={base[tab]}
              onChange={(e) => {
                edited()
                setBase((b) => ({ ...b, [tab]: e.target.value }))
              }}
              placeholder="e.g. 160"
              className="flex-1 outline-none text-slate-900 text-base"
            />
          </span>
        </label>
        {baseAmount != null && baseValue == null && (
          <p className="text-xs text-red-600 mt-2">
            Enter a price from ${MIN_BASE_TAKE_HOME} to ${MAX_BASE_TAKE_HOME}.
          </p>
        )}
        {baseValue != null && (
          <table className="w-full text-xs mt-3">
            <caption className="sr-only">What you earn for a whole home, by home size</caption>
            <thead>
              <tr className="text-slate-500">
                <th scope="col" className="text-left font-medium py-1">Home size</th>
                <th scope="col" className="text-right font-medium py-1">You earn</th>
              </tr>
            </thead>
            <tbody>
              {SQUARE_FOOTAGE_OPTIONS.map((o) => (
                <tr key={o.value} className="border-t border-slate-100">
                  <td className="py-1.5 text-slate-700">{o.label}</td>
                  <td className="py-1.5 text-right text-slate-900 font-semibold">
                    {money(round2(baseValue * SQUARE_FOOTAGE_MULTIPLIER[o.value]))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Rooms */}
      <section className="mb-8" aria-labelledby="rooms-heading">
        <h2 id="rooms-heading" className="text-base font-bold text-slate-900 mb-1">Single rooms</h2>
        <p className="text-xs text-slate-500 mb-3">
          What you earn when a customer books just that room, in a home under 1,000 sq ft. Bigger homes pay more
          automatically. If you change your whole-home price, these change with it.
        </p>
        {baseValue != null &&
          ROOM_TYPES.some(
            (r) => rooms[tab][r.key].text != null || Math.abs(rooms[tab][r.key].percent - DEFAULT_ROOM_PERCENTS[tab][r.key]) >= 0.00005
          ) && (
            <button
              type="button"
              onClick={() => {
                edited()
                setRooms((prev) => ({ ...prev, [tab]: roomsFrom(DEFAULT_ROOM_PERCENTS[tab]) }))
              }}
              className="mb-3 text-xs font-semibold text-brand border border-brand/30 rounded-xl px-3 py-2"
            >
              Use suggested prices for all rooms?
            </button>
          )}
        {baseValue == null ? (
          <p className="text-sm text-slate-500 rounded-2xl bg-slate-50 px-4 py-3">Enter your whole-home price first.</p>
        ) : (
          <div className="flex flex-col divide-y divide-slate-100 border border-slate-100 rounded-2xl">
            {ROOM_TYPES.map((r) => {
              const room = rooms[tab][r.key]
              const shown = room.text ?? roomPriceForPercent(baseValue, room.percent).toFixed(2)
              const problem = room.text != null ? roomError(tab, room.text) : null
              const suggested = roomPriceForPercent(baseValue, DEFAULT_ROOM_PERCENTS[tab][r.key])
              const isSuggested = room.text == null && Math.abs(room.percent - DEFAULT_ROOM_PERCENTS[tab][r.key]) < 0.00005
              return (
                <div key={r.key} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex-1 text-sm text-slate-800">{r.label}</span>
                    <label className="flex items-center rounded-xl border border-slate-200 px-2.5 py-1.5 w-28 focus-within:border-brand">
                      <span className="sr-only">{r.label}: what you earn</span>
                      <span className="text-slate-400 text-sm mr-0.5">$</span>
                      <input
                        inputMode="decimal"
                        value={shown}
                        onChange={(e) => {
                          edited()
                          const text = e.target.value
                          setRooms((prev) => ({ ...prev, [tab]: { ...prev[tab], [r.key]: { ...prev[tab][r.key], text } } }))
                        }}
                        onBlur={() => commitRoom(tab, r.key)}
                        className="w-full outline-none text-right text-sm text-slate-900 bg-transparent"
                      />
                    </label>
                  </div>
                  <div className="flex items-center justify-between mt-1 text-xs">
                    <span className={problem ? 'text-red-600' : 'text-slate-500'}>
                      {problem ?? (isSuggested ? 'Tydio’s suggested price' : ' ')}
                    </span>
                    {!isSuggested && (
                      <button
                        type="button"
                        onClick={() => {
                          edited()
                          setRooms((prev) => ({
                            ...prev,
                            [tab]: { ...prev[tab], [r.key]: { percent: DEFAULT_ROOM_PERCENTS[tab][r.key], text: null } },
                          }))
                        }}
                        className="text-brand font-semibold ml-2 flex-shrink-0"
                      >
                        Use suggested {money(suggested)}?
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Add-ons */}
      <section className="mb-8" aria-labelledby="addons-heading">
        <h2 id="addons-heading" className="text-base font-bold text-slate-900 mb-1">Add-ons</h2>
        <p className="text-xs text-slate-500 mb-3">
          What you earn per item, the same whatever the home size. Turn off any you don&apos;t do. Add-on prices are shared
          by Standard and Deep Cleaning.
          {tab === 'deep' && ' Detailed baseboards, blinds, ceiling fans, doors and wall spot-cleaning are part of Deep Cleaning, so they aren’t sold as add-ons on it.'}
        </p>
        {ADD_ONS.some((a) => !isSuggestedAddOn(a.key)) && (
          <button
            type="button"
            onClick={() => {
              edited()
              setAddOns((prev) =>
                Object.fromEntries(
                  ADD_ONS.map((a) => [a.key, { ...prev[a.key], takeHome: defaultTakeHome(a.defaultCustomerPrice).toFixed(2) }])
                ) as Record<AddOnKey, { enabled: boolean; takeHome: string }>
              )
            }}
            className="mb-3 text-xs font-semibold text-brand border border-brand/30 rounded-xl px-3 py-2"
          >
            Use suggested prices for all add-ons?
          </button>
        )}
        <div className="flex flex-col divide-y divide-slate-100 border border-slate-100 rounded-2xl">
          {addOnsForTab.map((a) => {
            const state = addOns[a.key]
            const amount = parseAmount(state.takeHome)
            const valid = amount != null && amount > 0 && amount <= 500
            return (
              <div key={a.key} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={state.enabled}
                      onChange={(e) => {
                        edited()
                        setAddOns((prev) => ({ ...prev, [a.key]: { ...prev[a.key], enabled: e.target.checked } }))
                      }}
                      className="w-4 h-4 accent-[var(--color-brand)] flex-shrink-0"
                    />
                    <span className="text-sm text-slate-800">
                      {a.label}
                      {a.services.length === 1 && <span className="block text-[11px] text-slate-400">Standard Cleaning only</span>}
                    </span>
                  </label>
                  <label
                    className={`flex items-center rounded-xl border border-slate-200 px-2.5 py-1.5 w-24 focus-within:border-brand ${
                      state.enabled ? '' : 'opacity-40'
                    }`}
                  >
                    <span className="sr-only">{a.label}: what you earn per {a.unit}</span>
                    <span className="text-slate-400 text-sm mr-0.5">$</span>
                    <input
                      inputMode="decimal"
                      disabled={!state.enabled}
                      value={state.takeHome}
                      onChange={(e) => {
                        edited()
                        setAddOns((prev) => ({ ...prev, [a.key]: { ...prev[a.key], takeHome: e.target.value } }))
                      }}
                      className="w-full outline-none text-right text-sm text-slate-900 bg-transparent"
                    />
                  </label>
                </div>
                {state.enabled && (
                  <div className="flex items-center justify-between mt-1 text-xs">
                    <span className={valid ? 'text-slate-500' : 'text-red-600'}>
                      {valid
                        ? `Per ${a.unit}${isSuggestedAddOn(a.key) ? ' · Tydio’s suggested price' : ''}`
                        : 'Enter a price over $0 and up to $500'}
                    </span>
                    {!isSuggestedAddOn(a.key) && (
                      <button
                        type="button"
                        onClick={() => resetAddOnPrice(a.key)}
                        className="text-brand font-semibold ml-2 flex-shrink-0"
                      >
                        Use suggested {money(defaultTakeHome(a.defaultCustomerPrice))}?
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <p className="text-xs text-slate-500 leading-relaxed mb-5">
        Price changes apply to new requests and to upcoming visits of recurring bookings that haven&apos;t been charged yet.
        Bookings already paid keep the price they were booked at.
      </p>

      {message && (
        <p role="alert" className={`text-sm mb-4 ${message.type === 'error' ? 'text-red-500' : 'text-emerald-600'}`}>
          {message.text}
        </p>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="w-full py-3.5 rounded-2xl text-white font-semibold text-sm disabled:opacity-40 transition-opacity bg-brand"
      >
        {isPending ? 'Saving…' : 'Save prices'}
      </button>

      <p className="text-xs text-slate-500 text-center mt-5">
        Don&apos;t offer one of these?{' '}
        <Link href="/pro/profile/services" className="text-brand font-semibold underline">
          Remove it from your services
        </Link>
      </p>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main id="main-content" className="min-h-svh bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-10 pb-16 max-w-sm mx-auto w-full">
        <Link href="/pro/profile/services" className="flex items-center gap-1.5 mb-6 text-sm text-slate-500">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 12L6 8l4-4" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to Services Provided
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Standard &amp; Deep Cleaning prices</h1>
        {children}
      </div>
    </main>
  )
}
