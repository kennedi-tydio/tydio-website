import {
  ADD_ONS,
  DEFAULT_ROOM_PERCENTS,
  FULL_SERVICE_LABEL,
  FULL_SERVICE_TYPES,
  ROOM_TYPES,
  customerPriceForTakeHome,
  defaultTakeHome,
  roomPriceForPercent,
  type FullServiceType,
} from '@/lib/fullService'
import type { FullServiceRates } from '@/lib/fullServiceRates'
import { normalizeServices } from '@/lib/tidyProServices'

export function money(n: number): string {
  return `$${n.toFixed(2)}`
}

// "$120.00 → $150.00": what the Tidy Pro takes home, then what the customer pays.
export function PricePair({ takeHome }: { takeHome: number }) {
  return (
    <span className="tabular-nums whitespace-nowrap">
      <span className="text-slate-700">{money(takeHome)}</span>
      <span className="text-slate-400"> → {money(customerPriceForTakeHome(takeHome))}</span>
    </span>
  )
}

function offers(servicesProvided: unknown, type: FullServiceType): boolean {
  return normalizeServices(servicesProvided).includes(type === 'deep' ? 'deepCleaning' : 'standardCleaning')
}

const CUSTOM = <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-brand">Custom</span>

// Every price a Tidy Pro has set on Services → Pricing, for the admin profile page.
export default function ProPrices({ rates, servicesProvided }: { rates: FullServiceRates; servicesProvided: unknown }) {
  const priced = FULL_SERVICE_TYPES.filter((t) => rates[t])

  return (
    <section aria-labelledby="prices-heading" className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 id="prices-heading" className="font-semibold text-slate-900">Prices</h2>
      <p className="text-xs text-slate-400 mt-0.5 mb-4">
        Take-home → customer pays (take-home ÷ 0.8). Whole-home and room prices are before the home-size adjustment. &ldquo;Custom&rdquo; means they changed Tydio&apos;s default.
      </p>

      {FULL_SERVICE_TYPES.map((type) => {
        const r = rates[type]
        return (
          <div key={type} className="mb-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-1.5">{FULL_SERVICE_LABEL[type]}</h3>
            {!r ? (
              <p className="text-sm text-slate-400">
                {offers(servicesProvided, type) ? 'Offered but not priced yet, so they can’t be booked for it' : 'Not offered'}
              </p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-50">
                  <tr>
                    <td className="py-1 font-medium text-slate-700">Entire home</td>
                    <td className="py-1 text-right">
                      <PricePair takeHome={r.baseTakeHome} />
                    </td>
                  </tr>
                  {ROOM_TYPES.map((room) => {
                    const pct = r.roomPercents[room.key]
                    const custom = Math.abs(pct - DEFAULT_ROOM_PERCENTS[type][room.key]) > 0.00005
                    return (
                      <tr key={room.key}>
                        <td className="py-1 text-slate-600">
                          {room.label}
                          {custom && CUSTOM}
                        </td>
                        <td className="py-1 text-right">
                          <PricePair takeHome={roomPriceForPercent(r.baseTakeHome, pct)} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )
      })}

      <h3 className="text-sm font-semibold text-slate-900 mb-1.5">Add-ons</h3>
      {priced.length === 0 ? (
        <p className="text-sm text-slate-400">Only sold with Standard or Deep Cleaning, which they haven&apos;t priced</p>
      ) : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-50">
            {ADD_ONS.filter((a) => a.services.some((s) => rates[s])).map((a) => {
              const rate = rates.addOns[a.key]
              const custom = rate.takeHome !== defaultTakeHome(a.defaultCustomerPrice)
              return (
                <tr key={a.key}>
                  <td className="py-1 text-slate-600">
                    {a.label}
                    <span className="text-xs text-slate-400"> / {a.unit}</span>
                    {a.services.length === 1 && <span className="text-xs text-slate-400"> · Standard only</span>}
                    {rate.enabled && custom && CUSTOM}
                  </td>
                  <td className="py-1 text-right">
                    {rate.enabled ? <PricePair takeHome={rate.takeHome} /> : <span className="text-slate-400">Not offered</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}
