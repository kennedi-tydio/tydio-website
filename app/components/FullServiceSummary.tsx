import Link from 'next/link'
import {
  FULL_SERVICE_LABEL,
  SCOPE_EXCLUSIONS_NOTE,
  SERVICE_SCOPE,
  priorityLabel,
  quantityLabel,
  scopeLabel,
  selectedAddOns,
  type FullServiceSelection,
} from '@/lib/fullService'

// A priced line from lib/fullServicePricing (or a booking's snapshot).
export type SummaryLine = { kind: 'home' | 'room' | 'addon'; label: string; quantity: number; customer_price: number; take_home?: number }

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

// The Standard / Deep Cleaning part of a booking: what's being cleaned, the
// add-ons, the customer's priorities and what the service includes.
//
// With `lines` (a Tidy Pro has been chosen) each line shows its price; without
// them (before choosing) add-ons show no price, since every Tidy Pro sets
// their own. `showTakeHome` is for the Tidy Pro's own screens.
export default function FullServiceSummary({
  selection,
  lines,
  editHref,
  showTakeHome = false,
  showPrices = true,
  showScope = true,
  className = '',
}: {
  selection: Pick<FullServiceSelection, 'type' | 'scope' | 'rooms' | 'addOns' | 'priorities'>
  lines?: SummaryLine[] | null
  editHref?: string
  showTakeHome?: boolean
  // False on the Tidy Pro's own screens, which show their earnings instead.
  showPrices?: boolean
  showScope?: boolean
  className?: string
}) {
  const sel = { ...selection, version: 1 as const, step: 'notes' as const }
  const label = FULL_SERVICE_LABEL[sel.type]
  const price = (line: SummaryLine) => (showTakeHome && line.take_home != null ? line.take_home : line.customer_price)

  return (
    <div className={`rounded-2xl border border-slate-100 px-4 py-3.5 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">{label}</p>
          <p className="text-xs text-slate-500 mt-0.5">{scopeLabel(sel)}</p>
        </div>
        {editHref && (
          <Link href={editHref} className="text-xs font-semibold text-brand flex-shrink-0">
            Edit
          </Link>
        )}
      </div>

      {lines && lines.length > 0 ? (
        <ul className="flex flex-col gap-1 mb-2">
          {lines.map((line) => (
            <li key={`${line.kind}-${line.label}`} className="flex items-start justify-between gap-3 text-sm">
              <span className="text-slate-700">
                {line.kind === 'home' ? 'Entire home' : line.label}
                {line.quantity > 1 && <span className="text-slate-400"> × {line.quantity}</span>}
                {line.kind === 'addon' && <span className="block text-[11px] text-slate-400">Add-on</span>}
              </span>
              {showPrices && <span className="text-slate-900 font-semibold flex-shrink-0">{money(price(line))}</span>}
            </li>
          ))}
        </ul>
      ) : (
        selectedAddOns(sel).length > 0 && (
          <ul className="flex flex-col gap-1 mb-2">
            {selectedAddOns(sel).map(({ addOn, quantity }) => (
              <li key={addOn.key} className="flex items-start justify-between gap-3 text-sm">
                <span className="text-slate-700">
                  {addOn.label}
                  <span className="text-slate-400"> · {quantityLabel(quantity, addOn.unit, addOn.unitPlural)}</span>
                </span>
              </li>
            ))}
          </ul>
        )
      )}

      {sel.priorities.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-slate-700 mb-0.5">What matters most</p>
          <ul className="list-disc pl-4 text-xs text-slate-500 leading-relaxed">
            {sel.priorities.map((p) => (
              <li key={p}>{priorityLabel(p)}</li>
            ))}
          </ul>
        </div>
      )}

      {showScope && (
        <details className="mt-2 group">
          <summary className="text-xs font-semibold text-brand cursor-pointer list-none">
            What&apos;s included in {label}
          </summary>
          <ul className="list-disc pl-4 mt-1.5 text-xs text-slate-500 leading-relaxed">
            {SERVICE_SCOPE[sel.type].map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="text-[11px] text-slate-400 mt-1.5">{SCOPE_EXCLUSIONS_NOTE}</p>
        </details>
      )}
    </div>
  )
}
